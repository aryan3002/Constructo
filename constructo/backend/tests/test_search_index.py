"""Indexing tests: document building, upsert idempotency, backfill (FakeEmbeddings)."""
from datetime import date

import pytest_asyncio
from sqlalchemy import func, select

from app.models import EventEmbedding, SiteEventModel
from app.models.event_embedding import EMBEDDING_DIM
from app.search.embeddings import FakeEmbeddings
from app.search.index import build_document, index_all_unindexed, index_event


@pytest_asyncio.fixture
async def site(factory):
    company = await factory.company()
    return await factory.site(company=company, name="Site A")


async def _add_event(db_session, site_id, **kw):
    defaults = dict(
        event_type="material_delivery",
        occurred_on=date(2026, 5, 28),
        summary="50 bags cement delivered",
        fields={"material": "cement", "quantity": 50, "vendor": "ACC"},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    defaults.update(kw)
    ev = SiteEventModel(site_id=site_id, **defaults)
    db_session.add(ev)
    await db_session.flush()
    return ev


def test_build_document_includes_type_summary_and_fields():
    ev = SiteEventModel(
        site_id=None,
        event_type="material_delivery",
        occurred_on=date(2026, 5, 28),
        summary="cement arrived",
        fields={"material": "cement", "quantity": 50, "vendor": "ACC", "unit": None},
        confidence=0.9,
        source_message_ids=[],
    )
    doc = build_document(ev)
    assert "material delivery" in doc  # underscore -> space for semantics
    assert "cement arrived" in doc
    assert "material=cement" in doc and "quantity=50" in doc and "vendor=ACC" in doc
    assert "unit=" not in doc  # None fields are skipped


async def test_index_event_writes_vector_of_right_dim(db_session, site):
    ev = await _add_event(db_session, site.id)
    row = await index_event(db_session, ev.id, client=FakeEmbeddings())
    assert row is not None
    assert row.site_event_id == ev.id
    assert row.model == FakeEmbeddings().model
    assert len(row.embedding) == EMBEDDING_DIM


async def test_index_event_is_idempotent_upsert(db_session, site):
    ev = await _add_event(db_session, site.id)
    await index_event(db_session, ev.id, client=FakeEmbeddings())
    await index_event(db_session, ev.id, client=FakeEmbeddings())  # re-index
    count = await db_session.scalar(
        select(func.count()).select_from(EventEmbedding).where(
            EventEmbedding.site_event_id == ev.id
        )
    )
    assert count == 1  # unique on site_event_id; second call updates in place


async def test_index_event_missing_returns_none(db_session):
    from uuid import uuid4

    assert await index_event(db_session, uuid4(), client=FakeEmbeddings()) is None


async def test_backfill_only_indexes_unindexed(db_session, site):
    e1 = await _add_event(db_session, site.id, summary="one")
    e2 = await _add_event(db_session, site.id, summary="two")
    await index_event(db_session, e1.id, client=FakeEmbeddings())  # pre-index one

    n = await index_all_unindexed(db_session, client=FakeEmbeddings())
    assert n == 1  # only e2 was missing

    total = await db_session.scalar(select(func.count()).select_from(EventEmbedding))
    assert total == 2
    # second run is a no-op
    assert await index_all_unindexed(db_session, client=FakeEmbeddings()) == 0
    _ = e2  # silence unused
