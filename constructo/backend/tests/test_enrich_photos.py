"""Photo-enrichment pass (scripts.enrich_photos).

Seeds the imported company/site + 2 PublishedPhoto rows (one captionless) whose
image bytes are written via the LOCAL storage backend (pinned by the autouse
``_force_local_storage`` fixture in conftest), injects a network-free fake vision
client, and asserts:
  * a blank caption is filled (and an existing caption is preserved),
  * a "progress" photo yields a progress_update SiteEvent,
  * a "document" photo yields NO event,
  * room_tag is set from room_hint,
  * a second run() creates no duplicate events or captions.
"""
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_photos as ep
from app.models import Company, PublishedPhoto, Site, SiteEventModel
from app.storage import get_storage

# A 1x1 PNG — enough for put_bytes/url_for/read-bytes; the fake ignores pixels.
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f80f00010101001b30b8a40000000049454e44ae426082"
)

_PROGRESS = {"caption": "Lift area second coat whitewash in progress.",
             "category": "progress", "room_hint": "Lift Area"}
_DOCUMENT = {"caption": "A printed material challan on a table.",
             "category": "document", "room_hint": None}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


class _SeqFakeVision:
    """Returns canned caption_photo-shaped results in call order (network-free)."""

    def __init__(self, results):
        self._results = list(results)
        self._i = 0
        self.image_urls = []

    async def complete_vision(self, system, user, image_url, json_schema):
        self.image_urls.append(image_url)
        out = self._results[min(self._i, len(self._results) - 1)]
        self._i += 1
        return out


@pytest.fixture
def fake_vision(monkeypatch):
    fake = _SeqFakeVision([_PROGRESS, _DOCUMENT])
    monkeypatch.setattr(ep, "get_llm_client", lambda tier="vision": fake)
    return fake


async def _seed(db_session):
    """Imported company + site + 2 photos (photo[0] captionless → progress,
    photo[1] has a caption → document). image bytes live in local storage."""
    company = Company(id=ep._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ep._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    storage = get_storage()
    photos = []
    for i, caption in enumerate([None, "Human-written caption (keep me)"]):
        key = f"wa-tripathi/photo_{uuid4().hex}.png"
        storage.put_bytes(key, _PNG, "image/png")
        p = PublishedPhoto(
            id=uuid4(), site_id=site.id, image_url=key, caption=caption,
            room_tag=None, is_starred=False,
            # Deterministic processing order: photo[0] first → gets _PROGRESS.
            published_at=datetime(2026, 5, 1 + i, 9, 0, tzinfo=UTC),
        )
        db_session.add(p)
        photos.append(p)
    await db_session.flush()
    return site, photos


async def test_enrich_photos_captions_and_events(db_session, fake_vision):
    site, photos = await _seed(db_session)

    counts = await ep.run(session_factory=_session_factory(db_session))

    assert counts["photos"] == 2
    assert fake_vision.image_urls  # vision was actually called
    assert all(u and u.startswith("data:image/") for u in fake_vision.image_urls)

    # Blank caption filled from the progress result; room_tag set from room_hint.
    await db_session.refresh(photos[0])
    assert photos[0].caption == _PROGRESS["caption"]
    assert photos[0].room_tag == "Lift Area"
    assert counts["captioned"] == 1  # only the previously-blank one counted

    # Existing human caption is preserved (never clobbered).
    await db_session.refresh(photos[1])
    assert photos[1].caption == "Human-written caption (keep me)"

    # Events: progress photo → 1 progress_update event; document photo → none.
    events = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.site_id == site.id)
        )
    ).scalars().all()
    assert len(events) == 1
    ev = events[0]
    assert ev.event_type == "progress_update"
    assert ev.summary == _PROGRESS["caption"]
    assert ev.fields["room"] == "Lift Area"
    assert ev.confidence == 0.8
    assert ev.needs_clarification is False
    assert counts["events"] == 1


async def test_enrich_photos_is_idempotent(db_session, fake_vision):
    site, _ = await _seed(db_session)
    sf = _session_factory(db_session)

    await ep.run(session_factory=sf)
    # Re-arm the fake so the second run sees the same canned results in order.
    fake_vision._i = 0
    await ep.run(session_factory=sf)  # re-run

    n_events = (
        await db_session.execute(
            select(func.count()).select_from(SiteEventModel).where(
                SiteEventModel.site_id == site.id
            )
        )
    ).scalar()
    assert n_events == 1  # not 2 — uuid5 id upserted

    # Captions are stable across re-runs (only one progress photo captioned).
    photos = (
        await db_session.execute(
            select(PublishedPhoto).where(PublishedPhoto.site_id == site.id)
        )
    ).scalars().all()
    captions = sorted((p.caption or "") for p in photos)
    assert captions == sorted(
        [_PROGRESS["caption"], "Human-written caption (keep me)"]
    )
