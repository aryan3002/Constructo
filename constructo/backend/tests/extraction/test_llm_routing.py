from app.extraction.llm import AzureOpenAILLMClient, FakeLLMClient, get_llm_client


def _azure_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "k")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_SMART", "gpt-4o")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-10-21")


def test_cheap_tier_uses_mini(monkeypatch):
    _azure_env(monkeypatch)
    c = get_llm_client("cheap")
    assert isinstance(c, AzureOpenAILLMClient)
    assert c.deployment == "gpt-4o-mini"


def test_smart_and_vision_tier_uses_4o(monkeypatch):
    _azure_env(monkeypatch)
    assert get_llm_client("smart").deployment == "gpt-4o"
    assert get_llm_client("vision").deployment == "gpt-4o"


def test_default_is_back_compat_cheap(monkeypatch):
    _azure_env(monkeypatch)
    assert get_llm_client().deployment == "gpt-4o-mini"


def test_smart_falls_back_to_mini_when_unset(monkeypatch):
    _azure_env(monkeypatch)
    monkeypatch.delenv("AZURE_OPENAI_DEPLOYMENT_SMART", raising=False)
    assert get_llm_client("smart").deployment == "gpt-4o-mini"


def test_no_creds_returns_fake(monkeypatch):
    for k in (
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "azure")
    assert isinstance(get_llm_client("smart"), FakeLLMClient)
