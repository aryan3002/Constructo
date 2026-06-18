"""Site-change-enrichment pass (scripts.enrich_site_changes).

Seeds the imported company/site + a site Conversation with change-y messages,
injects a network-free FakeLLM whose canned result lists two distinct changes,
and asserts:
  * two SiteChange rows are upserted (scoped to company + site, status new),
  * a second run() creates no duplicates (uuid5 idempotency), and
  * an empty corpus yields zero changes.
"""
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_site_changes as es
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    MessageSide,
    Site,
    SiteChange,
    SiteChangeStatus,
)

# Canned extraction every complete() call returns: 2 distinct change requests.
_CANNED = {
    "changes": [
        {
            "title": "Move the shower to the other wall",
            "note": "Shift the master shower to the opposite wall.",
            "room": "Master Bathroom",
            "requested_by": "Anil Tripathi",
        },
        {
            "title": "Increase shower width by 8 inch",
            "note": "Make the shower 8 inches wider.",
            "room": "Master Bathroom",
            "requested_by": "Anil Tripathi",
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
        es, "get_llm_client", lambda tier="smart": FakeLLMClient(canned=_CANNED)
    )


async def _seed(db_session, *, with_messages: bool = True) -> Site:
    """Imported company + site + a site conversation (+ optional messages)."""
    company = Company(id=es._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=es._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()
    conv = Conversation(
        id=uuid4(), company_id=company.id, site_id=site.id, kind=ConversationKind.site
    )
    db_session.add(conv)
    await db_session.flush()

    if with_messages:
        bodies = [
            "Please move the shower to the other wall.",
            "Also increase the shower width by 8 inch.",
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


async def test_enrich_site_changes_creates_rows(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await es.run(session_factory=sf)

    assert counts["scanned"] == 2
    assert counts["site_changes"] == 2

    rows = (
        await db_session.execute(
            select(SiteChange).where(SiteChange.site_id == site.id)
        )
    ).scalars().all()
    assert len(rows) == 2
    assert all(c.company_id == es._id("company") for c in rows)
    assert all(c.status == SiteChangeStatus.new for c in rows)
    assert all(c.note for c in rows)
    titles = {c.title for c in rows}
    assert "Move the shower to the other wall" in titles
    assert "Increase shower width by 8 inch" in titles


async def test_enrich_site_changes_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await es.run(session_factory=sf)
    second = await es.run(session_factory=sf)  # re-run upserts the same rows

    assert second["site_changes"] == 2
    n = (
        await db_session.execute(
            select(func.count()).select_from(SiteChange).where(
                SiteChange.site_id == site.id
            )
        )
    ).scalar()
    assert n == 2  # not 4


async def test_enrich_site_changes_empty_is_zero(db_session):
    site = await _seed(db_session, with_messages=False)

    counts = await es.run(session_factory=_session_factory(db_session))

    assert counts == {"scanned": 0, "site_changes": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(SiteChange).where(
                SiteChange.site_id == site.id
            )
        )
    ).scalar()
    assert n == 0
