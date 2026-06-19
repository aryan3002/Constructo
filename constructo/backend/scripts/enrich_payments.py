"""Derive **Payment** tracking rows from invoice site-events (DETERMINISTIC).

Ninth-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): every ``invoice_received`` site event the
extraction pipeline already produced becomes a :class:`Payment` *tracking* row
(Constructo never moves money — this is reconciliation visibility only). Amount,
vendor and currency come straight off the event's extracted ``fields``; the date
comes from ``occurred_on``.

NO LLM, NO FABRICATION (Determinism Doctrine): this pass is pure projection of
already-extracted facts. A site with no invoice events yields zero rows
(asserted by the test). Every row uses a deterministic ``uuid5`` id derived from
its source event id, so re-running upserts the same rows and never duplicates.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_payments
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from decimal import Decimal, InvalidOperation
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Payment, PaymentDirection, PaymentStatus, Site, SiteEventModel

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

_DEFAULT_VENDOR = "Unknown vendor"


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _to_decimal(value) -> Decimal:
    """Coerce an extracted amount to Decimal; unknown/garbage → 0.00 (grounded).

    The amount column is NOT NULL, so an invoice whose amount the extractor could
    not read is recorded at 0.00 (an explicit "amount unknown") rather than
    dropped — the invoice still happened.
    """
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update by primary-key id (idempotent re-runs)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Project every invoice_received event into a Payment tracking row.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_documents``); defaults to the real ``SessionLocal``.
    Returns ``{"invoices", "payments"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    invoices = payments = 0

    async with session_factory() as s:
        site = await s.get(Site, site_id)
        if site is not None:
            company_id = site.company_id

        events = (
            await s.execute(
                select(SiteEventModel)
                .where(
                    SiteEventModel.site_id == site_id,
                    SiteEventModel.event_type == "invoice_received",
                )
                .order_by(SiteEventModel.occurred_on)
            )
        ).scalars().all()

        if not events:
            return {"invoices": 0, "payments": 0}

        for ev in events:
            invoices += 1
            fields = ev.fields or {}
            vendor = (str(fields.get("vendor")).strip() if fields.get("vendor") else "") \
                or _DEFAULT_VENDOR
            currency = (str(fields.get("currency")).strip() if fields.get("currency") else "") \
                or "INR"
            ref = fields.get("invoice_number")

            await _upsert(
                s,
                Payment,
                _id("payment", str(ev.id)),
                company_id=company_id,
                site_id=site_id,
                # An invoice received is the contractor paying a supplier.
                direction=PaymentDirection.contractor_to_supplier,
                counterparty_name=vendor[:200],
                amount=_to_decimal(fields.get("amount")),
                currency=currency[:8],
                paid_on=ev.occurred_on,
                method=None,
                reference_no=(str(ref).strip()[:200] if ref else None),
                # Tracking-only: an invoice is recorded, not confirmed-paid (no
                # real settlement signal exists in the chat). The doctrine forbids
                # inventing a "confirmed" state we did not observe.
                status=PaymentStatus.recorded,
                notes=(ev.summary or "").strip()[:500] or None,
                source_event_id=ev.id,
            )
            payments += 1

        await s.commit()

    return {"invoices": invoices, "payments": payments}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched payments:", counts)


if __name__ == "__main__":
    main()
