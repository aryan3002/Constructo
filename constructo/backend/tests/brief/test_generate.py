"""build_brief integration tests (DB + FakeLLMClient, no network)."""
from datetime import date
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import select

from app.brief.generate import build_brief
from app.contracts.events import EventType
from app.extraction.llm import FakeLLMClient
from app.models import OwnerBrief, SiteEventModel

DAY = date(2026, 5, 27)


@pytest_asyncio.fixture
async def company_with_sites(factory):
    company = await factory.company()
    site_a = await factory.site(company, name="Tower A")
    site_b = await factory.site(company, name="Tower B")
    return company, site_a, site_b


async def _add_event(
    session,
    site_id,
    event_type: EventType,
    *,
    fields=None,
    confidence=0.9,
    needs_clarification=False,
    occurred_on=DAY,
    summary="x",
):
    model = SiteEventModel(
        id=uuid4(),
        site_id=site_id,
        event_type=event_type.value,
        occurred_on=occurred_on,
        summary=summary,
        fields=fields or {},
        confidence=confidence,
        needs_clarification=needs_clarification,
        source_message_ids=[uuid4()],
    )
    session.add(model)
    await session.flush()
    return model


async def test_build_brief_payload_and_persists(db_session, company_with_sites):
    company, site_a, site_b = company_with_sites
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 12})
    await _add_event(
        db_session, site_a.id, EventType.invoice_received, fields={"vendor": "Acme", "amount": 5000}
    )
    await _add_event(
        db_session, site_a.id, EventType.material_delivery, fields={"vendor": "Acme"}
    )
    await _add_event(db_session, site_b.id, EventType.payment_request, fields={"amount": 3000})

    fake = FakeLLMClient(canned={"text": "Subah ka brief: dekhiye exceptions."})
    result = await build_brief(db_session, company.id, DAY, llm=fake)

    assert set(result.keys()) == {"payload", "text", "brief_id"}
    payload = result["payload"]
    assert payload["brief_date"] == DAY.isoformat()

    sites = {s["name"]: s for s in payload["sites"]}
    assert "Tower A" in sites and "Tower B" in sites
    a = sites["Tower A"]
    assert a["site_id"] == str(site_a.id)
    assert a["counts"] == {"attendance": 1, "deliveries": 1, "issues": 0}
    assert len(a["top_risks"]) <= 3
    # site A invoice has a matching Acme delivery -> not unverified
    assert "unverified_invoice" not in {r["kind"] for r in a["top_risks"]}

    b = sites["Tower B"]
    assert "pending_approval" in {r["kind"] for r in b["top_risks"]}

    # text rendered via the fake LLM
    assert result["text"] == "Subah ka brief: dekhiye exceptions."
    assert fake.calls, "LLM should have been invoked"

    # persisted OwnerBrief row
    row = await db_session.get(OwnerBrief, result["brief_id"])
    assert row is not None
    assert row.company_id == company.id
    assert row.brief_date == DAY
    assert row.payload["text"] == result["text"]


async def test_build_brief_caps_top_risks_at_three(db_session, company_with_sites):
    company, site_a, _ = company_with_sites
    # generate >3 distinct risks on one site
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 2})
    await _add_event(
        db_session, site_a.id, EventType.invoice_received, fields={"vendor": "V", "amount": 1}
    )
    await _add_event(db_session, site_a.id, EventType.payment_request, fields={"amount": 1})
    await _add_event(db_session, site_a.id, EventType.issue, confidence=0.2)

    fake = FakeLLMClient(canned={"text": "brief"})
    result = await build_brief(db_session, company.id, DAY, llm=fake)
    a = next(s for s in result["payload"]["sites"] if s["site_id"] == str(site_a.id))
    assert len(a["top_risks"]) <= 3


async def test_build_brief_empty_company_produces_no_sites_with_events(db_session, factory):
    company = await factory.company()
    fake = FakeLLMClient(canned={"text": "no activity"})
    result = await build_brief(company_id=company.id, session=db_session, brief_date=DAY, llm=fake)
    assert result["payload"]["sites"] == []
    row = await db_session.get(OwnerBrief, result["brief_id"])
    assert row is not None


async def test_build_brief_only_includes_brief_date_events(db_session, company_with_sites):
    company, site_a, _ = company_with_sites
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 10})
    await _add_event(
        db_session, site_a.id, EventType.attendance, fields={"headcount": 99},
        occurred_on=date(2026, 5, 26),
    )
    fake = FakeLLMClient(canned={"text": "x"})
    result = await build_brief(db_session, company.id, DAY, llm=fake)
    a = next(s for s in result["payload"]["sites"] if s["site_id"] == str(site_a.id))
    assert a["counts"]["attendance"] == 1


async def test_build_brief_default_llm_when_none(db_session, company_with_sites):
    """Falls back to get_llm_client() (FakeLLMClient with no key) when llm omitted."""
    company, site_a, _ = company_with_sites
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 10})
    result = await build_brief(db_session, company.id, DAY)
    assert isinstance(result["text"], str)
    assert result["text"]


async def test_build_brief_other_company_events_excluded(db_session, factory):
    company_a = await factory.company(name="A Co")
    company_b = await factory.company(name="B Co")
    site_a = await factory.site(company_a, name="A Site")
    site_b = await factory.site(company_b, name="B Site")
    await _add_event(db_session, site_a.id, EventType.attendance, fields={"headcount": 5})
    await _add_event(db_session, site_b.id, EventType.attendance, fields={"headcount": 5})

    fake = FakeLLMClient(canned={"text": "x"})
    result = await build_brief(db_session, company_a.id, DAY, llm=fake)
    names = {s["name"] for s in result["payload"]["sites"]}
    assert names == {"A Site"}


async def test_build_brief_evidence_ids_exist_in_input(db_session, company_with_sites):
    company, site_a, _ = company_with_sites
    ev = await _add_event(
        db_session, site_a.id, EventType.payment_request, fields={"amount": 100}
    )
    fake = FakeLLMClient(canned={"text": "x"})
    result = await build_brief(db_session, company.id, DAY, llm=fake)
    a = next(s for s in result["payload"]["sites"] if s["site_id"] == str(site_a.id))
    all_evidence = {eid for r in a["top_risks"] for eid in r["evidence_event_ids"]}
    assert str(ev.id) in all_evidence


# verify the brief_id stored is queryable and payload sites carry counts
async def test_persisted_payload_matches_returned(db_session, company_with_sites):
    company, site_a, _ = company_with_sites
    await _add_event(db_session, site_a.id, EventType.material_delivery, fields={"vendor": "X"})
    fake = FakeLLMClient(canned={"text": "y"})
    result = await build_brief(db_session, company.id, DAY, llm=fake)
    rows = (
        await db_session.execute(select(OwnerBrief).where(OwnerBrief.company_id == company.id))
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].payload["sites"] == result["payload"]["sites"]
