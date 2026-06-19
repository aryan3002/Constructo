from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.contracts.events import EventType, MediaType, RawMessage
from app.extraction.extract import extract


class TierLLM:
    def __init__(self):
        self.calls = 0

    async def complete(self, system, user, json_schema):
        self.calls += 1
        if self.calls == 1:
            return {"event_type": "unknown", "summary": user, "fields": {}, "confidence": 0.2}
        return {
            "event_type": "progress_update",
            "summary": user,
            "fields": {"description": user},
            "confidence": 0.95,
        }

    async def complete_vision(self, system, user, image_url, json_schema):
        return await self.complete(system, user, json_schema)


def _raw(text):
    return RawMessage(
        id=uuid4(),
        source="app_chat",
        external_group_id="app:x",
        sender_id="p",
        sender_name="Lokesh",
        media_type=MediaType.text,
        text=text,
        media_url=None,
        media_mime=None,
        sent_at=datetime.now(UTC),
        received_at=datetime.now(UTC),
        raw={},
    )


@pytest.mark.asyncio
async def test_low_confidence_escalates_and_improves(monkeypatch):
    shared = TierLLM()
    monkeypatch.setattr("app.extraction.extract.get_llm_client", lambda tier="cheap": shared)
    [ev] = await extract(_raw("ek aur baat clarify karni thi"), uuid4(), llm=shared)
    assert shared.calls == 2
    assert ev.event_type is EventType.progress_update
    assert ev.confidence >= 0.6
