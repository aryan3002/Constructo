"""Azure vision OCR provider selection + behaviour tests (no network).

These tests never hit the network: real clients are only *constructed* (their
``ocr`` coroutine is never awaited), and the text-returning path is exercised
through :class:`FakeOCR`.
"""
import inspect

from app.extraction.ocr import (
    AzureVisionOCR,
    FakeOCR,
    OCRClient,
    OpenAIVisionOCR,
    get_ocr_client,
    ocr,
)


def _clear_ocr_env(monkeypatch):
    for var in (
        "OCR_PROVIDER",
        "OCR_MODEL",
        "OPENAI_API_KEY",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
        "AZURE_OPENAI_API_VERSION",
    ):
        monkeypatch.delenv(var, raising=False)


# ---------------------------------------------------------------------------
# Client selection by env
# ---------------------------------------------------------------------------


def test_azure_provider_with_creds_selects_azure_vision(monkeypatch):
    _clear_ocr_env(monkeypatch)
    monkeypatch.setenv("OCR_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "az-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

    client = get_ocr_client()
    assert isinstance(client, AzureVisionOCR)
    assert client.api_key == "az-key"
    assert client.endpoint == "https://example.openai.azure.com"
    assert client.deployment == "gpt-4o-mini"
    assert client.api_version == "2024-10-21"


def test_azure_api_version_defaults_when_absent(monkeypatch):
    _clear_ocr_env(monkeypatch)
    monkeypatch.setenv("OCR_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "az-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

    client = get_ocr_client()
    assert isinstance(client, AzureVisionOCR)
    assert client.api_version == "2024-10-21"


def test_azure_provider_missing_creds_falls_back_to_fake(monkeypatch):
    _clear_ocr_env(monkeypatch)
    monkeypatch.setenv("OCR_PROVIDER", "azure")
    # endpoint + deployment missing -> cannot build a real client
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "az-key")

    assert isinstance(get_ocr_client(), FakeOCR)


def test_no_provider_no_creds_falls_back_to_fake(monkeypatch):
    _clear_ocr_env(monkeypatch)
    assert isinstance(get_ocr_client(), FakeOCR)


def test_openai_provider_still_selectable(monkeypatch):
    _clear_ocr_env(monkeypatch)
    monkeypatch.setenv("OCR_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    client = get_ocr_client()
    assert isinstance(client, OpenAIVisionOCR)
    assert client.api_key == "sk-test"


# ---------------------------------------------------------------------------
# Behaviour via FakeOCR (no network)
# ---------------------------------------------------------------------------


async def test_ocr_returns_text_via_fake_default():
    assert await ocr("any-url", client=FakeOCR(default="challan text")) == "challan text"


async def test_ocr_returns_per_url_canned_text():
    fake = FakeOCR(default="", responses={"u1": "invoice A", "u2": "invoice B"})
    assert await ocr("u1", client=fake) == "invoice A"
    assert await ocr("u2", client=fake) == "invoice B"
    assert fake.calls == ["u1", "u2"]


async def test_azure_vision_client_satisfies_ocr_protocol():
    client = AzureVisionOCR(
        api_key="az-key",
        endpoint="https://example.openai.azure.com",
        deployment="gpt-4o-mini",
        api_version="2024-10-21",
    )
    assert isinstance(client, OCRClient)


# ---------------------------------------------------------------------------
# Signature preserved
# ---------------------------------------------------------------------------


def test_module_ocr_signature_preserved():
    sig = inspect.signature(ocr)
    params = list(sig.parameters)
    assert params[0] == "image_url"
    assert "client" in sig.parameters
    # `client` is keyword-only with a None default (injectable in tests).
    assert sig.parameters["client"].kind is inspect.Parameter.KEYWORD_ONLY
    assert sig.parameters["client"].default is None


def test_azure_vision_ocr_method_signature():
    sig = inspect.signature(AzureVisionOCR.ocr)
    params = list(sig.parameters)
    assert params == ["self", "image_url"]
    assert inspect.iscoroutinefunction(AzureVisionOCR.ocr)
