"""draft_dpr() unit tests (DB + FakeLLMClient, no network)."""
from datetime import date
from uuid import uuid4

from app.contracts.events import EventType
from app.dpr.draft import draft_dpr
from app.extraction.llm import FakeLLMClient
from app.models import SiteEventModel

DAY = date(2026, 5, 27)


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


async def test_draft_from_a_days_events(db_session, factory):
    """A day of events → deterministic structured sections + cited evidence."""
    company = await factory.company()
    site = await factory.site(company, name="Tower A")

    a1 = await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 18}, summary="18 mazdoor aaye",
    )
    a2 = await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 6}, summary="6 mistri aaye",
    )
    m1 = await _add_event(
        db_session, site.id, EventType.material_delivery,
        fields={"material": "cement", "quantity": 280, "unit": "bag", "vendor": "Acme"},
        summary="cement 280 bori",
    )
    p1 = await _add_event(
        db_session, site.id, EventType.progress_update,
        fields={"description": "3rd floor plastering 60%"},
        summary="teesri manzil plaster 60%",
    )
    i1 = await _add_event(
        db_session, site.id, EventType.issue,
        fields={"description": "water leak"}, summary="paani leak",
    )

    fake = FakeLLMClient(canned={"summary": "Aaj 24 site par, cement aaya, ek dikkat."})
    drafted = await draft_dpr(db_session, site.id, DAY, llm=fake)

    s = drafted.sections
    # Labour: headcount is the SUM of the day's confirmed attendance counts.
    assert s["labor"]["headcount"] == 24
    assert len(s["labor"]["entries"]) == 2
    # Materials from the delivery.
    assert len(s["materials"]["deliveries"]) == 1
    assert s["materials"]["deliveries"][0]["material"] == "cement"
    assert s["materials"]["deliveries"][0]["quantity"] == 280.0
    # Work done + blockers.
    assert len(s["work_done"]["items"]) == 1
    assert len(s["blockers"]["items"]) == 1
    # 'next' surfaces a follow-up for the open blocker (deterministic).
    assert any("water leak" in n for n in s["next"]["items"])
    # Prose summary from the injected fake.
    assert s["summary"] == "Aaj 24 site par, cement aaya, ek dikkat."

    # Evidence anchors every cited event.
    ids = set(drafted.evidence_event_ids)
    assert ids == {str(a1.id), str(a2.id), str(m1.id), str(p1.id), str(i1.id)}


async def test_empty_day_is_honest_not_invented(db_session, factory):
    """A no-events day → honest minimal draft, never padded fiction."""
    company = await factory.company()
    site = await factory.site(company, name="Quiet Site")

    # A network-free fake that would HALLUCINATE if it were ever called.
    fake = FakeLLMClient(canned={"summary": "Massive progress on all floors today!"})
    drafted = await draft_dpr(db_session, site.id, DAY, llm=fake)

    s = drafted.sections
    assert s["labor"]["headcount"] is None
    assert s["labor"]["entries"] == []
    assert s["materials"]["deliveries"] == []
    assert s["work_done"]["items"] == []
    assert s["blockers"]["items"] == []
    assert s["next"]["items"] == []
    assert drafted.evidence_event_ids == []
    # The honest minimal summary — NOT the hallucinated canned text. The model
    # is never invited to invent a narrative from an empty day.
    assert s["summary"] == "No site activity recorded."
    assert fake.calls == []  # the LLM was not consulted on a thin day


async def test_fallback_summary_when_llm_returns_bad_shape(db_session, factory):
    """A garbage LLM response degrades to the deterministic fallback, not noise."""
    company = await factory.company()
    site = await factory.site(company, name="Tower B")
    await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 12}, summary="12 aaye",
    )

    fake = FakeLLMClient(canned={"not_summary": "oops"})
    drafted = await draft_dpr(db_session, site.id, DAY, llm=fake)
    # Deterministic fallback reports only the real structured facts.
    assert drafted.sections["summary"].startswith("Today:")
    assert "12 on site" in drafted.sections["summary"]


async def test_only_that_days_events_are_used(db_session, factory):
    """Events on other dates never bleed into a day's DPR."""
    company = await factory.company()
    site = await factory.site(company, name="Tower C")
    today = await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 10}, summary="today", occurred_on=DAY,
    )
    await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 99}, summary="yesterday", occurred_on=date(2026, 5, 26),
    )

    fake = FakeLLMClient(canned={"summary": "ok"})
    drafted = await draft_dpr(db_session, site.id, DAY, llm=fake)
    assert drafted.sections["labor"]["headcount"] == 10
    assert drafted.evidence_event_ids == [str(today.id)]
