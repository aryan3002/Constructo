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


# Friendly capture-type aliases the app/composer (and slash-commands) may send,
# mapped to the canonical EventType. The canonical values themselves also resolve
# (EventType(...) below), so both "delivery" and "material_delivery" work.
_CAPTURE_TYPE_ALIASES: dict[str, EventType] = {
    "attendance": EventType.attendance,
    "delivery": EventType.material_delivery,
    "material": EventType.material_delivery,
    "material_delivery": EventType.material_delivery,
    "invoice": EventType.invoice_received,
    "invoice_received": EventType.invoice_received,
    "payment": EventType.payment_request,
    "payment_request": EventType.payment_request,
    "progress": EventType.progress_update,
    "progress_update": EventType.progress_update,
    "issue": EventType.issue,
    "drawing": EventType.drawing_shared,
    "drawing_shared": EventType.drawing_shared,
    "approval": EventType.approval,
    "decision": EventType.approval,
}


def _declared_event_type(raw: RawMessage) -> EventType | None:
    """The human-declared event type from a structured capture (``capture_type``).

    Returns the canonical :class:`EventType` when the app/composer told us what
    this is (a typed card, slash-command, or promoted message), else ``None``.
    ``unknown`` is treated as "not declared" so it never short-circuits the LLM.
    """
    hint = (raw.raw or {}).get("capture_type")
    if not isinstance(hint, str) or not hint.strip():
        return None
    declared = _CAPTURE_TYPE_ALIASES.get(hint.strip().lower())
    if declared is None:
        declared = _coerce_event_type(hint.strip().lower())
    return declared if declared is not None and declared is not EventType.unknown else None


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

    **Structured-capture fast path (Phase 0.1).** When the human already told us
    the event type via ``capture_type`` (a typed card / slash-command / promoted
    message), we trust it as ground truth — no classifier override, no LLM type
    guess. If the capture also carried its field values (``raw.raw["fields"]``),
    we skip the LLM entirely and stamp confidence 1.0: the human's submission IS
    the data. This is what kills the "unknown" flood and the cement→putty
    mis-classification for every carded message.
    """
    declared = _declared_event_type(raw)

    # Fully-deterministic path: declared type + human-entered field values.
    provided_fields = (raw.raw or {}).get("fields")
    if declared is not None and isinstance(provided_fields, dict):
        text = (raw.text or "").strip()
        summary = (
            (raw.raw or {}).get("summary")
            or text
            or declared.value.replace("_", " ")
        )
        summary = summary.strip()[:500] or "(no content)"
        return [
            SiteEvent(
                site_id=site_id,
                event_type=declared,
                occurred_on=raw.sent_at.date() if raw.sent_at else date.today(),
                summary=summary,
                fields=dict(provided_fields),
                confidence=1.0,
                needs_clarification=False,
                source_message_ids=[raw.id],
            )
        ]

    # LLM path — either fully open (no declaration) or type-anchored (declared
    # type, but the field values still come from free text / media).
    return [
        await _extract_via_llm(
            raw, site_id, llm=llm, stt=stt, ocr=ocr, forced_type=declared
        )
    ]


async def _extract_via_llm(
    raw: RawMessage,
    site_id: UUID,
    *,
    llm: LLMClient | None,
    stt: STTClient | None,
    ocr: OCRClient | None,
    forced_type: EventType | None = None,
) -> SiteEvent:
    """Classify + LLM-fill one event. When ``forced_type`` is set the type is
    locked (the human declared it) — the classifier and the LLM's type guess are
    ignored, and the human's assertion seeds a high type-confidence prior so a
    carded message never lands as ``unknown``."""
    llm = llm or get_llm_client()

    text = await _resolve_text(raw, stt, ocr)

    if forced_type is not None:
        event_type = forced_type
        classifier_conf = 0.9  # the human asserted the type
    else:
        # 2) Classify (deterministic).
        event_type, classifier_conf = classify(text, raw.media_type)

    # 3) LLM fills the type-specific fields.
    llm_out = await llm.complete(
        system=_SYSTEM_PROMPT,
        user=text,
        json_schema=_llm_schema(event_type),
    )

    # The LLM may disagree on the type; trust it when it returns a valid one —
    # but only when the human did NOT declare the type.
    if forced_type is None:
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

    return SiteEvent(
        site_id=site_id,
        event_type=event_type,
        occurred_on=raw.sent_at.date() if raw.sent_at else date.today(),
        summary=summary,
        fields=fields,
        confidence=confidence,
        needs_clarification=needs_clarification,
        source_message_ids=[raw.id],
    )
