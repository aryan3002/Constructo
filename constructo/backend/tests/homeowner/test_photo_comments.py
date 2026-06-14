"""Threaded comments on a published feed photo."""
from __future__ import annotations

import uuid

from app.models import PublishedPhoto

from .conftest import auth


async def test_photo_comment_thread(client, db_session, ctx):
    photo = PublishedPhoto(site_id=ctx.site.id, image_url="wa-tripathi/x.jpg")
    db_session.add(photo)
    await db_session.flush()
    pid = str(photo.id)

    # Empty thread.
    r0 = await client.get(
        f"/api/v1/homeowner/photos/{pid}/comments", headers=auth(ctx.homeowner)
    )
    assert r0.status_code == 200 and r0.json() == []

    # Add a comment — author role snapshotted, is_mine true for the author.
    cr = await client.post(
        f"/api/v1/homeowner/photos/{pid}/comments",
        json={"body": "Is this the kitchen tile?"},
        headers=auth(ctx.homeowner),
    )
    assert cr.status_code == 201, cr.text
    body = cr.json()
    assert body["body"] == "Is this the kitchen tile?"
    assert body["is_mine"] is True
    assert body["author_role"] == "primary_owner"

    # Thread lists it.
    r1 = await client.get(
        f"/api/v1/homeowner/photos/{pid}/comments", headers=auth(ctx.homeowner)
    )
    assert len(r1.json()) == 1


async def test_comment_on_missing_photo_404(client, ctx):
    r = await client.post(
        f"/api/v1/homeowner/photos/{uuid.uuid4()}/comments",
        json={"body": "x"},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 404


async def test_empty_comment_rejected(client, db_session, ctx):
    photo = PublishedPhoto(site_id=ctx.site.id, image_url="wa-tripathi/y.jpg")
    db_session.add(photo)
    await db_session.flush()
    r = await client.post(
        f"/api/v1/homeowner/photos/{photo.id}/comments",
        json={"body": ""},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 422
