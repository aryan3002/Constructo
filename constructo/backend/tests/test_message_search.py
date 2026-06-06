"""Message RAG search (2.3) — semantic retrieval over the thread, scoped + abstain."""
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import ChatMessage, Conversation, ConversationKind, UserRole
from app.search.embeddings import FakeEmbeddings
from app.search.index_message import index_all_unindexed_messages, index_message
from app.sites.models import SiteAssignment


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _post(client, user, site_id, body):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site_id), "client_msg_id": str(uuid4()), "body": body},
        headers=auth(user),
    )
    return resp.json()["id"]


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_message_search_retrieves_relevant(client, db_session, world):
    _, owner, site = world
    mid = await _post(
        client, owner, site.id, "the second floor slab developed a leak near the column"
    )
    await _post(client, owner, site.id, "lunch break at 1pm today")
    # Index directly (network-free FakeEmbeddings); the worker does this in prod.
    for m in (await db_session.execute(select(ChatMessage))).scalars().all():
        await index_message(db_session, m.id, client=FakeEmbeddings())
    await db_session.commit()

    resp = await client.post(
        "/api/v1/search/messages",
        json={"query": "slab leak near column", "site_id": str(site.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answerable"]
    assert body["hits"][0]["message_id"] == mid  # the leak message ranks first


async def test_message_search_scoped_to_visible_sites(client, db_session, factory, world):
    """A supervisor can't retrieve another site's messages."""
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    other = await factory.site(company, name="Other")
    await _post(client, owner, site.id, "cement arrived at sunrise")
    await _post(client, owner, other.id, "cement arrived at other site")
    for m in (await db_session.execute(select(ChatMessage))).scalars().all():
        await index_message(db_session, m.id, client=FakeEmbeddings())
    await db_session.commit()

    resp = await client.post(
        "/api/v1/search/messages", json={"query": "cement arrived"}, headers=auth(sup)
    )
    site_ids = {h["site_id"] for h in resp.json()["hits"]}
    assert str(other.id) not in site_ids  # the other site never leaks


async def test_message_search_no_visible_sites_abstains(client, factory, world):
    company, _, _ = world
    stranger = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.post(
        "/api/v1/search/messages", json={"query": "anything"}, headers=auth(stranger)
    )
    assert resp.json() == {"hits": [], "answerable": False}


async def test_backfill_indexes_all_unindexed_then_searchable(client, db_session, world):
    """The backfill embeds historical messages so they become searchable."""
    _, owner, site = world
    await _post(client, owner, site.id, "foundation waterproofing finished in the basement")
    await _post(client, owner, site.id, "tea break")
    n = await index_all_unindexed_messages(db_session, client=FakeEmbeddings())
    assert n >= 2
    # Re-run is a no-op (idempotent).
    assert await index_all_unindexed_messages(db_session, client=FakeEmbeddings()) == 0

    resp = await client.post(
        "/api/v1/search/messages",
        json={"query": "basement waterproofing", "site_id": str(site.id)},
        headers=auth(owner),
    )
    assert resp.json()["answerable"]


async def test_index_message_skips_empty(client, db_session, world):
    _, owner, site = world
    conv = Conversation(
        company_id=owner.company_id, site_id=site.id,
        kind=ConversationKind.site, created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    blank = ChatMessage(
        conversation_id=conv.id, sender_id=owner.id, sender_side="contractor",
        client_msg_id=uuid4(), seq=1, body=None, media_type="document",
    )
    db_session.add(blank)
    await db_session.flush()
    assert await index_message(db_session, blank.id, client=FakeEmbeddings()) is None
