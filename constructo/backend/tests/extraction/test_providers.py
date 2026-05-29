"""Provider abstraction + factory fallback tests (no network)."""
from app.extraction.llm import FakeLLMClient, OpenAILLMClient, get_llm_client
from app.extraction.ocr import FakeOCR, ocr
from app.extraction.stt import FakeSTT, transcribe


async def test_fake_llm_canned_output():
    canned = {
        "event_type": "issue",
        "summary": "s",
        "fields": {"description": "d"},
        "confidence": 0.7,
    }
    out = await FakeLLMClient(canned=canned).complete("sys", "user", {})
    assert out == canned


async def test_fake_stt_and_ocr_injection():
    assert await transcribe("u", client=FakeSTT(default="hello")) == "hello"
    assert await ocr("u", client=FakeOCR(default="text")) == "text"


def test_get_llm_client_falls_back_to_fake_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    assert isinstance(get_llm_client(), FakeLLMClient)


def test_get_llm_client_uses_real_provider_with_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = get_llm_client()
    assert isinstance(client, OpenAILLMClient)
    assert client.api_key == "sk-test"
