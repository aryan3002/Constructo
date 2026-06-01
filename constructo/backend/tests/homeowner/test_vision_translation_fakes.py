"""H6.1 provider-seam fakes: VisionClient + TranslationClient (network-free)."""
from app.homeowner.translation import (
    FakeTranslationClient,
    TranslationClient,
    get_translation_client,
)
from app.homeowner.vision import FakeVisionClient, VisionClient, get_vision_client


async def test_fake_vision_is_deterministic_and_records_calls():
    fake = FakeVisionClient()
    schema = {"type": "object"}
    a = await fake.describe_image("http://x/p.jpg", schema)
    b = await fake.describe_image("http://x/p.jpg", schema)
    assert a == b  # same URL -> identical dict
    assert len(fake.calls) == 2
    assert fake.calls[0]["image_url"] == "http://x/p.jpg"


def test_fake_vision_satisfies_protocol():
    assert isinstance(FakeVisionClient(), VisionClient)


async def test_fake_translation_echoes_and_preserves_numbers():
    fake = FakeTranslationClient()
    out = await fake.translate("₹45,000 approved", target_lang="hi")
    assert out == "[hi] ₹45,000 approved"
    assert fake.calls[0]["target_lang"] == "hi"


def test_fake_translation_satisfies_protocol():
    assert isinstance(FakeTranslationClient(), TranslationClient)


def test_factories_return_fakes_without_creds():
    assert isinstance(get_vision_client(), FakeVisionClient)
    assert isinstance(get_translation_client(), FakeTranslationClient)
