"""Decision-enrichment pass (scripts.enrich_decisions).

Seeds the imported company/site + a homeowner Conversation with a few
ChatMessages, injects a network-free FakeLLM whose canned result lists two
decisions (one resolved, one open), and asserts:
  * two Decision rows are upserted with the right kind/state,
  * a second run() creates no duplicates (uuid5 idempotency), and
  * an empty homeowner conversation yields zero decisions.
"""
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_decisions as ed
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    Decision,
    DecisionKind,
    DecisionState,
    MessageSide,
    Site,
)

# Canned extraction every complete() call returns: 2 decisions across states.
_CANNED = {
    "decisions": [
        {
            "title": "Vertical bricks on the front wall",
            "context": "Should the front elevation use vertical brick cladding?",
            "resolution": "Yes — go with vertical bricks.",
            "status": "resolved",
            "decided_on": "2026-03-12",
            "who_asked": "Anil Tripathi",
        },
        {
            "title": "Move the shower to the other wall",
            "context": "Homeowner asked to shift the master shower.",
            "resolution": None,
            "status": "open",
            "decided_on": None,
            "who_asked": "Anil Tripathi",
        },
    ]
}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    """Force run() onto a canned, network-free FakeLLM (no Azure)."""
    monkeypatch.setattr(
        ed, "get_llm_client", lambda tier="smart": FakeLLMClient(canned=_CANNED)
    )


async def _seed(db_session, *, with_messages: bool = True) -> Site:
    """Imported company + site + a HOMEOWNER conversation (+ optional messages)."""
    company = Company(id=ed._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ed._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()
    conv = Conversation(
        id=uuid4(), company_id=company.id, site_id=site.id,
        kind=ConversationKind.homeowner,
    )
    db_session.add(conv)
    await db_session.flush()

    if with_messages:
        bodies = [
            "Sir, should we do vertical bricks on the front?",
            "Yes do vertical bricks, looks great.",
            "Also please move the shower to the other wall.",
        ]
        for i, body in enumerate(bodies):
            db_session.add(
                ChatMessage(
                    id=uuid4(),
                    conversation_id=conv.id,
                    sender_id=None,
                    sender_side=MessageSide.homeowner,
                    client_msg_id=uuid4(),
                    seq=i + 1,
                    body=body,
                    media_type="text",
                )
            )
    await db_session.flush()
    return site


async def test_enrich_decisions_creates_rows_with_state(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await ed.run(session_factory=sf)

    assert counts["messages_scanned"] == 3
    assert counts["decisions"] == 2

    rows = (
        await db_session.execute(
            select(Decision).where(Decision.site_id == site.id)
        )
    ).scalars().all()
    assert len(rows) == 2
    # Both are homeowner-question decisions scoped to the company + site.
    assert all(d.kind == DecisionKind.homeowner_question for d in rows)
    assert all(d.company_id == ed._id("company") for d in rows)

    by_title = {d.title: d for d in rows}
    resolved = by_title["Vertical bricks on the front wall"]
    assert resolved.state == DecisionState.resolved
    assert resolved.resolution_note == "Yes — go with vertical bricks."
    assert resolved.resolved_at is not None

    open_d = by_title["Move the shower to the other wall"]
    assert open_d.state == DecisionState.pending
    assert open_d.resolution_note is None
    assert open_d.resolved_at is None


async def test_enrich_decisions_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await ed.run(session_factory=sf)
    second = await ed.run(session_factory=sf)  # re-run upserts the same rows

    assert second["decisions"] == 2
    n = (
        await db_session.execute(
            select(func.count()).select_from(Decision).where(
                Decision.site_id == site.id
            )
        )
    ).scalar()
    assert n == 2  # not 4


async def test_enrich_decisions_empty_conversation_is_zero(db_session):
    site = await _seed(db_session, with_messages=False)

    counts = await ed.run(session_factory=_session_factory(db_session))

    assert counts == {"messages_scanned": 0, "decisions": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(Decision).where(
                Decision.site_id == site.id
            )
        )
    ).scalar()
    assert n == 0
