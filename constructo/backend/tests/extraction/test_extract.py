"""Golden + behavioural tests for the extraction orchestrator (Fakes only)."""
from datetime import datetime
from uuid import uuid4

import pytest

from app.contracts.events import EventType, MediaType, RawMessage, SiteEvent
from app.extraction.extract import extract
from app.extraction.llm import FakeLLMClient
from app.extraction.ocr import FakeOCR
from app.extraction.stt import FakeSTT

SITE_ID = uuid4()


def _raw(**kw) -> RawMessage:
    base = dict(
        source="baileys",
        external_group_id="g1",
        sender_id="s1",
        media_type=MediaType.text,
        sent_at=datetime(2026, 5, 28, 9, 0),
    )
    base.update(kw)
    return RawMessage(**base)


async def test_hindi_attendance_text():
    raw = _raw(text="24 mazdoor aaye")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    assert len(events) == 1
    ev = events[0]
    assert isinstance(ev, SiteEvent)
    assert ev.event_type is EventType.attendance
    assert ev.fields["headcount"] == 24
    assert ev.source_message_ids == [raw.id]
    assert ev.site_id == SITE_ID
    assert ev.occurred_on == raw.sent_at.date()
    assert ev.needs_clarification is False


async def test_delivery_photo_caption():
    raw = _raw(
        media_type=MediaType.image,
        text="100 bori cement delivered",
        media_url="https://media/x.jpg",
    )
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    ev = events[0]
    assert ev.event_type is EventType.material_delivery
    assert ev.fields["material"] == "cement"
    assert ev.fields["quantity"] == 100


async def test_voice_note_transcribed_via_fake_stt():
    raw = _raw(
        media_type=MediaType.voice,
        media_url="https://media/voice.ogg",
    )
    stt = FakeSTT(responses={"https://media/voice.ogg": "aaj 18 mazdoor aaye the"})
    events = await extract(raw, SITE_ID, llm=FakeLLMClient(), stt=stt)
    ev = events[0]
    assert stt.calls == [("https://media/voice.ogg", "hi")]
    assert ev.event_type is EventType.attendance
    assert ev.fields["headcount"] == 18


async def test_invoice_document_via_fake_ocr():
    raw = _raw(
        media_type=MediaType.document,
        media_mime="application/pdf",
        media_url="https://media/challan.pdf",
    )
    ocr = FakeOCR(
        responses={
            "https://media/challan.pdf": "TAX INVOICE\nVendor: Shri Cement\nAmount Rs 45,000\nGST"
        }
    )
    events = await extract(raw, SITE_ID, llm=FakeLLMClient(), ocr=ocr)
    ev = events[0]
    assert ocr.calls == ["https://media/challan.pdf"]
    assert ev.event_type is EventType.invoice_received
    assert ev.fields["amount"] == 45000.0


async def test_low_confidence_sets_needs_clarification():
    # Canned LLM output with confidence below threshold.
    canned = {
        "event_type": "unknown",
        "summary": "garbled",
        "fields": {},
        "confidence": 0.1,
    }
    raw = _raw(text="???")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient(canned=canned))
    ev = events[0]
    assert ev.confidence < 0.6
    assert ev.needs_clarification is True


async def test_high_confidence_no_clarification():
    canned = {
        "event_type": "attendance",
        "summary": "30 workers",
        "fields": {"headcount": 30},
        "confidence": 0.95,
    }
    raw = _raw(text="30 mazdoor aaye")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient(canned=canned))
    ev = events[0]
    assert ev.confidence >= 0.6
    assert ev.needs_clarification is False
    assert ev.fields["headcount"] == 30


async def test_returns_valid_site_events_with_source_ids():
    raw = _raw(text="cement aa gaya")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    for ev in events:
        # Round-trips through Pydantic validation.
        assert SiteEvent.model_validate(ev.model_dump())
        assert ev.source_message_ids == [raw.id]


async def test_confidence_within_bounds():
    canned = {"event_type": "attendance", "summary": "x", "fields": {}, "confidence": 5.0}
    raw = _raw(text="20 mazdoor")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient(canned=canned))
    assert 0.0 <= events[0].confidence <= 1.0


@pytest.mark.parametrize(
    "text,expected",
    [
        ("payment bhejo 50000", EventType.payment_request),
        ("slab casting ho gaya", EventType.progress_update),
        ("paani leak ho raha hai dikkat", EventType.issue),
    ],
)
async def test_various_event_types(text, expected):
    raw = _raw(text=text)
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    assert events[0].event_type is expected
