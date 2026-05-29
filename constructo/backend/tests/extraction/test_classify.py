"""Deterministic classifier tests (no network)."""
from app.contracts.events import EventType, MediaType
from app.extraction.classify import classify


def test_hindi_attendance_classified():
    etype, conf = classify("24 mazdoor aaye site par", MediaType.text)
    assert etype is EventType.attendance
    assert conf >= 0.6


def test_material_delivery_caption_classified():
    etype, conf = classify("100 bori cement delivered", MediaType.image)
    assert etype is EventType.material_delivery
    assert conf >= 0.6


def test_invoice_keyword_classified():
    etype, _ = classify("Tax invoice GST attached, amount Rs 45000", MediaType.document)
    assert etype is EventType.invoice_received


def test_empty_text_is_unknown_low_confidence():
    etype, conf = classify("", MediaType.text)
    assert etype is EventType.unknown
    assert conf < 0.6


def test_document_without_keyword_uses_media_prior():
    etype, conf = classify("", MediaType.document)
    assert etype is EventType.invoice_received
    assert conf < 0.6  # weak prior -> should ask for clarification downstream
