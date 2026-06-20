"""Action-item-enrichment pass (scripts.enrich_action_items).

Seeds the imported company/site + a site Conversation with two ChatMessages,
injects a network-free fake LLM that flags exactly ONE of them as a task, and
asserts:
  * one ActionItem (+ a created event) is upserted for the flagged message,
  * a second run() creates no duplicate item and no duplicate created event, and
  * a corpus with nothing flagged yields zero action items.
"""
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_action_items as ea
from app.models import (
    ActionItem,
    ActionItemEvent,
    ActionItemStatus,
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    MessageSide,
    Site,
)

# A message is a task iff its text contains this marker; lets one of two messages
# be flagged deterministically without any network.
_TASK_MARKER = "share the new layout"


class _MarkerLLM:
    """Network-free fake: flags a message as a task only if it has the marker."""

    def __init__(self, *, flag_all: bool = False) -> None:
        self.flag_all = flag_all

    async def complete(self, system: str, user: str, json_schema: dict) -> dict:
        is_task = self.flag_all or (_TASK_MARKER in user.lower())
        return {
            "is_task": is_task,
            "title": user.strip() if is_task else None,
            "assignee_hint": "Lokesh" if is_task else None,
            "due_hint": None,
        }


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    """Force run() onto the marker-based fake (no Azure). Tests that need a
    different fake override get_llm_client themselves AFTER this autouse runs."""
    monkeypatch.setattr(ea, "get_llm_client", lambda tier="cheap": _MarkerLLM())


async def _seed(db_session, bodies: list[str]) -> Site:
    """Imported company + site + a site conversation with the given messages."""
    company = Company(id=ea._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ea._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()
    conv = Conversation(
        id=uuid4(), company_id=company.id, site_id=site.id, kind=ConversationKind.site
    )
    db_session.add(conv)
    await db_session.flush()

    for i, body in enumerate(bodies):
        db_session.add(
            ChatMessage(
                id=uuid4(),
                conversation_id=conv.id,
                sender_id=None,
                sender_side=MessageSide.contractor,
                client_msg_id=uuid4(),
                seq=i + 1,
                body=body,
                media_type="text",
            )
        )
    await db_session.flush()
    return site


async def test_enrich_action_items_creates_one_for_the_task(db_session):
    site = await _seed(
        db_session,
        [
            "Slab casting ho gaya aaj.",            # not a task
            "Please share the new layout with clearances.",  # the task
        ],
    )
    sf = _session_factory(db_session)

    counts = await ea.run(session_factory=sf)

    assert counts["scanned"] == 2
    assert counts["action_items"] == 1

    rows = (
        await db_session.execute(
            select(ActionItem).where(ActionItem.site_id == site.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    item = rows[0]
    assert item.company_id == ea._id("company")
    assert item.status == ActionItemStatus.open
    assert item.created_by_ai is True
    assert item.source_message_id is not None
    assert _TASK_MARKER in item.title.lower()

    # Exactly one created lifecycle event for it.
    n_events = (
        await db_session.execute(
            select(func.count()).select_from(ActionItemEvent).where(
                ActionItemEvent.action_item_id == item.id
            )
        )
    ).scalar()
    assert n_events == 1


async def test_enrich_skips_meeting_chatter(db_session, monkeypatch):
    """Meeting/call-scheduling chatter must NEVER become an action item — even
    when the LLM flags every message as a task. This is what was flooding the
    owner Brief/Radar with '"join the Google Meet" is 985 days overdue'."""
    monkeypatch.setattr(ea, "get_llm_client", lambda tier="cheap": _MarkerLLM(flag_all=True))
    site = await _seed(
        db_session,
        [
            "Kindly join us via the Google Meet link for the review.",   # junk
            "We would like to schedule a Google Meet session tomorrow.",  # junk
            "Please verify the meeting notes shared above.",              # junk
            "Ramesh ko bolo cement order kare.",                         # a REAL task
        ],
    )
    counts = await ea.run(session_factory=_session_factory(db_session))
    assert counts["scanned"] == 4

    rows = (
        await db_session.execute(select(ActionItem).where(ActionItem.site_id == site.id))
    ).scalars().all()
    titles = [r.title.lower() for r in rows]
    assert not any(("meet" in t or "meeting" in t) for t in titles), titles
    assert any("cement" in t for t in titles)
    assert len(rows) == 1


async def test_enrich_action_items_is_idempotent(db_session):
    site = await _seed(
        db_session,
        ["Status only.", "Please share the new layout with clearances."],
    )
    sf = _session_factory(db_session)

    await ea.run(session_factory=sf)
    second = await ea.run(session_factory=sf)  # re-run upserts the same row

    assert second["action_items"] == 1
    n_items = (
        await db_session.execute(
            select(func.count()).select_from(ActionItem).where(
                ActionItem.site_id == site.id
            )
        )
    ).scalar()
    assert n_items == 1  # not 2
    # The append-only event log must not pile up duplicate created events.
    n_events = (
        await db_session.execute(select(func.count()).select_from(ActionItemEvent))
    ).scalar()
    assert n_events == 1  # not 2


async def test_enrich_action_items_none_flagged_is_zero(db_session):
    site = await _seed(
        db_session,
        ["Slab casting ho gaya.", "Cement 50 bori aa gaya."],
    )

    counts = await ea.run(session_factory=_session_factory(db_session))

    assert counts == {"scanned": 2, "action_items": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(ActionItem).where(
                ActionItem.site_id == site.id
            )
        )
    ).scalar()
    assert n == 0
