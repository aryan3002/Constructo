"""Scrub a deleted person's name and phone out of stored text (S6).

Account deletion anonymises the users row in place; this removes the copies
of the person's identity that ride along inside what they sent: the raw
WhatsApp/app payload (``raw_messages.raw``) and the events extracted from it
(``site_events.summary`` / ``fields``).

Matching is deliberately narrow so another person's text survives:
  * the FULL name only, as whole words (case-insensitive, any spacing) — never
    a first name alone, which could be someone else;
  * the phone in any common format (+91 98100 00102, 919810000102,
    09810000102, 98100-00102, a WhatsApp JID), bounded by non-digits;
  * the sender's own display-name fields in the raw payload (WhatsApp
    ``pushName`` / ``notifyName`` …), which name the sender by definition.
"""
from __future__ import annotations

import re
from typing import Any

from app.auth.phone import phone_candidates

DELETED_NAME = "Deleted user"

# Keys in a raw payload whose value is the SENDER's own display name. Only
# applied to rows the deleted person sent.
SENDER_NAME_KEYS = frozenset(
    {"pushName", "notifyName", "verifiedBizName", "sender_name", "senderName"}
)

_DIGITS = re.compile(r"\D")


def identity_patterns(name: str | None, phone: str | None) -> list[re.Pattern[str]]:
    """Regexes matching the person's full name and phone in free text."""
    patterns: list[re.Pattern[str]] = []
    words = (name or "").split()
    if words and " ".join(words) != DELETED_NAME and len("".join(words)) >= 3:
        body = r"\s+".join(re.escape(w) for w in words)
        patterns.append(re.compile(rf"(?<!\w){body}(?!\w)", re.IGNORECASE))

    digits = _DIGITS.sub("", phone or "")
    if len(digits) >= 10:
        last10 = digits[-10:]
        sep = r"[\s.-]?"
        number = sep.join(last10)
        prefix = rf"(?:(?:\+?{sep}91|0){sep})?"
        jid = r"(?:@(?:s\.whatsapp\.net|c\.us))?"
        patterns.append(re.compile(rf"(?<![\d+]){prefix}{number}(?!\d){jid}"))
    else:
        # A short or non-Indian number: match the stored forms exactly.
        forms = {c for c in phone_candidates(phone or "") if len(c) >= 6}
        for c in sorted(forms, key=len, reverse=True):
            patterns.append(re.compile(rf"(?<!\d){re.escape(c)}(?!\d)"))
    return patterns


def scrub_text(text: str, patterns: list[re.Pattern[str]]) -> str:
    for p in patterns:
        text = p.sub(DELETED_NAME, text)
    return text


def scrub_json(value: Any, patterns: list[re.Pattern[str]], *, sender: bool = False) -> Any:
    """Return ``value`` with every string scrubbed. With ``sender=True`` (a row
    the person sent) their display-name fields are replaced outright."""
    if isinstance(value, str):
        return scrub_text(value, patterns)
    if isinstance(value, list):
        return [scrub_json(v, patterns, sender=sender) for v in value]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if sender and k in SENDER_NAME_KEYS and isinstance(v, str) and v:
                out[k] = DELETED_NAME
            else:
                out[k] = scrub_json(v, patterns, sender=sender)
        return out
    return value
