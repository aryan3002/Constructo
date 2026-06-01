"""H6.1 model/table round-trips + the two freeze invariants.

Mirrors test_models.py. Asserts QuietPeriod and TranslationCache persist with
their enums/server defaults, that the partial-unique ``uq_quiet_open_per_site``
rejects a 2nd live window per site, and that ``uq_translation_cache_key`` rejects
a duplicate (source_table, source_id, source_field, lang).
"""
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import QuietPeriod, QuietStatus, TranslationCache


async def test_quiet_period_round_trip(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    q = QuietPeriod(site_id=site.id, gap_days=4)
    db_session.add(q)
    await db_session.flush()
    await db_session.refresh(q)

    assert q.status == QuietStatus.open  # server default
    assert str(q.confidence) == "1.000"  # server default
    assert q.reason_source == "schedule"  # server default
    assert q.detected_at is not None
    assert q.created_at is not None


async def test_translation_cache_round_trip(db_session):
    tc = TranslationCache(
        source_table="updates",
        source_id=uuid4(),
        lang="hi",
        content_hash="a" * 64,
        canonical="Extra ₹45,000",
        translated="[hi] Extra ₹45,000",
        engine="fake",
    )
    db_session.add(tc)
    await db_session.flush()
    await db_session.refresh(tc)

    assert tc.source_field == "text"  # server default
    assert tc.glossary_version == 0  # server default
    assert tc.style == "hinglish_warm"  # server default
    assert tc.numeric_guard_ok is True  # server default
    assert tc.approved is False  # server default
    assert tc.created_at is not None


async def test_one_live_quiet_window_per_site(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    db_session.add(QuietPeriod(site_id=site.id, gap_days=3, status=QuietStatus.open))
    await db_session.flush()

    # A second live (open/suggested/confirmed/published) window for the same site
    # violates the partial-unique idempotency index.
    db_session.add(QuietPeriod(site_id=site.id, gap_days=5, status=QuietStatus.suggested))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_closed_window_does_not_block_new_one(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    db_session.add(QuietPeriod(site_id=site.id, gap_days=3, status=QuietStatus.closed))
    await db_session.flush()

    # A closed window is outside the partial-unique predicate, so a fresh open
    # window is allowed.
    db_session.add(QuietPeriod(site_id=site.id, gap_days=2, status=QuietStatus.open))
    await db_session.flush()


async def test_translation_cache_key_is_unique(factory, db_session):
    sid = uuid4()
    db_session.add(
        TranslationCache(
            source_table="updates",
            source_id=sid,
            source_field="text",
            lang="hi",
            content_hash="b" * 64,
            canonical="x",
            translated="[hi] x",
            engine="fake",
        )
    )
    await db_session.flush()

    db_session.add(
        TranslationCache(
            source_table="updates",
            source_id=sid,
            source_field="text",
            lang="hi",
            content_hash="c" * 64,
            canonical="x",
            translated="[hi] x2",
            engine="fake",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
