"""Deterministic reply interpreter (Reply-to-Card, 1.4).

A reply to a card is read in the card's own schema, not cold-classified. This
module is the *deterministic* tier only — the unambiguous lexicon — so it is
network-free and testable; everything fuzzier becomes an AI-suggested draft chip
in Phase 2. Two intents:

  * **approve** — "haan / theek hai / ok / done / sahi / ✓".
  * **correct** — a numeric correction like "45 nahi 54" (Hindi *"not 45, 54"*)
    or "nahi 54" / "54 karo": the new value supersedes the old one on the field
    that currently holds it.

The commit itself is done by the caller (append-only supersede or, for a
non-authority, a dispute) — this module only classifies the terse reply.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# Unambiguous approval tokens (Hindi / Hinglish / English). Bare, not substrings
# of bigger words — matched on a normalised, tokenised reply.
_APPROVE = {
    "haan", "haa", "ha", "theek", "thik", "ok", "okay", "done", "sahi",
    "yes", "approve", "approved", "✓", "👍", "theekhai",
}
_APPROVE_PHRASES = {"theek hai", "thik hai", "ho gaya", "sahi hai", "ok hai"}
# Connective words allowed *alongside* an approval token ("theek HAI", "ho GAYA")
# but never an approval on their own.
_FILLERS = {"hai", "ho", "gaya", "hi", "h"}

_NUM = re.compile(r"\d+(?:\.\d+)?")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def is_approval(text: str) -> bool:
    """True when the reply is an unambiguous approval (and carries no number —
    a number means it's a correction, not a bare yes)."""
    n = _norm(text)
    if not n or _NUM.search(n):
        return False
    if n in _APPROVE_PHRASES:
        return True
    words = set(re.findall(r"[\w✓👍]+", n))
    if not words:
        return False
    # Every token must be an approval token or a filler, AND at least one must be
    # a real approval token — so "haan theek hai" passes, "yeh galat hai" doesn't.
    return words <= (_APPROVE | _FILLERS) and bool(words & _APPROVE)


@dataclass(frozen=True)
class Correction:
    old: float | None  # the value being replaced (None = "just set it to new")
    new: float


def parse_correction(text: str) -> Correction | None:
    """Parse a numeric correction. Handles "45 nahi 54", "nahi 54", "54 karo",
    "54 nahi" (→ new=54). Returns None when there's no clear numeric intent."""
    n = _norm(text)
    nums = [float(m) for m in _NUM.findall(n)]
    if not nums:
        return None
    has_nahi = "nahi" in n or "nahin" in n or "नहीं" in text
    if len(nums) >= 2 and has_nahi:
        # "45 nahi 54" -> not 45, it's 54.   "X nahi Y" -> old=X, new=Y.
        return Correction(old=nums[0], new=nums[1])
    if len(nums) == 1 and (has_nahi or "karo" in n or "kardo" in n or "= " in n):
        # "nahi 54" / "54 karo" -> set to 54 (old unknown).
        return Correction(old=None, new=nums[0])
    return None


def apply_correction(fields: dict, corr: Correction) -> tuple[dict, str] | None:
    """Return (new_fields, changed_key) applying a correction to the field that
    holds ``corr.old`` (or the single numeric field when ``old`` is None). None
    when no field matches (ambiguous — don't guess)."""
    numeric_keys = [k for k, v in fields.items() if isinstance(v, (int, float))]
    target: str | None = None
    if corr.old is not None:
        for k in numeric_keys:
            if float(fields[k]) == corr.old:
                target = k
                break
    elif len(numeric_keys) == 1:
        target = numeric_keys[0]
    if target is None:
        return None
    updated = dict(fields)
    updated[target] = int(corr.new) if corr.new.is_integer() else corr.new
    return updated, target
