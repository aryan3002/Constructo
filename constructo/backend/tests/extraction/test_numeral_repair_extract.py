"""Numeral-repair wired into the extraction pipeline (Hindi voice path)."""
from datetime import datetime
from uuid import uuid4

from app.contracts.events import EventType, MediaType, RawMessage
from app.extraction.extract import extract
from app.extraction.llm import FakeLLMClient
from app.extraction.stt import FakeSTT

SITE_ID = uuid4()


def _voice_raw(url: str) -> RawMessage:
    return RawMessage(
        source="baileys",
        external_group_id="g1",
        sender_id="s1",
        media_type=MediaType.voice,
        media_url=url,
        sent_at=datetime(2026, 5, 28, 9, 0),
    )


async def test_voice_numeral_repair_feeds_quantity_to_extraction():
    # A spoken Hindi transcript with a number word; the repair pass turns
    # "do sau assi" into 280 before classification/extraction, so the delivery
    # quantity is the correct integer (not a missing/mangled value).
    url = "https://media/v1.ogg"
    stt = FakeSTT(responses={url: "cement do sau assi bori aaya"})
    events = await extract(_voice_raw(url), SITE_ID, llm=FakeLLMClient(), stt=stt)
    ev = events[0]
    assert ev.event_type is EventType.material_delivery
    assert ev.fields["material"] == "cement"
    assert ev.fields["quantity"] == 280


async def test_voice_uses_hindi_lang_hint():
    # The voice path must request the Hindi lang_hint (provider-neutral; Azure
    # Whisper today, Sarvam later) so Indian-language accuracy is honoured.
    url = "https://media/v2.ogg"
    stt = FakeSTT(responses={url: "teen hazaar rupaye"})
    await extract(_voice_raw(url), SITE_ID, llm=FakeLLMClient(), stt=stt)
    assert stt.calls == [(url, "hi")]


async def test_voice_amount_numeral_repaired():
    url = "https://media/v3.ogg"
    stt = FakeSTT(responses={url: "payment bhejo teen hazaar"})
    events = await extract(_voice_raw(url), SITE_ID, llm=FakeLLMClient(), stt=stt)
    ev = events[0]
    assert ev.event_type is EventType.payment_request
    assert ev.fields["amount"] == 3000.0
