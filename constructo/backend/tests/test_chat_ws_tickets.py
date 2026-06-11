"""WS tickets: short-lived, single-use, JWT-authed issuance."""
from app.chat.tickets import InMemoryTicketStore, get_ticket_store
from tests.test_chat_api import auth  # reuse the header helper


async def test_issue_and_consume_once():
    store = InMemoryTicketStore()
    ticket = await store.issue("user-123")
    assert await store.consume(ticket) == "user-123"
    assert await store.consume(ticket) is None  # single-use


async def test_expired_ticket_rejected():
    store = InMemoryTicketStore(ttl_seconds=0)
    ticket = await store.issue("user-123")
    assert await store.consume(ticket) is None


async def test_ws_ticket_endpoint_requires_auth_and_issues(client, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    resp = await client.post("/api/v1/chat/ws-ticket")
    assert resp.status_code in (401, 403)
    resp = await client.post("/api/v1/chat/ws-ticket", headers=auth(user))
    assert resp.status_code == 200
    ticket = resp.json()["ticket"]
    assert await get_ticket_store().consume(ticket) == str(user.id)
