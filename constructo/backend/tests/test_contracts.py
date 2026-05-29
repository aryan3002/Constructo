from datetime import date, datetime
from uuid import uuid4

from app.contracts.events import EventType, MediaType, RawMessage, SiteEvent


def test_raw_message_roundtrip():
    msg = RawMessage(
        source="baileys",
        external_group_id="group-1",
        sender_id="sender-1",
        sender_name="Foreman Joe",
        media_type=MediaType.text,
        text="20 workers on site today",
        sent_at=datetime(2026, 5, 28, 8, 0, 0),
    )
    dumped = msg.model_dump(mode="json")
    restored = RawMessage.model_validate(dumped)

    assert restored == msg
    assert restored.media_type == MediaType.text
    assert restored.raw == {}
    assert restored.media_url is None


def test_site_event_roundtrip_and_constraints():
    site_id = uuid4()
    src_id = uuid4()
    event = SiteEvent(
        site_id=site_id,
        event_type=EventType.material_delivery,
        occurred_on=date(2026, 5, 28),
        summary="Delivered 100 bags of cement",
        fields={"material": "cement", "quantity": 100, "unit": "bags"},
        confidence=0.87,
        source_message_ids=[src_id],
    )
    dumped = event.model_dump(mode="json")
    restored = SiteEvent.model_validate(dumped)

    assert restored == event
    assert restored.version == 1
    assert restored.needs_clarification is False
    assert restored.supersedes_event_id is None
    assert restored.source_message_ids == [src_id]


def test_event_type_and_media_type_values():
    assert EventType.payment_request.value == "payment_request"
    assert EventType.unknown.value == "unknown"
    assert {m.value for m in MediaType} == {"text", "image", "voice", "video", "document"}


def test_confidence_bounds_enforced():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SiteEvent(
            site_id=uuid4(),
            event_type=EventType.issue,
            occurred_on=date(2026, 5, 28),
            summary="bad",
            fields={},
            confidence=1.5,
            source_message_ids=[],
        )
