"""Extraction orchestrator: RawMessage -> list[SiteEvent].

Pipeline:
  1. Resolve media: voice -> STT transcript; document (or doc-like image) -> OCR.
  2. Classify into an :class:`EventType` (deterministic heuristics).
  3. Ask the LLM to fill the type-specific ``fields`` payload.
  4. Combine classifier + LLM confidences.
  5. Flag ``needs_clarification`` when confidence < 0.6.
  6. Stamp ``source_message_ids = [raw.id]``.

LLM/STT/OCR clients are injected so tests run with the Fakes and never touch the
network. The ``fields`` shapes follow the construction domain conventions in
``ARCHITECTURE.md`` (see per-type schemas below).
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from app.contracts.events import EventType, MediaType, RawMessage, SiteEvent
from app.extraction.classify import classify
from app.extraction.llm import LLMClient, get_llm_client
from app.extraction.numeral_repair import repair_numerals
from app.extraction.ocr import OCRClient
from app.extraction.ocr import ocr as run_ocr
from app.extraction.stt import STTClient
from app.extraction.stt import transcribe as run_transcribe
from app.storage import get_storage

CLARIFY_THRESHOLD = 0.6

_SYSTEM_PROMPT = (
    "You are an extraction engine for an Indian construction-site WhatsApp feed. "
    "Messages are in Hindi, Hinglish, or English. Extract a single structured "
    "site event. Never invent site data; if unsure, lower the confidence. "
    "Return strict JSON."
)

# Per-EventType JSON schema for the LLM's structured ``fields`` (domain shapes).
_FIELD_SCHEMAS: dict[EventType, dict] = {
    EventType.attendance: {
        "type": "object",
        "properties": {
            "headcount": {"type": ["integer", "null"]},
            "by_trade": {"type": ["object", "null"]},
            "raw_phrase": {"type": ["string", "null"]},
        },
    },
    EventType.material_delivery: {
        "type": "object",
        "properties": {
            "material": {"type": ["string", "null"]},
            "quantity": {"type": ["number", "null"]},
            "unit": {"type": ["string", "null"]},
            "vendor": {"type": ["string", "null"]},
        },
    },
    EventType.invoice_received: {
        "type": "object",
        "properties": {
            "vendor": {"type": ["string", "null"]},
            "amount": {"type": ["number", "null"]},
            "currency": {"type": ["string", "null"]},
            "invoice_number": {"type": ["string", "null"]},
        },
    },
    EventType.payment_request: {
        "type": "object",
        "properties": {
            "amount": {"type": ["number", "null"]},
            "currency": {"type": ["string", "null"]},
            "to": {"type": ["string", "null"]},
        },
    },
}
_DEFAULT_FIELD_SCHEMA = {
    "type": "object",
    "properties": {"description": {"type": ["string", "null"]}},
}


def _llm_schema(event_type: EventType) -> dict:
    return {
        "type": "object",
        "properties": {
            "event_type": {"type": "string", "enum": [e.value for e in EventType]},
            "summary": {"type": "string"},
            "fields": _FIELD_SCHEMAS.get(event_type, _DEFAULT_FIELD_SCHEMA),
            "confidence": {"type": "number"},
        },
        "required": ["event_type", "summary", "fields", "confidence"],
    }


def _normalize_media_ref(media_url: str | None) -> str | None:
    """Resolve a stored media ref into something OCR/STT/vision can fetch.

    Delegates to the active storage backend (``app.storage``): a bare key becomes
    a presigned GET URL on S3/R2, or a MEDIA_DIR path on the local backend; real
    http(s) URLs (WhatsApp Cloud-API media, Unsplash stopgap) pass through. The
    WhatsApp bridge's absolute paths and ``file://`` URIs are still tolerated by
    the local backend.
    """
    return get_storage().url_for(media_url)


def _looks_like_document(raw: RawMessage) -> bool:
    """An image is doc-like if its mime/text hints at a challan/invoice/PDF."""
    if raw.media_mime and "pdf" in raw.media_mime.lower():
        return True
    hint = f"{raw.text or ''} {raw.media_url or ''}".lower()
    return any(k in hint for k in ("challan", "invoice", "bill", "receipt"))


async def _resolve_text(
    raw: RawMessage, stt: STTClient | None, ocr_client: OCRClient | None
) -> str:
    """Turn whatever media the message carries into plain text for the pipeline."""
    media_ref = _normalize_media_ref(raw.media_url)
    if raw.media_type is MediaType.voice and media_ref:
        # Hindi-first STT (the supervisor speaks Hindi/Hinglish); the lang_hint
        # is provider-neutral so Azure Whisper today and Sarvam later both honour
        # it. A mis-heard numeral at a money/quantity moment is a real loss, so a
        # deterministic numeral-repair pass normalises spoken number words to
        # digits BEFORE classification/extraction (CA6).
        transcript = await run_transcribe(media_ref, lang_hint="hi", client=stt)
        return repair_numerals(transcript)

    needs_ocr = raw.media_type is MediaType.document or (
        raw.media_type is MediaType.image and _looks_like_document(raw)
    )
    if needs_ocr and media_ref:
        ocr_text = await run_ocr(media_ref, client=ocr_client)
        # Keep any human caption alongside the OCR text.
        return f"{raw.text}\n{ocr_text}".strip() if raw.text else ocr_text

    return raw.text or ""


def _coerce_event_type(value: Any) -> EventType | None:
    try:
        return EventType(value)
    except ValueError:
        return None


async def extract(
    raw: RawMessage,
    site_id: UUID,
    *,
    llm: LLMClient | None = None,
    stt: STTClient | None = None,
    ocr: OCRClient | None = None,
) -> list[SiteEvent]:
    """Convert a :class:`RawMessage` into zero or more :class:`SiteEvent` records.

    Args:
        raw: the inbound WhatsApp message contract object.
        site_id: the resolved site the event belongs to.
        llm/stt/ocr: optional injected clients (Fakes in tests). When omitted,
            env-selected clients are used (which themselves fall back to Fakes
            when no API key is configured).

    Returns a list (currently 0 or 1 events) of validated ``SiteEvent`` objects.
    """
    llm = llm or get_llm_client()

    text = await _resolve_text(raw, stt, ocr)

    # 2) Classify (deterministic).
    event_type, classifier_conf = classify(text, raw.media_type)

    # 3) LLM fills the type-specific fields.
    llm_out = await llm.complete(
        system=_SYSTEM_PROMPT,
        user=text,
        json_schema=_llm_schema(event_type),
    )

    # The LLM may disagree on the type; trust it when it returns a valid one.
    llm_type = _coerce_event_type(llm_out.get("event_type"))
    if llm_type is not None and llm_type is not EventType.unknown:
        event_type = llm_type

    fields = llm_out.get("fields") or {}
    summary = (llm_out.get("summary") or text or "").strip()[:500] or "(no content)"

    # 4) Combine confidences: average classifier prior with the LLM's self-report.
    llm_conf = llm_out.get("confidence")
    if isinstance(llm_conf, (int, float)):
        confidence = (classifier_conf + float(llm_conf)) / 2.0
    else:
        confidence = classifier_conf
    confidence = max(0.0, min(1.0, confidence))

    # 5) Low confidence -> ask a human.
    needs_clarification = confidence < CLARIFY_THRESHOLD

    event = SiteEvent(
        site_id=site_id,
        event_type=event_type,
        occurred_on=raw.sent_at.date() if raw.sent_at else date.today(),
        summary=summary,
        fields=fields,
        confidence=confidence,
        needs_clarification=needs_clarification,
        source_message_ids=[raw.id],
    )
    return [event]
