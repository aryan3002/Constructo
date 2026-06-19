"""Profiler-enrichment pass (scripts.enrich_profiler).

Seeds the imported company/site + a HOMEOWNER conversation with a few design
ChatMessages + a couple of PublishedPhotos (the design-option references),
injects a network-free FakeLLM whose canned result lists themes + a brief, and
asserts:
  * one ProfilerProfile is created for the site,
  * ProfilerArea rows are created for the rooms actually discussed,
  * grounded ProfilerTheme rows + a couple ProfilerReference rows (from the real
    photos) + a ProfilerBrief are created,
  * a second run() creates no duplicates (uuid5 idempotency), and
  * with no design signal at all, no profile (and zero everything) is created.
"""
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_profiler as ep
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Company,
    Conversation,
    ConversationKind,
    MessageSide,
    ProfilerArea,
    ProfilerBrief,
    ProfilerProfile,
    ProfilerReference,
    ProfilerTheme,
    PublishedPhoto,
    Site,
)

# Canned LLM result. The script makes two kinds of call (themes + brief); a
# single canned dict that carries both keys serves both — each reader picks the
# key it needs.
_CANNED = {
    "themes": [
        {
            "name": "Warm contemporary",
            "palette": ["warm white", "walnut", "brass"],
            "materials": ["italian marble", "veneer", "brass inlay"],
            "rationale": "The family kept asking for warm stone with brass accents.",
        },
        {
            "name": "Vertical brick character",
            "palette": ["terracotta", "charcoal"],
            "materials": ["exposed brick"],
            "rationale": "Vertical brick was requested for the elevation.",
        },
    ],
    "headline": "A warm, contemporary home with brick character",
    "summary": "The family wants warm stone, brass accents and a vertical-brick "
    "elevation across the master bedroom, drawing room and kitchen.",
    "sections": [
        {"title": "Materials", "body": "Italian marble, walnut veneer, brass inlay."}
    ],
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
        ep, "get_llm_client", lambda tier="smart": FakeLLMClient(canned=_CANNED)
    )


async def _seed(
    db_session, *, with_messages: bool = True, with_photos: bool = True
) -> Site:
    """Imported company + site + a HOMEOWNER conversation (+ design signal)."""
    company = Company(id=ep._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ep._id("site"), company_id=company.id, name="Tripathi Dream Home")
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
            "For the master bedroom we want warm Italian marble flooring.",
            "Drawing room should have a brass-accent feature wall.",
            "Kitchen counter in dark granite please.",
            "And vertical bricks on the front elevation.",
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

    if with_photos:
        for i in range(2):
            db_session.add(
                PublishedPhoto(
                    id=uuid4(),
                    site_id=site.id,
                    image_url=f"wa-tripathi/design_option_{i}.jpg",
                    caption="Reference render for the drawing room.",
                )
            )
    await db_session.flush()
    return site


async def test_enrich_profiler_creates_profile_areas_themes_brief(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await ep.run(session_factory=sf)

    # One profile for the site.
    profiles = (
        await db_session.execute(
            select(ProfilerProfile).where(ProfilerProfile.site_id == site.id)
        )
    ).scalars().all()
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile.company_id == ep._id("company")

    # Areas for the discussed rooms.
    areas = (
        await db_session.execute(
            select(ProfilerArea).where(ProfilerArea.profile_id == profile.id)
        )
    ).scalars().all()
    assert counts["areas"] >= 1
    assert len(areas) == counts["areas"]

    # Grounded themes from the canned result.
    themes = (
        await db_session.execute(
            select(ProfilerTheme).where(ProfilerTheme.profile_id == profile.id)
        )
    ).scalars().all()
    assert counts["themes"] == 2
    assert len(themes) == 2
    assert {t.name for t in themes} == {"Warm contemporary", "Vertical brick character"}

    # References from the real photos (each FK-bound to a real area).
    refs = (
        await db_session.execute(
            select(ProfilerReference).where(ProfilerReference.profile_id == profile.id)
        )
    ).scalars().all()
    assert counts["references"] == 2
    assert len(refs) == 2
    area_ids = {a.id for a in areas}
    assert all(r.area_id in area_ids for r in refs)
    assert all(r.image_r2_key for r in refs)

    # A brief.
    briefs = (
        await db_session.execute(
            select(ProfilerBrief).where(ProfilerBrief.profile_id == profile.id)
        )
    ).scalars().all()
    assert counts["brief"] == 1
    assert len(briefs) == 1
    assert briefs[0].summary_json  # carries the narrated brief payload


async def test_enrich_profiler_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    first = await ep.run(session_factory=sf)
    second = await ep.run(session_factory=sf)  # re-run upserts the same rows

    assert second == first
    n_profiles = (
        await db_session.execute(
            select(func.count()).select_from(ProfilerProfile).where(
                ProfilerProfile.site_id == site.id
            )
        )
    ).scalar()
    assert n_profiles == 1  # not 2
    profile = (
        await db_session.execute(
            select(ProfilerProfile).where(ProfilerProfile.site_id == site.id)
        )
    ).scalars().first()
    for model in (ProfilerArea, ProfilerTheme, ProfilerReference, ProfilerBrief):
        n = (
            await db_session.execute(
                select(func.count()).select_from(model).where(
                    model.profile_id == profile.id
                )
            )
        ).scalar()
        assert n == {
            ProfilerArea: first["areas"],
            ProfilerTheme: first["themes"],
            ProfilerReference: first["references"],
            ProfilerBrief: first["brief"],
        }[model]


async def test_enrich_profiler_no_signal_no_profile(db_session):
    site = await _seed(db_session, with_messages=False, with_photos=False)

    counts = await ep.run(session_factory=_session_factory(db_session))

    assert counts == {"areas": 0, "themes": 0, "references": 0, "brief": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(ProfilerProfile).where(
                ProfilerProfile.site_id == site.id
            )
        )
    ).scalar()
    assert n == 0
