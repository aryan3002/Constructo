"""R1 — homeowner "My visits" photo upload (POST/GET/DELETE /homeowner/photos)."""
from __future__ import annotations

from sqlalchemy import select

from app.models import HomeownerVisitPhoto

from .conftest import auth

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIFfake-bytes"


async def test_upload_then_list_mine(client, db_session, ctx, tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))

    # Upload a visit photo (multipart) as the homeowner.
    resp = await client.post(
        "/api/v1/homeowner/photos",
        data={"caption": "My kitchen tiles"},
        files={"media": ("visit.jpg", JPEG, "image/jpeg")},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["caption"] == "My kitchen tiles"
    assert body["image_url"]  # presigned/local URL present
    assert body["is_starred"] is False

    # Row persisted under a homeowner/ key, tied to the caller's member.
    row = (
        await db_session.execute(select(HomeownerVisitPhoto))
    ).scalars().one()
    assert row.storage_key.startswith(f"homeowner/{ctx.site.id}/")
    assert row.member_id == ctx.member.id
    # Bytes landed on disk (local backend).
    assert (tmp_path / row.storage_key).read_bytes() == JPEG

    # The "My visits" view returns it.
    listed = await client.get(
        "/api/v1/homeowner/photos?view=mine", headers=auth(ctx.homeowner)
    )
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) == 1 and items[0]["id"] == body["id"]


async def test_non_image_rejected(client, ctx, tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    resp = await client.post(
        "/api/v1/homeowner/photos",
        files={"media": ("note.txt", b"hello", "text/plain")},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 415, resp.text


async def test_delete_own_photo(client, db_session, ctx, tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    up = await client.post(
        "/api/v1/homeowner/photos",
        files={"media": ("v.jpg", JPEG, "image/jpeg")},
        headers=auth(ctx.homeowner),
    )
    photo_id = up.json()["id"]

    dele = await client.delete(
        f"/api/v1/homeowner/photos/{photo_id}", headers=auth(ctx.homeowner)
    )
    assert dele.status_code == 204, dele.text

    remaining = (
        await db_session.execute(select(HomeownerVisitPhoto))
    ).scalars().all()
    assert remaining == []


M4A = b"\x00\x00\x00\x18ftypM4A fake-audio-bytes"


async def test_voice_note_upload_then_attach_to_request(
    client, ctx, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))

    # Upload the voice note (no STT provider in tests → empty transcript, audio kept).
    up = await client.post(
        "/api/v1/homeowner/voice-notes",
        files={"media": ("note.m4a", M4A, "audio/m4a")},
        headers=auth(ctx.homeowner),
    )
    assert up.status_code == 201, up.text
    body = up.json()
    key = body["voice_key"]
    assert key.startswith(f"homeowner/{ctx.site.id}/voice/")
    assert "transcript" in body  # present (may be empty without STT creds)
    assert (tmp_path / key).read_bytes() == M4A  # bytes landed (local backend)

    # Attach to a request; it comes back (and lists) with a resolvable voice_url.
    cr = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leaking tap in kitchen", "voice_key": key},
        headers=auth(ctx.homeowner),
    )
    assert cr.status_code == 201, cr.text
    assert cr.json()["voice_url"]

    lst = await client.get("/api/v1/homeowner/requests", headers=auth(ctx.homeowner))
    assert lst.status_code == 200
    assert lst.json()[0]["voice_url"]


async def test_voice_note_rejects_non_audio(client, ctx, tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    resp = await client.post(
        "/api/v1/homeowner/voice-notes",
        files={"media": ("x.jpg", JPEG, "image/jpeg")},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 415, resp.text


async def test_visit_photo_room_tag_upload_and_retag(
    client, ctx, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))

    # Upload tagged with a room — comes back with the tag.
    up = await client.post(
        "/api/v1/homeowner/photos",
        data={"room_tag": "Kitchen"},
        files={"media": ("v.jpg", JPEG, "image/jpeg")},
        headers=auth(ctx.homeowner),
    )
    assert up.status_code == 201, up.text
    pid = up.json()["id"]
    assert up.json()["room_tag"] == "Kitchen"

    # Re-tag it (PATCH).
    pat = await client.patch(
        f"/api/v1/homeowner/photos/{pid}",
        json={"room_tag": "Master Bedroom"},
        headers=auth(ctx.homeowner),
    )
    assert pat.status_code == 200, pat.text
    assert pat.json()["room_tag"] == "Master Bedroom"

    # The My-visits view reflects the tag.
    listed = await client.get(
        "/api/v1/homeowner/photos?view=mine", headers=auth(ctx.homeowner)
    )
    assert listed.json()["items"][0]["room_tag"] == "Master Bedroom"
