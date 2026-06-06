"""Homeowner @ask (Trust Membrane Q&A) — grounded in the PUBLISHED slice only,
calm, digit-guarded, abstains to 'ask your builder'."""
from datetime import UTC, datetime

import app.extraction.llm as llm_mod
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.models import Update, UpdateType


def _auth(u):
    return {"Authorization": f"Bearer {create_access_token(str(u.id), u.role.value)}"}


def _update(site_id, title, body):
    return Update(
        site_id=site_id, type=UpdateType.progress, title=title, body=body,
        published_at=datetime.now(UTC),
    )


async def test_homeowner_ask_answers_from_published_updates(client, ctx, db_session, monkeypatch):
    db_session.add(
        _update(ctx.site.id, "Living room", "The living room walls got their second coat.")
    )
    await db_session.flush()
    monkeypatch.setattr(
        llm_mod, "get_llm_client",
        lambda: FakeLLMClient(
            canned={"grounded": True, "answer": "The living room walls got their second coat."}
        ),
    )
    resp = await client.post(
        "/api/v1/homeowner/ask",
        json={"question": "what's happening in the living room?"},
        headers=_auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answerable"] is True
    assert "living room" in body["answer"].lower()


async def test_homeowner_ask_abstains_with_no_updates(client, ctx, monkeypatch):
    monkeypatch.setattr(
        llm_mod, "get_llm_client",
        lambda: FakeLLMClient(canned={"grounded": True, "answer": "anything"}),
    )
    resp = await client.post(
        "/api/v1/homeowner/ask", json={"question": "is it done?"}, headers=_auth(ctx.homeowner)
    )
    assert resp.json()["answerable"] is False
    assert "builder" in resp.json()["answer"].lower()  # "ask your builder"


async def test_homeowner_ask_blocks_invented_numbers(client, ctx, db_session, monkeypatch):
    """Digit-safety: the model returns a ₹ amount NOT in the published context →
    the answer is refused (numeric_guard), never shown to her."""
    db_session.add(_update(ctx.site.id, "Update", "Painting is underway in the bedroom."))
    await db_session.flush()
    monkeypatch.setattr(
        llm_mod, "get_llm_client",
        lambda: FakeLLMClient(
            canned={"grounded": True, "answer": "It will cost an extra 99999 rupees."}
        ),
    )
    resp = await client.post(
        "/api/v1/homeowner/ask", json={"question": "any extra cost?"}, headers=_auth(ctx.homeowner)
    )
    assert resp.json()["answerable"] is False  # the invented 99999 is blocked


async def test_homeowner_ask_requires_homeowner_role(client, ctx):
    # The contractor owner can't use the homeowner Q&A.
    resp = await client.post(
        "/api/v1/homeowner/ask", json={"question": "x"}, headers=_auth(ctx.owner)
    )
    assert resp.status_code == 403
