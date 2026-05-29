"""Tests for the Azure Whisper STT client and env-selected factory.

All tests are network-free: they exercise client *selection* and the
:class:`FakeSTT` path only. No real provider's ``transcribe`` is ever awaited,
so no network access or SDK install is required.
"""
import inspect

import pytest

from app.extraction.stt import (
    AzureWhisperSTT,
    FakeSTT,
    OpenAISTT,
    STTClient,
    get_stt_client,
    transcribe,
)

# Every env var any provider branch reads — cleared before each test so the
# host environment (which may carry a real OPENAI_API_KEY etc.) never leaks in.
_STT_ENV_VARS = (
    "STT_PROVIDER",
    "STT_MODEL",
    "OPENAI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_WHISPER_DEPLOYMENT",
    "AZURE_OPENAI_API_VERSION",
)


@pytest.fixture(autouse=True)
def _clean_stt_env(monkeypatch):
    for var in _STT_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


def _azure_creds(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "az-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_WHISPER_DEPLOYMENT", "whisper-hi")


# ---------------------------------------------------------------------------
# Client selection by environment
# ---------------------------------------------------------------------------


def test_azure_selected_when_creds_present(monkeypatch):
    _azure_creds(monkeypatch)
    client = get_stt_client()
    assert isinstance(client, AzureWhisperSTT)
    assert client.api_key == "az-key"
    assert client.endpoint == "https://example.openai.azure.com"
    assert client.deployment == "whisper-hi"
    # Default api_version is applied when the env var is absent.
    assert client.api_version == "2024-10-21"


def test_azure_api_version_override(monkeypatch):
    _azure_creds(monkeypatch)
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")
    client = get_stt_client()
    assert isinstance(client, AzureWhisperSTT)
    assert client.api_version == "2025-01-01-preview"


@pytest.mark.parametrize(
    "missing",
    ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_WHISPER_DEPLOYMENT"],
)
def test_azure_falls_back_to_fake_when_any_cred_missing(monkeypatch, missing):
    _azure_creds(monkeypatch)
    monkeypatch.delenv(missing, raising=False)
    assert isinstance(get_stt_client(), FakeSTT)


def test_falls_back_to_fake_without_any_creds(monkeypatch):
    # No STT_PROVIDER, no keys -> openai branch with no key -> Fake.
    assert isinstance(get_stt_client(), FakeSTT)


def test_openai_selected_when_key_present(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = get_stt_client()
    assert isinstance(client, OpenAISTT)
    assert client.api_key == "sk-test"
    assert client.model == "whisper-1"


def test_unknown_provider_falls_back_to_fake(monkeypatch):
    monkeypatch.setenv("STT_PROVIDER", "sarvam")  # not yet implemented
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert isinstance(get_stt_client(), FakeSTT)


# ---------------------------------------------------------------------------
# transcribe() behaviour via FakeSTT (no network)
# ---------------------------------------------------------------------------


async def test_transcribe_returns_text_via_injected_fake():
    fake = FakeSTT(default="namaste duniya")
    assert await transcribe("https://media/voice.ogg", client=fake) == "namaste duniya"


async def test_transcribe_uses_env_selected_fake_fallback(monkeypatch):
    # No creds -> get_stt_client() returns FakeSTT (empty default).
    assert await transcribe("https://media/voice.ogg") == ""


async def test_transcribe_forwards_url_and_lang_hint():
    fake = FakeSTT(responses={"u1": "aaj das mazdoor aaye"})
    out = await transcribe("u1", lang_hint="hi", client=fake)
    assert out == "aaj das mazdoor aaye"
    assert fake.calls == [("u1", "hi")]


async def test_transcribe_default_lang_hint_is_hi():
    fake = FakeSTT(default="x")
    await transcribe("u", client=fake)
    assert fake.calls[0][1] == "hi"


# ---------------------------------------------------------------------------
# Signature / interface preservation
# ---------------------------------------------------------------------------


def test_transcribe_signature_preserved():
    sig = inspect.signature(transcribe)
    params = list(sig.parameters)
    assert params[:2] == ["audio_url", "lang_hint"]
    assert sig.parameters["lang_hint"].default == "hi"
    # `client` stays keyword-only so callers can inject a fake.
    assert sig.parameters["client"].kind is inspect.Parameter.KEYWORD_ONLY


def test_azure_client_conforms_to_protocol():
    client = AzureWhisperSTT(
        api_key="k", endpoint="e", deployment="d", api_version="v"
    )
    assert isinstance(client, STTClient)
    method_sig = inspect.signature(client.transcribe)
    assert list(method_sig.parameters)[:2] == ["audio_url", "lang_hint"]
    assert method_sig.parameters["lang_hint"].default == "hi"
