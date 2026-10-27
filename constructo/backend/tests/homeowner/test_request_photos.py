"""Issue-report photos are attached to the request (T6), and only the caller's
own photos and voice notes can be attached."""
from __future__ import annotations

from app.models import HomeownerMember, HomeownerSubRole, HomeownerVisitPhoto, MemberStatus

from .conftest import auth

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIFfake-bytes"


async def _upload(client, user):
    r = await client.post(
        "/api/v1/homeowner/photos",
        data={"caption": "Leak"},
        files={"media": ("leak.jpg", JPEG, "image/jpeg")},
        headers=auth(user),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_own_photos_are_attached_and_returned_to_both_sides(
    client, ctx, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    p1 = await _upload(client, ctx.homeowner)
    p2 = await _upload(client, ctx.homeowner)

    cr = await client.post(
        "/api/v1/homeowner/requests",
        # A duplicate id is collapsed, not rejected.
        json={"title": "Leaking tap", "detail": "Kitchen", "photo_ids": [p1, p2, p1]},
        headers=auth(ctx.homeowner),
    )
    assert cr.status_code == 201, cr.text
    photos = cr.json()["photos"]
    assert [p["id"] for p in photos] == [p1, p2]
    assert all(p["url"] for p in photos)

    mine = await client.get("/api/v1/homeowner/requests", headers=auth(ctx.homeowner))
    assert [p["id"] for p in mine.json()[0]["photos"]] == [p1, p2]

    # The builder's read reuses the same mapper.
    owner_view = await client.get("/api/v1/requests", headers=auth(ctx.owner))
    assert owner_view.status_code == 200, owner_view.text
    row = next(r for r in owner_view.json() if r["id"] == cr.json()["id"])
    assert [p["id"] for p in row["photos"]] == [p1, p2]
    assert all(p["url"] for p in row["photos"])


async def test_a_request_without_photos_has_an_empty_list(client, ctx):
    cr = await client.post(
        "/api/v1/homeowner/requests", json={"title": "Question"}, headers=auth(ctx.homeowner)
    )
    assert cr.status_code == 201, cr.text
    assert cr.json()["photos"] == []


async def test_another_sites_photo_is_rejected(client, ctx, factory, db_session):
    other_site = await factory.site(ctx.company, name="Other")
    photo = HomeownerVisitPhoto(site_id=other_site.id, member_id=None, storage_key="x.jpg")
    db_session.add(photo)
    await db_session.flush()

    r = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak", "photo_ids": [str(photo.id)]},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "invalid_photo"


async def test_a_household_members_photo_is_not_yours_to_attach(
    client, ctx, factory, db_session
):
    from app.models import UserRole

    other = await factory.user(company=ctx.company, role=UserRole.homeowner)
    other_member = HomeownerMember(
        site_id=ctx.site.id, user_id=other.id,
        sub_role=HomeownerSubRole.family, status=MemberStatus.active,
    )
    db_session.add(other_member)
    await db_session.flush()
    photo = HomeownerVisitPhoto(site_id=ctx.site.id, member_id=other_member.id, storage_key="y.jpg")
    db_session.add(photo)
    await db_session.flush()

    r = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak", "photo_ids": [str(photo.id)]},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_photo"


async def test_unknown_photo_gets_the_same_opaque_error(client, ctx):
    r = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak", "photo_ids": ["00000000-0000-0000-0000-000000000001"]},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_photo"


async def test_more_than_five_photos_is_rejected(client, ctx):
    ids = [f"00000000-0000-0000-0000-00000000000{i}" for i in range(1, 7)]
    r = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak", "photo_ids": ids},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 422


async def test_foreign_voice_key_is_rejected(client, ctx, factory):
    other_site = await factory.site(ctx.company, name="Other")
    for key in (
        f"homeowner/{other_site.id}/voice/abc.m4a",  # another site's note
        "payroll/salaries.pdf",  # anything else in the bucket
        f"homeowner/{ctx.site.id}/voice/../../secret.pdf",
    ):
        r = await client.post(
            "/api/v1/homeowner/requests",
            json={"title": "Leak", "voice_key": key},
            headers=auth(ctx.homeowner),
        )
        assert r.status_code == 422, key
        assert r.json()["error"]["code"] == "invalid_voice_key"

        f = await client.post(
            "/api/v1/homeowner/flag",
            json={"note": "Off", "voice_key": key},
            headers=auth(ctx.homeowner),
        )
        assert f.status_code == 422, key
        assert f.json()["error"]["code"] == "invalid_voice_key"


async def test_own_voice_key_is_accepted(client, ctx):
    key = f"homeowner/{ctx.site.id}/voice/0123abcd.m4a"
    r = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak", "voice_key": key},
        headers=auth(ctx.homeowner),
    )
    assert r.status_code == 201, r.text
    assert r.json()["voice_url"]

    f = await client.post(
        "/api/v1/homeowner/flag",
        json={"note": "Off", "voice_key": key},
        headers=auth(ctx.homeowner),
    )
    assert f.status_code == 201, f.text
