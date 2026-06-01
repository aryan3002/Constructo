"""H6.1 abstain contract for draft_quiet_reason (risk R1).

The reason is NEVER invented: a missing/blank phase abstains (returns None, no
exception); a known phase is only rephrased, never replaced. Network-free.
"""
from app.extraction.llm import FakeLLMClient
from app.homeowner.ai import draft_quiet_reason


async def test_abstains_when_phase_none():
    llm = FakeLLMClient()
    assert await draft_quiet_reason(llm, phase=None) is None


async def test_abstains_when_phase_whitespace():
    llm = FakeLLMClient()
    assert await draft_quiet_reason(llm, phase="   ") is None


async def test_rephrases_given_phase_without_inventing():
    llm = FakeLLMClient()
    out = await draft_quiet_reason(
        llm, phase="slab curing", schedule="deshuttering ~12th"
    )
    assert isinstance(out, str) and out.strip()
    # The fake echoes the prompt, so the given phase must survive — it did not
    # invent a different reason.
    assert "curing" in out.lower()


async def test_accepts_language_kwarg():
    llm = FakeLLMClient()
    out = await draft_quiet_reason(llm, phase="inspection wait", language="hi")
    assert isinstance(out, str) and out.strip()
