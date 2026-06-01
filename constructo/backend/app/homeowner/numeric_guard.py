"""The numeric guard (H6.1 contracts-freeze).

A deterministic, network-free, LLM-free guard that extracts every numeral, rupee
amount, and date from a canonical string and asserts the multiset is PRESERVED
EXACTLY in a translated variant. A mismatch means the translation altered a
number — the caller must block the variant, fall back to the canonical, and set
``translation_cache.numeric_guard_ok = false`` so a guard-failed variant is never
served (doc §11.4).

It reuses the ₹/Rs/INR + comma-grouping shape proven in
``extraction.llm._find_amount`` (llm.py:92). The single scariest failure is a 10x
money error (``45,000`` -> ``450,000``); grouping commas are stripped so
``45,000 == 45000`` but ``45000 != 450000`` — see the pinned tests.
"""
from __future__ import annotations

import re
from collections import Counter

# A numeric run: digits with optional comma grouping and an optional decimal.
# Matches "45,000", "45000", "1,20,000", "12.5", "11", and the numeric part of a
# numeral date like "10" in "10 June". Currency symbols/words are not captured —
# only the magnitude matters for the guard.
_NUMERIC = re.compile(r"\d[\d,]*(?:\.\d+)?")


def extract_numeric_tokens(text: str) -> list[str]:
    """All numerals/amounts/dates as normalized comparable tokens.

    Each token is its numeric run with grouping commas stripped (so ``45,000``
    and ``45000`` normalize to the same token) and any trailing dangling comma /
    decimal point trimmed.
    """
    tokens: list[str] = []
    for match in _NUMERIC.findall(text or ""):
        normalized = match.replace(",", "")
        # A trailing '.' can survive if the run ended on a separator (rare); trim it.
        normalized = normalized.rstrip(".")
        if normalized:
            tokens.append(normalized)
    return tokens


def numeric_guard(canonical: str, translated: str) -> bool:
    """True iff the multiset of numeric tokens in ``translated`` == that in
    ``canonical``.

    Digits, ₹/Rs amounts (commas stripped: ``45,000`` == ``45000``), and dates
    must be preserved exactly. Order-independent (multiset). No network, no LLM.
    """
    return Counter(extract_numeric_tokens(canonical)) == Counter(
        extract_numeric_tokens(translated)
    )
