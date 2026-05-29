"""End-to-end integration: ingest -> extraction -> brief -> send.

Drives the full loop with Fakes (no network): a Hindi attendance message is
POSTed to /api/v1/ingest (EXTRACTION_SYNC so extraction runs inline), a
SiteEventModel row is created, build_brief reflects the event, and send_brief
behaves correctly in both dry_run and (mocked) cloud_api modes.
"""
from contextlib import asynccontextmanager
from datetime import date

from sqlalchemy import select

import app.queue as queue_mod
from app.brief.generate import build_brief
from app.brief.send import send_brief
from app.config import settings
from app.extraction.llm import FakeLLMClient
from app.models import RawMessageModel, SiteEventModel, WhatsappGroup


class _FakeResponse:
    def raise_for_status(self):
        return None


async def test_full_loop_ingest_to_brief_to_send(monkeypatch, client, db_session, factory):
    # --- seed company + site + group mapping --------------------------------
    company = await factory.company(name="Sharma Builders")
    site = await factory.site(company=company, name="Tower A")
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="120363-site-a@g.us",
        source="baileys",
        label="Tower A crew",
    )
    db_session.add(group)
    await db_session.flush()

    # --- force inline extraction with a Fake LLM bound to the test session ---
    monkeypatch.setattr(settings, "extraction_sync", True)
    monkeypatch.setattr(queue_mod.settings, "extraction_sync", True)

    @asynccontextmanager
    async def _factory():
        yield db_session

    import app.extraction.worker as worker_mod

    real = worker_mod.handle_ingested

    async def _bound(raw_message_id, session_factory=None, **kw):
        kw.setdefault("llm", FakeLLMClient())
        return await real(raw_message_id, session_factory=_factory, **kw)

    monkeypatch.setattr(worker_mod, "handle_ingested", _bound)

    # --- 1) POST a Hindi attendance RawMessage to /ingest -------------------
    brief_day = date(2026, 5, 28)
    payload = {
        "source": "baileys",
        "external_group_id": "120363-site-a@g.us",
        "sender_id": "919999999999",
        "sender_name": "Site Supervisor",
        "media_type": "text",
        "text": "Aaj 24 mazdoor aaye site par",
        "sent_at": "2026-05-28T08:30:00",
        "raw": {"messageId": "wamid-1"},
    }
    resp = await client.post(
        "/api/v1/ingest", json=payload, headers={"X-Ingest-Key": settings.ingest_api_key}
    )
    assert resp.status_code == 200, resp.text
    raw_id = resp.json()["id"]

    # raw message stored
    assert await db_session.get(RawMessageModel, raw_id) is not None

    # --- 2) a SiteEventModel row was created for the site -------------------
    events = (
        (await db_session.execute(select(SiteEventModel).where(SiteEventModel.site_id == site.id)))
        .scalars()
        .all()
    )
    assert len(events) == 1
    ev = events[0]
    assert ev.event_type == "attendance"
    assert ev.fields.get("headcount") == 24
    assert ev.occurred_on == brief_day

    # --- 3) build_brief reflects the event ----------------------------------
    result = await build_brief(db_session, company.id, brief_day, llm=FakeLLMClient())
    payload_out = result["payload"]
    assert payload_out["brief_date"] == brief_day.isoformat()
    site_names = {s["name"] for s in payload_out["sites"]}
    assert "Tower A" in site_names
    tower = next(s for s in payload_out["sites"] if s["name"] == "Tower A")
    assert tower["counts"]["attendance"] == 1
    assert isinstance(result["text"], str) and result["text"].strip()

    # --- 4a) send in dry_run mode returns False -----------------------------
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "dry_run")
    assert await send_brief("+919999999999", result["text"]) is False

    # --- 4b) send in cloud_api mode posts correctly (mocked httpx) ----------
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "cloud_api")
    monkeypatch.setenv("WHATSAPP_TOKEN", "tok-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "1094260843779305")

    captured: dict = {}

    class _FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return _FakeResponse()

    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _FakeClient)

    assert await send_brief("+919999999999", result["text"]) is True
    assert captured["url"] == "https://graph.facebook.com/v21.0/1094260843779305/messages"
    assert captured["headers"] == {"Authorization": "Bearer tok-123"}
    assert captured["json"]["messaging_product"] == "whatsapp"
    assert captured["json"]["to"] == "+919999999999"
    assert captured["json"]["text"]["body"] == result["text"]
