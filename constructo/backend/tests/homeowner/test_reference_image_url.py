"""Design references only take real images (T6): an http(s) link or a key under
this site's own upload prefix. Old rows holding a phone's device path are
hidden from the list and the fingerprint, never deleted."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.homeowner.router import _build_site_fingerprint
from app.models import DesignReference

from .conftest import auth


async def _post(client, ctx, image_url):
    return await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": image_url, "source": "upload"},
        headers=auth(ctx.homeowner),
    )


async def test_accepts_links_and_own_upload_keys(client, ctx):
    for url in (
        "https://i.pinimg.com/abc.jpg",
        "http://example.com/x.png",
        f"homeowner/{ctx.site.id}/design/0a1b.jpg",
        f"design/{ctx.site.id}/0a1b.jpg",  # the profiler's upload prefix
    ):
        r = await _post(client, ctx, url)
        assert r.status_code == 201, (url, r.text)


@pytest.mark.parametrize(
    "url",
    [
        "file:///var/mobile/Containers/Data/picker/IMG_1.jpg",
        "content://media/external/images/media/42",
        "ph://ABC-123",
        "assets-library://asset/asset.JPG?id=1",
        "blob:http://localhost:8081/1234",
        "data:image/jpeg;base64,AAAA",
        "FILE:///upper.jpg",
    ],
)
async def test_rejects_device_paths(client, ctx, url):
    r = await _post(client, ctx, url)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "invalid_image_url"


async def test_rejects_other_sites_and_other_folders_keys(client, ctx, factory):
    other = await factory.site(ctx.company, name="Other")
    for url in (
        f"homeowner/{other.id}/design/x.jpg",
        f"design/{other.id}/x.jpg",
        f"homeowner/{ctx.site.id}/voice/x.m4a",  # own site, wrong folder
        f"homeowner/{ctx.site.id}/design/../../secret.pdf",
        "payroll/salaries.pdf",
    ):
        r = await _post(client, ctx, url)
        assert r.status_code == 422, url
        assert r.json()["error"]["code"] == "invalid_image_url"


async def test_existing_device_path_rows_are_hidden_not_deleted(client, ctx, db_session):
    bad = DesignReference(
        site_id=ctx.site.id, image_url="file:///data/user/0/picker/IMG.jpg",
        room_tag="Kitchen", source="upload", actor_member_id=ctx.member.id,
    )
    good = DesignReference(
        site_id=ctx.site.id, image_url=f"homeowner/{ctx.site.id}/design/ok.jpg",
        room_tag="Bedroom", source="upload", actor_member_id=ctx.member.id,
    )
    db_session.add_all([bad, good])
    await db_session.flush()

    listed = await client.get("/api/v1/homeowner/design/references", headers=auth(ctx.homeowner))
    assert listed.status_code == 200
    assert [r["id"] for r in listed.json()] == [str(good.id)]

    fingerprint = await _build_site_fingerprint(db_session, ctx.site.id)
    assert fingerprint["reference_tags"] == ["Bedroom"]

    # The data is untouched.
    rows = (await db_session.execute(select(DesignReference.id))).scalars().all()
    assert set(rows) == {bad.id, good.id}
