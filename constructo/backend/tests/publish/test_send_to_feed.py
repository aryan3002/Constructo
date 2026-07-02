"""Chat "Send to feed": publish an existing chat photo into the homeowner feed.

Covers the endpoint (POST /api/v1/publish/photo/from-chat), its access + role
gates, idempotency, blank-caption normalization, and the chat message-out
``feed_photo_id`` reflecting feed membership.

Harness: ``client`` and ``db_session`` share one savepoint-mode session, so ORM
rows added to ``db_session`` are visible to the API and vice-versa.
"""
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    MessageSide,
    PublishedPhoto,
)
from app.models.user import UserRole
from app.sites.models import SiteAssignment

pytestmark = pytest.mark.asyncio


def _auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _site_conversation(db_session, ctx) -> Conversation:
    """The crew per-site thread (kind=site) for the ctx site."""
    conv = Conversation(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=ConversationKind.site,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _image_message(
    db_session,
    conv: Conversation,
    sender,
    *,
    seq: int = 1,
    attachment_key: str = "chat/x/photo.jpg",
    mime: str = "image/jpeg",
) -> ChatMessage:
    """A photo message in ``conv`` (image attachment + image mime)."""
    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=sender.id,
        sender_side=MessageSide.contractor,
        client_msg_id=uuid4(),
        seq=seq,
        body=None,
        media_type="image",
        attachment_key=attachment_key,
        attachment_mime=mime,
    )
    db_session.add(msg)
    await db_session.flush()
    return msg


async def _text_message(db_session, conv: Conversation, sender, *, seq: int = 2) -> ChatMessage:
    """A plain (non-image) message in ``conv``."""
    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=sender.id,
        sender_side=MessageSide.contractor,
        client_msg_id=uuid4(),
        seq=seq,
        body="just talking",
        media_type="text",
    )
    db_session.add(msg)
    await db_session.flush()
    return msg


async def test_from_chat_creates_feed_photo_visible_to_both_sides(client, ctx, db_session):
    """(a) The published row reuses the chat attachment key + source id, and shows
    up in the homeowner feed AND the contractor album."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _image_message(db_session, conv, ctx.owner, attachment_key="chat/s/kitchen.jpg")

    res = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id), "caption": "Kitchen slab poured"},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 201, res.text
    photo_id = res.json()["id"]
    assert res.json()["caption"] == "Kitchen slab poured"
    assert res.json()["shared_by_name"] == ctx.owner.name

    # The stored row reuses the chat attachment key verbatim + links the source.
    row = (
        await db_session.execute(select(PublishedPhoto).where(PublishedPhoto.id == photo_id))
    ).scalar_one()
    assert row.image_url == msg.attachment_key == "chat/s/kitchen.jpg"
    assert row.source_chat_message_id == msg.id
    assert row.site_id == ctx.site.id

    # Homeowner feed (the homeowner sees the curated photo).
    feed = await client.get("/api/v1/homeowner/photos", headers=_auth(ctx.homeowner))
    assert feed.status_code == 200, feed.text
    assert any(i["id"] == photo_id for i in feed.json()["items"])

    # Contractor album (the owner sees it with attribution).
    album = await client.get(
        f"/api/v1/publish/photos?site_id={ctx.site.id}", headers=_auth(ctx.owner)
    )
    assert album.status_code == 200, album.text
    assert any(i["id"] == photo_id for i in album.json())


async def test_from_chat_is_idempotent(client, ctx, db_session):
    """(b) Re-sending the same message returns the same feed photo; count stays 1."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _image_message(db_session, conv, ctx.owner)

    first = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(ctx.owner),
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(ctx.owner),
    )
    assert second.status_code in (200, 201), second.text
    assert second.json()["id"] == first.json()["id"]

    count = (
        await db_session.execute(
            select(func.count())
            .select_from(PublishedPhoto)
            .where(PublishedPhoto.source_chat_message_id == msg.id)
        )
    ).scalar_one()
    assert count == 1


async def test_from_chat_non_member_forbidden(client, ctx, factory, db_session):
    """(c) A user outside the conversation's scope gets 403."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _image_message(db_session, conv, ctx.owner)

    other_company = await factory.company()
    outsider = await factory.user(company=other_company, role=UserRole.owner)
    res = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(outsider),
    )
    assert res.status_code == 403, res.text


async def test_from_chat_homeowner_role_forbidden(client, ctx, factory, db_session):
    """(d) A homeowner-role caller is rejected even for her own site's photo
    (only the contractor publishes into the feed)."""
    conv = await _site_conversation(db_session, ctx)
    # Crew member posts the photo; the homeowner tries to publish it.
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=ctx.site.id, user_id=crew.id))
    await db_session.flush()
    msg = await _image_message(db_session, conv, crew)

    res = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(ctx.homeowner),
    )
    assert res.status_code == 403, res.text


async def test_from_chat_non_image_message_rejected(client, ctx, db_session):
    """(e) A non-image message → 400 not_an_image."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _text_message(db_session, conv, ctx.owner)

    res = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 400, res.text
    assert res.json()["error"]["code"] == "not_an_image"


async def test_from_chat_blank_caption_stored_as_null(client, ctx, db_session):
    """(f) A blank/whitespace caption is normalized to NULL."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _image_message(db_session, conv, ctx.owner)

    res = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id), "caption": "   ", "room_tag": ""},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 201, res.text
    assert res.json()["caption"] is None
    assert res.json()["room_tag"] is None

    row = (
        await db_session.execute(
            select(PublishedPhoto).where(PublishedPhoto.id == res.json()["id"])
        )
    ).scalar_one()
    assert row.caption is None
    assert row.room_tag is None


async def test_chat_message_out_feed_photo_id_reflects_publish(client, ctx, db_session):
    """(g) The chat message-out ``feed_photo_id`` is null before publishing and
    equals the feed photo id after (single batched lookup, no N+1)."""
    conv = await _site_conversation(db_session, ctx)
    msg = await _image_message(db_session, conv, ctx.owner)

    before = await client.get(
        f"/api/v1/chat/messages?conversation_id={conv.id}", headers=_auth(ctx.owner)
    )
    assert before.status_code == 200, before.text
    row_before = next(m for m in before.json() if m["id"] == str(msg.id))
    assert row_before["feed_photo_id"] is None

    pub = await client.post(
        "/api/v1/publish/photo/from-chat",
        json={"message_id": str(msg.id)},
        headers=_auth(ctx.owner),
    )
    assert pub.status_code == 201, pub.text
    photo_id = pub.json()["id"]

    after = await client.get(
        f"/api/v1/chat/messages?conversation_id={conv.id}", headers=_auth(ctx.owner)
    )
    assert after.status_code == 200, after.text
    row_after = next(m for m in after.json() if m["id"] == str(msg.id))
    assert row_after["feed_photo_id"] == photo_id
