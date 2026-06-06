"""Phase 0.3: latest-version-wins filtering (`latest_event_clause`).

A superseded event (one whose id is referenced by another event's
`supersedes_event_id`) must never appear at a read surface, so an edited /
promoted event doesn't double-count. No-op until supersession edges exist.
"""
from datetime import date
from uuid import uuid4

from sqlalchemy import select

from app.common.site_events import latest_event_clause
from app.models import SiteEventModel, UserRole

DAY = date(2026, 5, 28)


async def _event(db_session, site_id, *, headcount, event_type="attendance",
                 supersedes=None, version=1):
    ev = SiteEventModel(
        id=uuid4(), site_id=site_id, event_type=event_type, occurred_on=DAY,
        summary=f"{headcount} workers", fields={"headcount": headcount},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
        version=version, supersedes_event_id=supersedes,
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


async def test_clause_excludes_superseded_event(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    old = await _event(db_session, site.id, headcount=10)
    new = await _event(db_session, site.id, headcount=12, supersedes=old.id, version=2)

    rows = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.site_id == site.id, latest_event_clause()
            )
        )
    ).scalars().all()
    ids = {r.id for r in rows}
    assert new.id in ids
    assert old.id not in ids  # superseded -> filtered out
    assert len(rows) == 1


async def test_clause_is_noop_without_supersession(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    a = await _event(db_session, site.id, headcount=8)
    b = await _event(db_session, site.id, headcount=9)
    rows = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.site_id == site.id, latest_event_clause()
            )
        )
    ).scalars().all()
    assert {r.id for r in rows} == {a.id, b.id}  # both independent -> both kept


async def test_brief_counts_only_latest_version(db_session, factory):
    """End-to-end: the owner brief counts the replacement, not the superseded row."""
    from app.brief.generate import build_brief
    from app.extraction.llm import FakeLLMClient

    company = await factory.company()
    site = await factory.site(company=company, name="Tower A")
    old = await _event(db_session, site.id, headcount=10)
    await _event(db_session, site.id, headcount=12, supersedes=old.id, version=2)

    result = await build_brief(db_session, company.id, DAY, llm=FakeLLMClient())
    card = next(s for s in result["payload"]["sites"] if s["site_id"] == str(site.id))
    # Two attendance rows exist, but one is superseded -> counted once.
    assert card["counts"]["attendance"] == 1


async def test_search_hides_superseded(client, db_session, factory):
    """A superseded event is not returned by search even though it's indexed."""
    from app.auth.jwt import create_access_token
    from app.main import app
    from app.search.embeddings import FakeEmbeddings
    from app.search.index import index_event
    from app.search.router import _get_client

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company, name="Site A")
    old = await _event(db_session, site.id, headcount=10, event_type="material_delivery")
    old.summary = "cement old"
    new = await _event(db_session, site.id, headcount=12, event_type="material_delivery",
                       supersedes=old.id, version=2)
    new.summary = "cement new"
    await db_session.flush()
    await index_event(db_session, old.id, client=FakeEmbeddings())
    await index_event(db_session, new.id, client=FakeEmbeddings())

    app.dependency_overrides[_get_client] = lambda: FakeEmbeddings()
    try:
        token = create_access_token(str(owner.id), owner.role.value)
        resp = await client.post(
            "/api/v1/search", json={"q": "cement"},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        app.dependency_overrides.pop(_get_client, None)
    hit_ids = {h["event_id"] for h in resp.json()["hits"]}
    assert str(old.id) not in hit_ids  # superseded -> never surfaced
