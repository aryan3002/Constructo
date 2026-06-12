"""Nivaan answer loop: deterministic-first, abstain-over-invent, numeric-guarded."""
from datetime import date
from uuid import uuid4

from app.agent.nivaan import NivaanReply, parse_nivaan_invocation, run_nivaan_turn
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    MessageSide,
    SiteEventModel,
    UserRole,
)
from app.search.embeddings import FakeEmbeddings
from app.search.index_message import index_message


def _md(site_id, material, qty, unit="bori"):
    return SiteEventModel(
        site_id=site_id, event_type="material_delivery", occurred_on=date.today(),
        summary="material_delivery",
        fields={"material": material, "quantity": qty, "unit": unit},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


async def _site_conv(db_session, company, site, owner):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


def test_parse_invocation_strips_mention_and_slash():
    assert parse_nivaan_invocation("@nivaan how much cement?") == "how much cement?"
    assert parse_nivaan_invocation("/nivaan how much cement?") == "how much cement?"
    assert parse_nivaan_invocation("  @Nivaan  totals ") == "totals"
    assert parse_nivaan_invocation("just chatting") is None
    assert parse_nivaan_invocation(None) is None


async def test_deterministic_answer_is_grounded_by_construction(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add_all([_md(site.id, "cement", 50, "bori"), _md(site.id, "cement", 40, "bag")])
    await db_session.flush()

    reply = await run_nivaan_turn(db_session, owner, conv, "how much cement", llm=None)
    assert isinstance(reply, NivaanReply)
    assert "90" in reply.body  # 50 bori + 40 bag canonicalized
    assert reply.meta["nivaan"]["tool"] == "aggregate"


async def test_unanswerable_abstains_without_inventing(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    # No events, no llm → terminal clarify; never a fabricated number.
    reply = await run_nivaan_turn(db_session, owner, conv, "how much cement", llm=None)
    assert reply.meta["nivaan"]["kind"] == "clarify"
    assert not any(ch.isdigit() for ch in reply.body)


async def test_grounded_answer_with_hallucinated_number_is_blocked(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    msg = ChatMessage(
        conversation_id=conv.id, sender_id=owner.id, sender_side=MessageSide.contractor,
        client_msg_id=uuid4(), seq=1,
        body="the vendor billed forty five thousand for cement", media_type="text",
    )
    db_session.add(msg)
    await db_session.flush()
    await index_message(db_session, msg.id, client=FakeEmbeddings())
    await db_session.flush()

    # The LLM hallucinates a number that is NOT in the evidence → guard blocks it.
    llm = FakeLLMClient(canned={"grounded": True, "answer": "They billed ₹450,000 for cement."})
    reply = await run_nivaan_turn(db_session, owner, conv, "what did the vendor bill?", llm=llm)
    assert reply.meta["nivaan"].get("tool") == "guard_blocked"
    assert "450,000" not in reply.body and "450000" not in reply.body


async def test_evidence_texts_includes_event_date_so_dates_arent_blocked(db_session, factory):
    """A grounded answer may cite an event's date; the evidence surface must
    include occurred_on so the numeric guard doesn't false-block it."""
    from app.agent.nivaan import _evidence_texts
    from app.agent.nivaan_guard import numbers_are_grounded

    company = await factory.company()
    site = await factory.site(company)
    ev = SiteEventModel(
        site_id=site.id, event_type="progress_update", occurred_on=date(2026, 6, 10),
        summary="slab poured", fields={"stage": "slab"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )
    db_session.add(ev)
    await db_session.flush()
    allowed = await _evidence_texts(db_session, [str(ev.id)])
    # The cited date is grounded → an answer mentioning 2026-06-10 must pass.
    assert numbers_are_grounded("Poured on 2026-06-10.", allowed) is True
    # A fabricated amount is still blocked.
    assert numbers_are_grounded("Cost was ₹99,999.", allowed) is False
