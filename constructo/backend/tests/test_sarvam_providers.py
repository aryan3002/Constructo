"""Sarvam provider selection (env-driven), without touching the network."""
from __future__ import annotations

from app.extraction.stt import FakeSTT, SarvamSTT, get_stt_client
from app.homeowner.translation import (
    FakeTranslationClient,
    SarvamTranslationClient,
    _bcp47,
    get_translation_client,
)


def test_bcp47_maps_bare_codes():
    assert _bcp47("hi") == "hi-IN"
    assert _bcp47("ta") == "ta-IN"
    assert _bcp47("en-IN") == "en-IN"  # already BCP-47, unchanged


def test_stt_factory_selects_sarvam(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "sarvam")
    monkeypatch.setenv("SARVAM_API_KEY", "test-key")
    assert isinstance(get_stt_client(), SarvamSTT)


def test_stt_factory_sarvam_without_key_falls_back_to_fake(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "sarvam")
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert isinstance(get_stt_client(), FakeSTT)


def test_translation_factory_selects_sarvam(monkeypatch):
    monkeypatch.setenv("TRANSLATION_PROVIDER", "sarvam")
    monkeypatch.setenv("SARVAM_API_KEY", "test-key")
    assert isinstance(get_translation_client(), SarvamTranslationClient)


def test_translation_factory_defaults_to_fake(monkeypatch):
    monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert isinstance(get_translation_client(), FakeTranslationClient)
