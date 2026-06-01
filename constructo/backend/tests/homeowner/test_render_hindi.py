"""Slice T — Hindi on the homeowner read path (drift #7 / C3).

Published homeowner-facing text (photo captions, weekly summaries, quiet cards)
is rendered into the homeowner's ``users.language`` on the READ path via the
content-addressed translation_cache, with the numeric guard enforced. The
contractor's SOURCE stays English; the homeowner reads HER language.

Network-free: FakeTranslationClient echoes ``[hi] <source>`` (numbers preserved),
so the guard passes by construction and a *separate* unit test feeds a tampered
string to prove the guard BLOCKS a number change.
"""
from uuid import uuid4

from sqlalchemy import select

from app.homeowner.numeric_guard import numeric_guard
from app.homeowner.render import render_text
from app.homeowner.translation import FakeTranslationClient
from app.models import PublishedPhoto, TranslationCache, User

from .conftest import auth


async def _make_hindi_homeowner(db_session, homeowner) -> None:
    homeowner.language = "hi"
    db_session.add(homeowner)
    await db_session.flush()


async def test_caption_rendered_into_hindi_with_numbers_intact(
    client, ctx, db_session, fake_translation
):
    await _make_hindi_homeowner(db_session, ctx.homeowner)
    db_session.add(
        PublishedPhoto(
            site_id=ctx.site.id,
            image_url="http://cdn/slab.jpg",
            caption="Poured 45,000 litres on 10 June",
            published_by=ctx.owner.id,
        )
    )
    await db_session.commit()

    resp = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    assert resp.status_code == 200, resp.text
    caption = resp.json()["items"][0]["caption"]
    # Reader-language variant (fake prefixes [hi]); numerals byte-identical.
    assert caption == "[hi] Poured 45,000 litres on 10 June"
    assert "45,000" in caption and "10 June" in caption


async def test_english_homeowner_reads_source_unchanged(
    client, ctx, db_session, fake_translation
):
    # Homeowner stays on the source language → no translation, no provider call.
    ctx.homeowner.language = "en"
    db_session.add(ctx.homeowner)
    db_session.add(
        PublishedPhoto(
            site_id=ctx.site.id,
            image_url="http://cdn/x.jpg",
            caption="Your kitchen is taking shape",
            published_by=ctx.owner.id,
        )
    )
    await db_session.commit()

    resp = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    assert resp.json()["items"][0]["caption"] == "Your kitchen is taking shape"
    assert fake_translation.calls == []  # source language → provider untouched


async def test_second_read_is_cache_hit(client, ctx, db_session, fake_translation):
    await _make_hindi_homeowner(db_session, ctx.homeowner)
    db_session.add(
        PublishedPhoto(
            site_id=ctx.site.id,
            image_url="http://cdn/x.jpg",
            caption="Plastering done on the first floor",
            published_by=ctx.owner.id,
        )
    )
    await db_session.commit()

    first = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    second = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    assert first.json()["items"][0]["caption"] == second.json()["items"][0]["caption"]
    # Provider called exactly ONCE across two reads → the 2nd was a cache hit.
    assert len(fake_translation.calls) == 1

    # Exactly one cache row was written for that field.
    rows = (
        await db_session.execute(
            select(TranslationCache).where(TranslationCache.lang == "hi")
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].source_field == "caption"
    assert rows[0].numeric_guard_ok is True


async def test_quiet_card_and_weekly_summary_rendered_into_hindi(
    client, ctx, db_session, fake_translation
):
    """The quiet card + weekly summary text also render in the reader's language."""
    from datetime import UTC, datetime, timedelta

    from app.homeowner.quiet import confirm_quiet_period, run_quiet_period_sweep
    from app.models import Milestone, MilestoneStatus, QuietPeriod, WeeklySummary

    await _make_hindi_homeowner(db_session, ctx.homeowner)
    db_session.add(
        PublishedPhoto(
            site_id=ctx.site.id,
            image_url="http://cdn/p.jpg",
            published_at=datetime.now(UTC) - timedelta(days=5),
        )
    )
    db_session.add(
        Milestone(site_id=ctx.site.id, name="Slab curing", status=MilestoneStatus.now, order=0)
    )
    db_session.add(
        WeeklySummary(
            site_id=ctx.site.id,
            week_start=datetime.now(UTC).date(),
            text="Quiet week — slab curing, no site changes",
            published_at=datetime.now(UTC) - timedelta(days=5),
            published_by=ctx.owner.id,
        )
    )
    await db_session.flush()
    await run_quiet_period_sweep(db_session, now=datetime.now(UTC))
    win = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().one()
    await confirm_quiet_period(db_session, win, confirmed_by=ctx.owner.id)

    qp = await client.get("/api/v1/homeowner/quiet-periods", headers=auth(ctx.homeowner))
    assert qp.json()[0]["reason"].startswith("[hi] ")

    weekly = await client.get(
        "/api/v1/homeowner/weekly-summary", headers=auth(ctx.homeowner)
    )
    assert weekly.json()[0]["text"].startswith("[hi] ")


# ---- numeric guard unit coverage (blocks a number change) -------------------


async def test_render_blocks_number_change_and_falls_back(db_session):
    """A provider that ALTERS a number is caught: the variant is rejected
    (numeric_guard_ok=false) and the canonical source is served instead."""

    class TamperingClient(FakeTranslationClient):
        async def translate(self, text, *, target_lang, style="hinglish_warm"):
            await super().translate(text, target_lang=target_lang, style=style)
            return "[hi] Poured 450,000 litres"  # 10x money error!

    canonical = "Poured 45,000 litres"
    src_id = uuid4()
    out = await render_text(
        db_session,
        TamperingClient(),
        canonical=canonical,
        lang="hi",
        source_table="published_photos",
        source_id=src_id,
        source_field="caption",
    )
    # Guard caught the change → fall back to the untouched canonical.
    assert out == canonical
    row = (
        await db_session.execute(
            select(TranslationCache).where(TranslationCache.source_id == src_id)
        )
    ).scalars().one()
    assert row.numeric_guard_ok is False


def test_numeric_guard_unit_catches_money_error():
    assert numeric_guard("₹45,000 approved", "[hi] ₹45,000 approved") is True
    assert numeric_guard("₹45,000 approved", "[hi] ₹450,000 approved") is False


async def test_user_language_default_is_en(db_session, factory):
    """Sanity: a freshly inserted user defaults to the source language."""
    from app.models import UserRole

    company = await factory.company()
    u = User(company_id=company.id, phone="+19998887777", role=UserRole.homeowner)
    db_session.add(u)
    await db_session.flush()
    await db_session.refresh(u)
    assert u.language == "en"
