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
