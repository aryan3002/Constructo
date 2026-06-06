"""The agent turn (2.1) — terminal-tool result, scoping, audit row."""
from datetime import date

import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import AgentTurn, SiteEventModel, UserRole


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _ev(site_id, etype, fields):
    return SiteEventModel(
        site_id=site_id, event_type=etype, occurred_on=date.today(), summary=etype,
        fields=fields, confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_question_returns_answer_and_audits(client, db_session, world):
    company, owner, site = world
    db_session.add_all([
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 40, "unit": "bag"}),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "how much cement"}, headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "answer"
    assert body["total"] == 90
    assert body["tool"] == "aggregate"
    assert len(body["evidence_event_ids"]) == 2
    # Exactly one audit row was written.
    n = await db_session.scalar(
        select(func.count()).select_from(AgentTurn).where(AgentTurn.company_id == company.id)
    )
    assert n == 1


async def test_ungroundable_returns_clarify_never_prose(client, world):
    _, owner, _ = world
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "tell me a joke"}, headers=auth(owner)
    )
    assert resp.json()["kind"] == "clarify"


async def test_grounded_qa_answers_any_question_from_the_record(db_session, factory, world):
    """When it isn't an exact-number aggregation, @ask answers via grounded RAG:
    it retrieves the relevant message and the model composes a one-sentence answer
    ONLY from that context (abstaining if nothing's there)."""
    from uuid import uuid4

    from app.agent.loop import run_turn
    from app.extraction.llm import FakeLLMClient
    from app.models import ChatMessage, Conversation, ConversationKind, MessageSide
    from app.search.embeddings import FakeEmbeddings
    from app.search.index_message import index_message

    _, owner, site = world
    conv = Conversation(
        company_id=owner.company_id, site_id=site.id,
        kind=ConversationKind.site, created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    msg = ChatMessage(
        conversation_id=conv.id, sender_id=owner.id, sender_side=MessageSide.contractor,
        client_msg_id=uuid4(), seq=1, body="the basement slab developed a leak near the column",
        media_type="text",
    )
    db_session.add(msg)
    await db_session.flush()
    await index_message(db_session, msg.id, client=FakeEmbeddings())
    await db_session.commit()

    # The model composes a grounded answer from the retrieved context (a
    # grounded=false would abstain — it never writes facts that aren't there).
    llm = FakeLLMClient(
        canned={"grounded": True, "answer": "The basement slab developed a leak near the column."}
    )
    result = await run_turn(
        db_session, owner, "what happened with the slab?", site_id=site.id, llm=llm
    )
    assert result.kind.value == "answer"
    assert result.tool == "grounded_qa"
    assert "leak" in result.text.lower()
    assert str(msg.id) in result.evidence_event_ids


async def test_grounded_qa_abstains_when_record_is_empty(db_session, factory, world):
    """No relevant record → abstain (clarify), never invent (the model is never
    even called when retrieval is empty)."""
    from app.agent.loop import run_turn
    from app.extraction.llm import FakeLLMClient

    _, owner, site = world
    llm = FakeLLMClient(canned={"grounded": True, "answer": "fabricated"})
    result = await run_turn(
        db_session, owner, "what is the status of the kitchen?", site_id=site.id, llm=llm
    )
    assert result.kind.value == "clarify"


async def test_scoping_excludes_other_sites(client, db_session, factory, world):
    company, _, site = world
    from app.sites.models import SiteAssignment

    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    other = await factory.site(company, name="Other")
    db_session.add_all([
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(other.id, "material_delivery", {"material": "cement", "quantity": 999, "unit": "bori"}),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "how much cement"}, headers=auth(sup)
    )
    assert resp.json()["total"] == 50  # the other site's 999 never leaks
