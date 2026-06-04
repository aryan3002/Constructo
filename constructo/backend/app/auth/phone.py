"""Phone-number normalization for login (India-first, E.164).

Why this exists: ``POST /auth/login`` is a find-or-create on the phone string.
Before this, it matched ``User.phone`` *exactly*, so an existing owner stored as
``+919800000001`` who typed ``9800000001`` (or with spaces / a leading 0) did not
match — and login silently created a *brand-new* owner with no sites, dumping a
real, existing owner into the first-run "create your company" flow.

Fix: when looking a user up, match against a set of equivalent forms of the
typed number; when creating, store the canonical E.164 form. Lookups stay
robust to however the row was stored; new rows are consistent going forward.
"""

from __future__ import annotations

import re

_DIGITS = re.compile(r"\D")


def normalize_phone(raw: str) -> str:
    """Best-effort canonical E.164 form (India-centric: 10 digits -> +91XXXXXXXXXX)."""
    digits = _DIGITS.sub("", raw or "")
    if not digits:
        return (raw or "").strip()
    if len(digits) == 10:  # bare Indian mobile
        return "+91" + digits
    if len(digits) == 11 and digits.startswith("0"):  # 0XXXXXXXXXX
        return "+91" + digits[1:]
    if len(digits) == 12 and digits.startswith("91"):  # 91XXXXXXXXXX
        return "+" + digits
    return "+" + digits


def phone_candidates(raw: str) -> list[str]:
    """Equivalent forms of a typed number, for a tolerant `WHERE phone IN (...)`
    lookup that finds the existing user regardless of how the row was stored
    (``+919800000001`` / ``919800000001`` / ``9800000001`` / ``09800000001``)."""
    digits = _DIGITS.sub("", raw or "")
    last10 = digits[-10:] if len(digits) >= 10 else digits
    candidates = {raw, (raw or "").strip(), normalize_phone(raw), digits, last10}
    if len(last10) == 10:
        candidates.update({"+91" + last10, "91" + last10, "0" + last10, last10})
    return [c for c in candidates if c]
