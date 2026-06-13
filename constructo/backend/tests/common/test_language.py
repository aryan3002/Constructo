"""language_instruction maps account language -> an explicit LLM directive."""
from app.common.language import language_instruction


def test_english_directive():
    assert "English" in language_instruction("en")


def test_hindi_directive():
    out = language_instruction("hi")
    assert "Hindi" in out


def test_unknown_falls_back_to_mirror():
    assert "Mirror" in language_instruction(None)
    assert "Mirror" in language_instruction("xx")
