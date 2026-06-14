"""Tests for app/reports/builders.py — deterministic DPR-pack + progress builders.

These tests are TDD: they were written before the module existed.
They use the repo's real async DB fixtures (db_session, factory).
No numbers are recomputed here; the builders must read existing computed values.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.contracts.events import EventType
from app.extraction.llm import FakeLLMClient
from app.models import (
    Dpr,
    DprStatus,
    Payment,
    PaymentDirection,
    PaymentStatus,
    SiteEventModel,
    SiteFinancials,
)

DAY = date(2026, 6, 10)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


async def _add_event(
    session,
    site_id,
    event_type: EventType,
    *,
    fields=None,
    summary="x",
    occurred_on=DAY,
):
    model = SiteEventModel(
        id=uuid4(),
        site_id=site_id,
        event_type=event_type.value,
        occurred_on=occurred_on,
        summary=summary,
        fields=fields or {},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[uuid4()],
    )
    session.add(model)
    await session.flush()
    return model


async def _seed_dpr(session, site, *, status=DprStatus.draft) -> Dpr:
    """Seed a DPR row directly for a site so we can test build_dpr_pack
    without invoking the LLM draft path."""
    await _add_event(
        session,
        site.id,
        EventType.attendance,
        fields={"headcount": 12},
        summary="12 mazdoor",
    )
    await _add_event(
        session,
        site.id,
        EventType.material_delivery,
        fields={"material": "cement", "quantity": 100, "unit": "bag", "vendor": "Acme"},
        summary="cement 100 bag",
    )
    from app.dpr.draft import draft_dpr

    fake = FakeLLMClient(canned={"summary": "Aaj 12 on site, cement aaya."})
    drafted = await draft_dpr(session, site.id, DAY, llm=fake)
    dpr = Dpr(
        site_id=drafted.site_id,
        report_date=drafted.report_date,
        sections=drafted.sections,
        status=status,
        evidence_event_ids=drafted.evidence_event_ids,
    )
    session.add(dpr)
    await session.flush()
    return dpr


# ---------------------------------------------------------------------------
# Task 3 tests — build_dpr_pack
# ---------------------------------------------------------------------------


async def test_build_dpr_pack_returns_required_keys(db_session, factory):
    """build_dpr_pack returns a dict with company, site, date, and sections."""
    from app.reports.builders import build_dpr_pack

    company = await factory.company(name="CivilArch Builders")
    site = await factory.site(company, name="Tower A")
    await _seed_dpr(db_session, site)
    await db_session.flush()

    pack = await build_dpr_pack(db_session, site.id, DAY.isoformat())

    # Top-level company info
    assert pack["company"]["name"] == "CivilArch Builders"
    # site info
    assert pack["site"]["name"] == "Tower A"
    assert pack["site"]["id"] == str(site.id)
    # date
    assert pack["date"] == DAY.isoformat()
    # sections must contain the required keys
    required_section_keys = {"labor", "materials", "work_done", "blockers", "summary"}
    assert required_section_keys.issubset(set(pack["sections"].keys()))
    # labor headcount was seeded as 12
    assert pack["sections"]["labor"]["headcount"] == 12
    # materials has one delivery
    assert len(pack["sections"]["materials"]["deliveries"]) == 1
    # status is present
    assert pack["status"] in ("draft", "sent")


async def test_build_dpr_pack_no_dpr_returns_draft(db_session, factory):
    """build_dpr_pack falls back to a draft (via draft_dpr) when no stored DPR exists."""
    from app.reports.builders import build_dpr_pack

    company = await factory.company(name="NoRecord Co")
    site = await factory.site(company, name="Empty Site")
    # No DPR seeded — should still return something (draft from events or empty)
    # Add at least one event so the draft is non-trivial
    await _add_event(
        db_session,
        site.id,
        EventType.progress_update,
        summary="foundation work done",
    )
    await db_session.flush()

    pack = await build_dpr_pack(db_session, site.id, DAY.isoformat())
    assert "sections" in pack
    assert "labor" in pack["sections"]
    assert "summary" in pack["sections"]
    assert pack["site"]["name"] == "Empty Site"


# ---------------------------------------------------------------------------
# Task 3 tests — build_progress
# ---------------------------------------------------------------------------


async def test_build_progress_returns_required_shape(db_session, factory):
    """build_progress returns {company, range, sites:[{name, stage, money, ...}]}."""
    from app.reports.builders import build_progress

    company = await factory.company(name="Progress Builders")
    site_a = await factory.site(company, name="Site Alpha")
    site_b = await factory.site(company, name="Site Beta")

    # Add some events so there is data
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 8})
    await _add_event(db_session, site_b.id, EventType.attendance, fields={"headcount": 5})

    # Add financials for site_a
    fin = SiteFinancials(
        site_id=site_a.id,
        quotation_amount=Decimal("5000000"),
        billed_amount=Decimal("2000000"),
        currency="INR",
    )
    db_session.add(fin)

    # Add a received payment for site_a
    payment = Payment(
        company_id=company.id,
        site_id=site_a.id,
        direction=PaymentDirection.homeowner_to_contractor,
        counterparty_name="Owner",
        amount=Decimal("1000000"),
        currency="INR",
        paid_on=DAY,
        status=PaymentStatus.confirmed,
        created_by=None,
    )
    db_session.add(payment)
    await db_session.flush()

    result = await build_progress(
        db_session,
        company.id,
        site_id=None,  # all sites
        date_from="2026-06-01",
        date_to="2026-06-10",
    )

    # Top-level shape
    assert "company" in result
    assert result["company"]["name"] == "Progress Builders"
    assert result["range"]["from"] == "2026-06-01"
    assert result["range"]["to"] == "2026-06-10"
    assert "sites" in result

    site_names = [s["name"] for s in result["sites"]]
    assert "Site Alpha" in site_names
    assert "Site Beta" in site_names

    # Find site_a entry
    alpha = next(s for s in result["sites"] if s["name"] == "Site Alpha")

    # money must be present and tracking-only strings
    assert "money" in alpha
    money = alpha["money"]
    assert isinstance(money["received"], str)
    assert isinstance(money["outstanding"], str)
    # currency is present
    assert "currency" in money

    # stage is present (may be empty dict when no baseline set)
    assert "stage" in alpha

    # risks is a list
    assert isinstance(alpha["risks"], list)


async def test_build_progress_filters_to_single_site(db_session, factory):
    """When site_id is given, only that site appears in the result."""
    from app.reports.builders import build_progress

    company = await factory.company(name="Filter Co")
    site_x = await factory.site(company, name="Site X")
    site_y = await factory.site(company, name="Site Y")
    await _add_event(db_session, site_x.id, EventType.attendance, fields={"headcount": 3})
    await _add_event(db_session, site_y.id, EventType.attendance, fields={"headcount": 7})
    await db_session.flush()

    result = await build_progress(
        db_session,
        company.id,
        site_id=site_x.id,
        date_from="2026-06-01",
        date_to="2026-06-10",
    )

    assert len(result["sites"]) == 1
    assert result["sites"][0]["name"] == "Site X"


async def test_build_progress_money_strings_not_numbers(db_session, factory):
    """money values in build_progress must be strings (tracking display, not numbers)."""
    from app.reports.builders import build_progress

    company = await factory.company(name="String Money Co")
    site = await factory.site(company, name="Money Site")
    fin = SiteFinancials(
        site_id=site.id,
        quotation_amount=Decimal("1000000"),
        billed_amount=Decimal("500000"),
        currency="INR",
    )
    db_session.add(fin)
    await db_session.flush()

    result = await build_progress(
        db_session,
        company.id,
        site_id=site.id,
        date_from="2026-06-01",
        date_to="2026-06-10",
    )

    s = result["sites"][0]
    for key in ("received", "outstanding"):
        assert isinstance(s["money"][key], str), f"{key} must be a string"
    # quotation and billed are either str or None
    for key in ("quotation", "billed"):
        val = s["money"].get(key)
        if val is not None:
            assert isinstance(val, str), f"{key} must be str or None"
