from uuid import UUID

from sqlalchemy import func, select

from app.config import settings
from app.models import RawMessageModel


def _payload() -> dict:
    return {
        "source": "baileys",
        "external_group_id": "group-42",
        "sender_id": "919999999999",
        "sender_name": "Site Supervisor",
        "media_type": "text",
        "text": "Cement delivered, 50 bags",
        "sent_at": "2026-05-28T08:30:00",
        "raw": {"messageId": "abc"},
    }


async def test_ingest_with_valid_key_stores_message(client, db_session):
    resp = await client.post(
        "/api/v1/ingest", json=_payload(), headers={"X-Ingest-Key": settings.ingest_api_key}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "id" in body
    new_id = UUID(body["id"])

    stored = await db_session.get(RawMessageModel, new_id)
    assert stored is not None
    assert stored.text == "Cement delivered, 50 bags"
    assert stored.media_type == "text"
    assert stored.raw == {"messageId": "abc"}


async def test_ingest_wrong_key_is_401_and_stores_nothing(client, db_session):
    resp = await client.post(
        "/api/v1/ingest", json=_payload(), headers={"X-Ingest-Key": "wrong-key"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_ingest_key"

    count = await db_session.scalar(select(func.count()).select_from(RawMessageModel))
    assert count == 0


async def test_ingest_missing_key_is_401(client):
    resp = await client.post("/api/v1/ingest", json=_payload())
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_ingest_key"
