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


# ---- client_capture_id: a retried capture lands once (T9) ---------------------


async def _app_rows(db_session):
    return (
        await db_session.execute(select(RawMessageModel).where(RawMessageModel.source == "app"))
    ).scalars().all()


async def test_capture_same_client_id_twice_files_once(
    client, db_session, world, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    queued: list = []

    async def _record(raw_id):
        queued.append(raw_id)

    monkeypatch.setattr("app.capture.router.enqueue_extraction", _record)
    _, owner, site = world
    form = {"site_id": str(site.id), "type": "progress", "client_capture_id": "cap_1"}
    photo = {"media": ("slab.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")}

    first = await client.post("/api/v1/capture", data=form, files=photo, headers=auth(owner))
    second = await client.post("/api/v1/capture", data=form, files=photo, headers=auth(owner))

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json()["raw_message_id"] == first.json()["raw_message_id"]
    rows = await _app_rows(db_session)
    assert len(rows) == 1
    assert rows[0].provider_message_id == f"{owner.id}:cap_1"
    # The repeat stored no media and queued no second extraction.
    assert len(list((tmp_path / "captures").iterdir())) == 1
    assert len(queued) == 1


async def test_capture_same_client_id_different_users_files_twice(
    client, db_session, factory, world
):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.owner, name="Second owner")
    form = {"site_id": str(site.id), "text": "Plaster done", "client_capture_id": "cap_1"}

    a = await client.post("/api/v1/capture", data=form, headers=auth(owner))
    b = await client.post("/api/v1/capture", data=form, headers=auth(pm))

    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["raw_message_id"] != b.json()["raw_message_id"]
    assert len(await _app_rows(db_session)) == 2


async def test_capture_without_client_id_is_unchanged(client, db_session, world):
    _, owner, site = world
    form = {"site_id": str(site.id), "text": "Plaster done"}

    a = await client.post("/api/v1/capture", data=form, headers=auth(owner))
    b = await client.post("/api/v1/capture", data=form, headers=auth(owner))

    assert a.json()["status"] == "queued" and b.json()["status"] == "queued"
    assert a.json()["raw_message_id"] != b.json()["raw_message_id"]
    rows = await _app_rows(db_session)
    assert len(rows) == 2
    assert all(r.provider_message_id is None for r in rows)


async def test_capture_client_id_race_returns_existing_and_drops_media(
    client, db_session, world, tmp_path, monkeypatch
):
    """Two sends raced past the lookup: the insert hits the unique index, and
    the loser answers with the winner's row and deletes the media it stored."""
    from app.capture import router as capture_router
    from app.config import settings

    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    _, owner, site = world
    winner = RawMessageModel(
        source="app",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        media_type="text",
        text="first send",
        sent_at=datetime.now(UTC),
        provider_message_id=f"{owner.id}:cap_race",
    )
    db_session.add(winner)
    await db_session.commit()
    winner_id = str(winner.id)  # the endpoint's rollback expires `winner`

    real_lookup = capture_router._existing_capture
    calls = {"n": 0}

    async def _miss_first(session, pmid):
        calls["n"] += 1
        return None if calls["n"] == 1 else await real_lookup(session, pmid)

    monkeypatch.setattr(capture_router, "_existing_capture", _miss_first)
    resp = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "client_capture_id": "cap_race"},
        files={"media": ("slab.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")},
        headers=auth(owner),
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["raw_message_id"] == winner_id
    assert len(await _app_rows(db_session)) == 1
    assert list((tmp_path / "captures").iterdir()) == []


async def test_capture_client_id_too_long_is_422(client, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/capture",
        data={"site_id": str(site.id), "text": "x", "client_capture_id": "c" * 101},
        headers=auth(owner),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_client_capture_id"

