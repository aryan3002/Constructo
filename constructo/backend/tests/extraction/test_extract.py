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


# ---- Phase 0.1: structured-capture ground-truth fast path -----------------


async def test_capture_type_with_fields_skips_llm_and_is_certain():
    """A typed card (capture_type + fields) books verbatim at confidence 1.0 and
    NEVER calls the LLM — the human's submission is the data."""
    raw = _raw(
        text="50 bori cement ACC",
        raw={
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 50, "vendor": "ACC"},
        },
    )
    llm = FakeLLMClient()
    events = await extract(raw, SITE_ID, llm=llm)
    assert llm.calls == []  # the LLM was never invoked
    ev = events[0]
    assert ev.event_type is EventType.material_delivery  # alias "delivery" coerced
    assert ev.fields == {"material": "cement", "quantity": 50, "vendor": "ACC"}
    assert ev.confidence == 1.0
    assert ev.needs_clarification is False
    assert ev.source_message_ids == [raw.id]


async def test_capture_type_canonical_value_also_works():
    raw = _raw(raw={"capture_type": "material_delivery", "fields": {"material": "steel"}})
    llm = FakeLLMClient()
    ev = (await extract(raw, SITE_ID, llm=llm))[0]
    assert llm.calls == []
    assert ev.event_type is EventType.material_delivery
    assert ev.fields == {"material": "steel"}


async def test_capture_type_without_fields_anchors_type_but_uses_llm_for_fields():
    """Declared type, no field values: the type is LOCKED (even if the LLM guesses
    a different one), the LLM still fills the fields, and it never lands unknown."""
    # The canned LLM tries to override the type to 'issue' — must be ignored.
    canned = {
        "event_type": "issue",
        "summary": "x",
        "fields": {"material": "cement"},
        "confidence": 0.4,
    }
    raw = _raw(text="cement ka kuch chakkar hai", raw={"capture_type": "delivery"})
    llm = FakeLLMClient(canned=canned)
    ev = (await extract(raw, SITE_ID, llm=llm))[0]
    assert llm.calls != []  # LLM WAS used (for fields)
    assert ev.event_type is EventType.material_delivery  # type stayed locked
    assert ev.fields == {"material": "cement"}
    assert ev.needs_clarification is False  # human-asserted type keeps it confident


async def test_unknown_or_invalid_capture_type_falls_back_to_llm():
    for hint in ("unknown", "  ", "totally_not_a_type"):
        raw = _raw(text="24 mazdoor aaye", raw={"capture_type": hint})
        llm = FakeLLMClient()
        ev = (await extract(raw, SITE_ID, llm=llm))[0]
        assert llm.calls != []  # normal LLM path
        assert ev.event_type is EventType.attendance  # classified from text


async def test_no_capture_type_is_unchanged_llm_path():
    raw = _raw(text="24 mazdoor aaye")
    llm = FakeLLMClient()
    ev = (await extract(raw, SITE_ID, llm=llm))[0]
    assert llm.calls != []
    assert ev.event_type is EventType.attendance


# ---- Phase 0.2: multi-event extraction ------------------------------------


async def test_compound_free_text_splits_into_two_events():
    """A compound utterance spanning two distinct types yields two events."""
    raw = _raw(text="12 mistri aaye aur ACC se 50 bori cement aaya")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    types = {e.event_type for e in events}
    assert types == {EventType.attendance, EventType.material_delivery}
    att = next(e for e in events if e.event_type is EventType.attendance)
    deliv = next(e for e in events if e.event_type is EventType.material_delivery)
    assert att.fields["headcount"] == 12
    assert deliv.fields["material"] == "cement"
    assert all(e.source_message_ids == [raw.id] for e in events)


async def test_single_type_with_comma_stays_one_event():
    """A sentence with an incidental comma but only one event type must NOT split
    (guards against fragmenting a single invoice/challan)."""
    raw = _raw(text="cement delivered, 50 bori, ACC se")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    assert len(events) == 1
    assert events[0].event_type is EventType.material_delivery


async def test_simple_message_is_single_event():
    raw = _raw(text="24 mazdoor aaye")
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    assert len(events) == 1


async def test_structured_events_list_books_each_verbatim():
    """A compound structured capture (raw['events']) → one ground-truth event per
    entry, no LLM (e.g. a voice note that produced an attendance + a delivery card)."""
    raw = _raw(
        text="aaj ka update",
        raw={
            "events": [
                {"capture_type": "attendance", "fields": {"headcount": 12}},
                {"capture_type": "delivery", "fields": {"material": "cement", "quantity": 50}},
            ]
        },
    )
    llm = FakeLLMClient()
    events = await extract(raw, SITE_ID, llm=llm)
    assert llm.calls == []  # all entries are ground truth
    assert len(events) == 2
    assert {e.event_type for e in events} == {
        EventType.attendance,
        EventType.material_delivery,
    }
    assert all(e.confidence == 1.0 for e in events)
    att = next(e for e in events if e.event_type is EventType.attendance)
    assert att.fields == {"headcount": 12}


async def test_declared_single_type_is_not_split():
    """When the human declared ONE type, a comma in the text never splits it."""
    raw = _raw(
        text="12 mason, 3 helper",
        raw={"capture_type": "attendance"},
    )
    events = await extract(raw, SITE_ID, llm=FakeLLMClient())
    assert len(events) == 1
    assert events[0].event_type is EventType.attendance
