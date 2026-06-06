"""App-authenticated capture (POST /api/v1/capture) + the worker app-path.

FakeLLM, no network. Covers: a text capture stores a source="app" RawMessage;
the worker resolves the site from "app:{site_id}" and creates a SiteEvent; a
user not assigned to the site is forbidden; a media capture stores the file and
sets media_url + an inferred media_type.
"""
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Heights")
    return company, owner, site


async def test_capture_text_stores_app_raw_message(client, db_session, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "type": "progress", "text": "Pehli manzil ka slab ho gaya"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "queued"

    rows = (
        await db_session.execute(select(RawMessageModel).where(RawMessageModel.source == "app"))
    ).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.external_group_id == f"app:{site.id}"
    assert row.sender_id == str(owner.id)
    assert row.text == "Pehli manzil ka slab ho gaya"
    assert row.media_type == "text"


async def test_worker_app_path_creates_event_for_site(client, db_session, world):
    """A source="app" message resolves its site from external_group_id and the
    pipeline produces a SiteEvent for exactly that site (no group mapping)."""
    _, owner, site = world
    raw = RawMessageModel(
        source="app",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        sender_name=owner.name,
        media_type="text",
        text="32 mazdoor aaye aaj",
        sent_at=datetime.now(UTC),
    )
    db_session.add(raw)
    await db_session.flush()

    ids = await handle_ingested(
        raw.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1
    event = await db_session.get(SiteEventModel, ids[0])
    assert event is not None
    assert event.site_id == site.id
    assert event.event_type == "attendance"


async def test_worker_structured_card_skips_llm_and_books_verbatim(db_session, world):
    """Phase 0.1 end-to-end: a typed card (capture_type + fields) flows through the
    real worker, skips the LLM, and books the event verbatim at confidence 1.0."""
    _, owner, site = world
    raw = RawMessageModel(
        source="app",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        sender_name=owner.name,
        media_type="text",
        text="50 bori cement ACC",
        sent_at=datetime.now(UTC),
        raw={
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 50, "vendor": "ACC"},
        },
    )
    db_session.add(raw)
    await db_session.flush()

    ids = await handle_ingested(
        raw.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1
    event = await db_session.get(SiteEventModel, ids[0])
    # confidence 1.0 + verbatim fields is the fingerprint of the deterministic
    # fast path (the LLM/Fake path yields ~0.8 and re-derived fields). The unit
    # test asserts extract() itself never calls the LLM; here we prove the
    # end-to-end booking. (The bot's intent classifier may still use the LLM —
    # that's a separate consumer and not part of extraction.)
    assert event.event_type == "material_delivery"
    assert event.fields == {"material": "cement", "quantity": 50, "vendor": "ACC"}
    assert event.confidence == 1.0
    assert event.needs_clarification is False


async def test_capture_endpoint_accepts_structured_fields(client, db_session, world):
    """The /capture endpoint stows a typed card's structured `fields` JSON so the
    deterministic extraction path can use them."""
    import json as _json

    _, owner, site = world
    resp = await client.post(
        "/api/v1/capture",
        data={
            "site_id": str(site.id),
            "type": "attendance",
            "fields": _json.dumps({"headcount": 12, "by_trade": {"mason": 8, "helper": 4}}),
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    row = (
        await db_session.execute(select(RawMessageModel).where(RawMessageModel.source == "app"))
    ).scalars().one()
    assert row.raw["capture_type"] == "attendance"
    assert row.raw["fields"] == {"headcount": 12, "by_trade": {"mason": 8, "helper": 4}}


async def test_worker_app_path_unknown_site_is_skipped(db_session, world):
    """An app message pointing at a non-existent site is skipped (no invented data)."""
    _, owner, _ = world
    raw = RawMessageModel(
        source="app",
        external_group_id="app:00000000-0000-0000-0000-000000000000",
        sender_id=str(owner.id),
        media_type="text",
        text="hello",
        sent_at=datetime.now(UTC),
    )
    db_session.add(raw)
    await db_session.flush()
    ids = await handle_ingested(raw.id, session_factory=_session_factory(db_session))
    assert ids == []


async def test_capture_forbidden_when_not_assigned(client, db_session, world):
    company, _, site = world
    from app.models import User

    # A supervisor with NO SiteAssignment cannot capture on the site.
    sup = User(company_id=company.id, role=UserRole.supervisor, phone="+919811112222", name="Sup")
    db_session.add(sup)
    await db_session.flush()
    resp = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "text": "trying"},
        headers=auth(sup),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"

    # Once assigned, the same capture succeeds.
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    ok = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "text": "trying again"},
        headers=auth(sup),
    )
    assert ok.status_code == 201, ok.text


async def test_capture_media_stores_file(client, db_session, world, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    _, owner, site = world
    resp = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "type": "delivery"},
        files={"media": ("slab.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text

    row = (
        await db_session.execute(select(RawMessageModel).where(RawMessageModel.source == "app"))
    ).scalars().one()
    assert row.media_type == "image"
    # Stored as a storage key under the captures/ prefix (durable on S3/R2).
    assert row.media_url is not None and row.media_url.startswith("captures/app_")
    saved = tmp_path / row.media_url
    assert saved.exists() and saved.read_bytes().startswith(b"\xff\xd8\xff")
