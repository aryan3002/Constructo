"""Deterministic event-type classifier.

Pure, network-free keyword/heuristic classifier so the pipeline can run (and be
tested) without an LLM. Returns the most likely :class:`EventType` plus a rough
confidence in ``[0, 1]``. The orchestrator may refine confidence using the LLM
output, but classification stays deterministic for testability.
"""
from __future__ import annotations

from app.contracts.events import EventType, MediaType
from app.extraction.llm import _classify_text


def classify(text: str, media_type: MediaType) -> tuple[EventType, float]:
    """Classify a message into an :class:`EventType` with a confidence score.

    The text should already be resolved (transcript for voice, OCR text for a
    document). ``media_type`` nudges the prior — e.g. a document with no clear
    keyword is most likely an invoice/drawing.
    """
    text = text or ""
    etype = _classify_text(text)

    if etype is not EventType.unknown:
        # A keyword matched. Longer, content-bearing messages are more trustworthy.
        confidence = 0.85 if len(text.split()) >= 2 else 0.65
        return etype, confidence

    # No keyword matched. Use the media type as a weak prior.
    if media_type is MediaType.document:
        return EventType.invoice_received, 0.4
    if media_type is MediaType.image:
        return EventType.material_delivery, 0.35

    return EventType.unknown, 0.15
