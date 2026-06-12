"""Nivaan's output numeric guard (design §C.2).

Stricter-in-spirit than the homeowner translation guard: a Nivaan string may
mention a SUBSET of its evidence's numbers, but must never INTRODUCE a number
absent from the evidence. Same tokenizer as the homeowner guard (commas stripped,
₹/dates normalized) — reused, not reinvented. No network, no LLM."""
from __future__ import annotations

from app.homeowner.numeric_guard import extract_numeric_tokens


def numbers_are_grounded(text: str, source_texts: list[str]) -> bool:
    """True iff every numeric token in ``text`` appears in the union of numeric
    tokens across ``source_texts``. Digit-free text always passes."""
    drafted = set(extract_numeric_tokens(text))
    if not drafted:
        return True
    allowed: set[str] = set()
    for s in source_texts:
        allowed |= set(extract_numeric_tokens(s))
    return drafted <= allowed
