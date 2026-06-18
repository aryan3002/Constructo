"""Payment-enrichment pass (scripts.enrich_payments) — deterministic, no LLM.

Seeds the imported company/site + two ``invoice_received`` site events (one with
an amount/vendor, one without) and asserts:
  * a Payment row is created per invoice event (vendor/amount/date projected),
  * the amount-less invoice still records a row (amount 0.00, fallback vendor),
  * a second run() creates no duplicates (uuid5 idempotency), and
  * a site with no invoice events yields zero payments.
"""
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import func, select

import scripts.enrich_payments as ep
from app.models import (
    Company,
    Payment,
    PaymentDirection,
    PaymentStatus,
    Site,
    SiteEventModel,
)


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


async def _seed(db_session, *, with_invoices: bool = True) -> Site:
    """Imported company + site (+ optional two invoice_received events)."""
    company = Company(id=ep._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ep._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    if with_invoices:
        db_session.add(
            SiteEventModel(
                id=uuid4(),
                site_id=site.id,
                event_type="invoice_received",
                occurred_on=date(2026, 3, 10),
                summary="Tax invoice from Sharma Cement — Rs 45,000",
                fields={"vendor": "Sharma Cement", "amount": 45000, "currency": "INR"},
                confidence=0.8,
                source_message_ids=[],
            )
        )
        db_session.add(
            SiteEventModel(
                id=uuid4(),
                site_id=site.id,
                event_type="invoice_received",
                occurred_on=date(2026, 3, 14),
                summary="Bill received (amount unreadable)",
                fields={"vendor": None, "amount": None, "currency": "INR"},
                confidence=0.6,
                source_message_ids=[],
            )
        )
        # A non-invoice event must be ignored by this pass.
        db_session.add(
            SiteEventModel(
                id=uuid4(),
                site_id=site.id,
                event_type="progress_update",
                occurred_on=date(2026, 3, 12),
                summary="Slab casting done",
                fields={},
                confidence=0.7,
                source_message_ids=[],
            )
        )
    await db_session.flush()
    return site


async def test_enrich_payments_creates_one_per_invoice(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await ep.run(session_factory=sf)

    assert counts["invoices"] == 2
    assert counts["payments"] == 2

    rows = (
        await db_session.execute(select(Payment).where(Payment.site_id == site.id))
    ).scalars().all()
    assert len(rows) == 2
    assert all(p.company_id == ep._id("company") for p in rows)
    assert all(p.direction == PaymentDirection.contractor_to_supplier for p in rows)
    assert all(p.status == PaymentStatus.recorded for p in rows)
    assert all(p.source_event_id is not None for p in rows)

    by_vendor = {p.counterparty_name: p for p in rows}
    assert by_vendor["Sharma Cement"].amount == Decimal("45000")
    assert by_vendor["Sharma Cement"].paid_on == date(2026, 3, 10)
    # The amount-less invoice still records, at 0.00 with the fallback vendor.
    fallback = by_vendor[ep._DEFAULT_VENDOR]
    assert fallback.amount == Decimal("0")


async def test_enrich_payments_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await ep.run(session_factory=sf)
    second = await ep.run(session_factory=sf)  # re-run upserts the same rows

    assert second["payments"] == 2
    n = (
        await db_session.execute(
            select(func.count()).select_from(Payment).where(Payment.site_id == site.id)
        )
    ).scalar()
    assert n == 2  # not 4


async def test_enrich_payments_no_invoices_is_zero(db_session):
    site = await _seed(db_session, with_invoices=False)

    counts = await ep.run(session_factory=_session_factory(db_session))

    assert counts == {"invoices": 0, "payments": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(Payment).where(Payment.site_id == site.id)
        )
    ).scalar()
    assert n == 0
