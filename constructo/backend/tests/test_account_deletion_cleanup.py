"""S6 — deleting an account stops its pushes and scrubs its name/phone from
the content it authored."""
from datetime import UTC, datetime

from sqlalchemy import select

from app.auth.jwt import create_access_token, create_step_up_token
from app.models import (
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    PhotoComment,
    PublishedPhoto,
    PushToken,
    RawMessageModel,
    UserRole,
)
from app.push.sender import _push_tokens_for_site, push_tokens_for_user


def _delete_headers(user) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}",
        "X-Step-Up-Token": create_step_up_token(str(user.id)),
    }


def _raw(sender_id: str, name: str) -> RawMessageModel:
    return RawMessageModel(
        source="app",
        external_group_id="g1",
        sender_id=sender_id,
        sender_name=name,
        media_type="text",
        text="Cement 100 bags aaye",
        sent_at=datetime.now(UTC),
    )


async def test_deletion_removes_push_tokens_on_both_paths(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(company=company, role=UserRole.homeowner, phone="+919810000101")
    db_session.add(PushToken(user_id=user.id, token="ExponentPushToken[a]"))
    db_session.add(PushToken(user_id=user.id, token="ExponentPushToken[b]"))
    member = HomeownerMember(
        site_id=site.id,
        user_id=user.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
        notif_prefs={"push_token": "ExponentPushToken[hm]", "cadence": {"x": "daily"}},
    )
    db_session.add(member)
    await db_session.commit()

    resp = await client.delete("/api/v1/users/me", headers=_delete_headers(user))
    assert resp.status_code == 204, resp.text

    left = (
        await db_session.execute(select(PushToken).where(PushToken.user_id == user.id))
    ).scalars().all()
    assert left == []
    await db_session.refresh(member)
    assert "push_token" not in member.notif_prefs
    assert member.notif_prefs["cadence"] == {"x": "daily"}  # other prefs kept


async def test_deletion_scrubs_authored_raw_messages_and_comments(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(
        company=company, role=UserRole.homeowner, phone="+919810000102", name="Asha Rao"
    )
    other = await factory.user(company=company, role=UserRole.supervisor, name="Ravi")
    db_session.add_all(
        [
            _raw(str(user.id), "Asha Rao"),  # in-app capture/chat
            _raw("919810000102@s.whatsapp.net", "Asha"),  # WhatsApp via the bridge
            _raw(str(other.id), "Ravi"),
        ]
    )
    member = HomeownerMember(
        site_id=site.id,
        user_id=user.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()
    photo = PublishedPhoto(site_id=site.id, image_url="photos/x.jpg")
    db_session.add(photo)
    await db_session.flush()
    db_session.add(
        PhotoComment(
            site_id=site.id, photo_id=photo.id, member_id=member.id,
            author_name="Asha Rao", body="Love it",
        )
    )
    await db_session.commit()

    resp = await client.delete("/api/v1/users/me", headers=_delete_headers(user))
    assert resp.status_code == 204, resp.text

    rows = (await db_session.execute(select(RawMessageModel))).scalars().all()
    for r in rows:
        await db_session.refresh(r)
    names = {r.sender_name for r in rows}
    assert "Asha Rao" not in names and "Asha" not in names and "Ravi" in names
    assert all("919810000102" not in r.sender_id for r in rows)
    comment = (await db_session.execute(select(PhotoComment))).scalar_one()
    await db_session.refresh(comment)
    assert comment.author_name == "Deleted user"


async def test_push_resolvers_skip_inactive_and_deleted_users(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    active = await factory.user(company=company, role=UserRole.supervisor)
    inactive = await factory.user(company=company, role=UserRole.supervisor)
    inactive.is_active = False
    deleted = await factory.user(company=company, role=UserRole.homeowner)
    deleted.deleted_at = datetime.now(UTC)
    for u, tok in ((active, "t-active"), (inactive, "t-inactive"), (deleted, "t-deleted")):
        db_session.add(PushToken(user_id=u.id, token=tok))
    for u, tok in ((active, "hm-active"), (deleted, "hm-deleted")):
        db_session.add(
            HomeownerMember(
                site_id=site.id, user_id=u.id, sub_role=HomeownerSubRole.family,
                status=MemberStatus.active, notif_prefs={"push_token": tok},
            )
        )
    await db_session.flush()

    assert await push_tokens_for_user(session=db_session, user_id=active.id) == ["t-active"]
    assert await push_tokens_for_user(session=db_session, user_id=inactive.id) == []
    assert await push_tokens_for_user(session=db_session, user_id=deleted.id) == []
    assert await _push_tokens_for_site(db_session, site.id) == ["hm-active"]


async def test_deletion_scrubs_name_and_phone_from_raw_json_and_events(
    client, factory, db_session
):
    from datetime import date

    from app.models import SiteEventModel

    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(
        company=company, role=UserRole.supervisor, phone="+919810000103", name="Asha Rao"
    )
    other = await factory.user(company=company, role=UserRole.supervisor, name="Ravi Kumar")
    mine = _raw("919810000103@s.whatsapp.net", "Asha")
    mine.raw = {
        "pushName": "Asha",
        "key": {"participant": "919810000103@s.whatsapp.net"},
        "message": {"conversation": "Asha Rao here, call me on +91 98100 00103"},
    }
    theirs = _raw(str(other.id), "Ravi Kumar")
    theirs.raw = {"message": {"conversation": "Asha Rao asked for cement; Asha will pay"}}
    db_session.add_all([mine, theirs])
    await db_session.flush()
    my_event = SiteEventModel(
        site_id=site.id,
        event_type="material_delivery",
        occurred_on=date.today(),
        summary="ASHA  RAO (9810000103) logged 100 bags; Ashara stays",
        fields={"reported_by": "Asha Rao", "contact": "09810000103", "qty": 100},
        confidence=0.9,
        source_message_ids=[mine.id],
    )
    their_event = SiteEventModel(
        site_id=site.id,
        event_type="note",
        occurred_on=date.today(),
        summary="Asha Rao asked for cement",
        fields={"by": "Ravi Kumar"},
        confidence=0.9,
        source_message_ids=[theirs.id],
    )
    db_session.add_all([my_event, their_event])
    await db_session.commit()

    resp = await client.delete("/api/v1/users/me", headers=_delete_headers(user))
    assert resp.status_code == 204, resp.text

    for row in (mine, theirs, my_event, their_event):
        await db_session.refresh(row)
    assert mine.raw == {
        "pushName": "Deleted user",
        "key": {"participant": "Deleted user"},
        "message": {"conversation": "Deleted user here, call me on Deleted user"},
    }
    assert my_event.summary == "Deleted user (Deleted user) logged 100 bags; Ashara stays"
    assert my_event.fields == {
        "reported_by": "Deleted user", "contact": "Deleted user", "qty": 100
    }
    # Another person's message and event are untouched, even where they name her.
    assert theirs.raw == {"message": {"conversation": "Asha Rao asked for cement; Asha will pay"}}
    assert their_event.summary == "Asha Rao asked for cement"
    assert their_event.fields == {"by": "Ravi Kumar"}


def test_identity_patterns_match_full_name_and_phone_formats_only():
    from app.auth.scrub import identity_patterns, scrub_text

    pats = identity_patterns("Asha Rao", "+919810000103")
    for text in (
        "+919810000103", "919810000103", "9810000103", "09810000103",
        "+91 98100 00103", "98100-00103", "asha rao", "Asha\nRao",
    ):
        assert scrub_text(text, pats) == "Deleted user", text
    for text in ("Asha", "Rao", "Ashara Rao", "Asha Raoji", "198100001034", "9810000104"):
        assert scrub_text(text, pats) == text, text
    # Already-deleted or empty names add no name pattern.
    assert len(identity_patterns("Deleted user", "")) == 0
    assert len(identity_patterns(None, "")) == 0
