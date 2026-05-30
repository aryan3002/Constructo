"""Inbound message intent classification for the bot.

Maps an inbound WhatsApp message (text + a little context) to one of:

  * ``capture``             — default: a normal site update. The bot does NOT
                              reply; the extraction pipeline captures it. The
                              Guest Rule means most messages land here.
  * ``brief_reply``         — a reply to the morning brief: a tappable number
                              ("1"), "approve"/"hold"/"reject", or "show proof N".
  * ``query``               — a direct question to the bot ("kitne mazdoor aaye
                              Site A?", "latest slab drawing?").
  * ``clarification_answer``— a short answer to a clarification the bot asked
                              (a number / yes-no), only meaningful when a
                              clarification is pending.
  * ``help``                — "help" / "kya kar sakte ho" / "?".

Strategy: cheap, deterministic FAST-PATHS first (so "1"/"approve"/"hold" never
cost an LLM call and stay fully deterministic in tests), then fall back to the
(injectable) LLM for the fuzzy long tail. Hinglish-aware throughout. Network-free
when the FakeLLMClient is used.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.extraction.llm import LLMClient, get_llm_client


class Intent(StrEnum):
    capture = "capture"
    brief_reply = "brief_reply"
    query = "query"
    clarification_answer = "clarification_answer"
    help = "help"


@dataclass
class IntentResult:
    """Classified intent + the signals that drove it.

    ``confidence`` gates the Guest Rule (low confidence on a borderline message
    may warrant one clarification question rather than a silent capture).
    ``slots`` carries parsed bits the composer reuses (e.g. the brief reply
    number, the requested proof index, an approve/hold verb).
    """

    intent: Intent
    confidence: float = 0.5
    via: str = "fastpath"  # "fastpath" | "llm"
    slots: dict[str, Any] = field(default_factory=dict)


# ---- fast-path patterns ----------------------------------------------------

_HELP_TOKENS = {"help", "/help", "?", "madad", "kya kar sakte ho", "kya kar sakte"}

# brief-reply verbs (English + Hinglish). Map to a canonical decision verb.
_APPROVE_WORDS = (
    "approve", "approved", "ok kar", "ok kardo", "haan", "manjoor", "sanction", "ho jaye",
)
_HOLD_WORDS = ("hold", "ruk", "ruko", "wait", "abhi mat", "thoda ruk")
_REJECT_WORDS = ("reject", "mana", "nahi karo", "cancel", "decline")

# "show proof 2" / "proof 2" / "sabут 2" (Hinglish) → request evidence for item N.
_PROOF_RE = re.compile(r"\b(?:show\s+)?proof\s+(\d+)\b|\bsab[uū]t\s+(\d+)\b", re.IGNORECASE)

# A bare tappable number ("1", "2") — the brief renders numbered options.
_BARE_NUMBER_RE = re.compile(r"^\s*(\d{1,2})\s*$")

# Query signals: an explicit question, or a known query lead-in (Hinglish).
_QUERY_LEADS = (
    "kitne", "kitna", "kaun", "kab", "kahan", "latest", "last", "show me",
    "batao", "bata", "dikhao", "dikha", "kya hua", "status", "how many",
    "which", "what", "when", "where", "konsa", "konsi", "kitni",
)
_DRAWING_QUERY_RE = re.compile(r"latest .*\b(drawing|naksha|plan|blueprint|dwg)\b", re.IGNORECASE)


def _norm(text: str) -> str:
    return (text or "").strip().lower()


def _match_verb(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def fastpath(text: str, *, brief_pending: bool = False) -> IntentResult | None:
    """Deterministic classification for the unambiguous cases.

    Returns ``None`` when nothing matches (the caller then asks the LLM).

    ``brief_pending`` widens what counts as a brief reply: a bare number is a
    brief reply when a brief is awaiting a response in this chat, otherwise it is
    treated as a clarification answer.
    """
    t = _norm(text)
    if not t:
        return IntentResult(Intent.capture, confidence=0.9, via="fastpath")

    if t in _HELP_TOKENS or t.rstrip("?! ") in {"help", "madad"}:
        return IntentResult(Intent.help, confidence=0.95, via="fastpath")

    # "show proof N" — explicit evidence request against a brief item.
    pm = _PROOF_RE.search(text or "")
    if pm:
        n = pm.group(1) or pm.group(2)
        return IntentResult(
            Intent.brief_reply, confidence=0.95, via="fastpath",
            slots={"verb": "proof", "number": int(n)},
        )

    # approve / hold / reject verbs → brief reply (acting on a pending decision).
    # Only treated as a brief reply when a brief is actually awaiting one; a bare
    # "haan"/"ok" in normal chatter must not hijack the ledger. (An explicit
    # "approve <n>" still resolves below via brief_pending or the LLM.)
    if brief_pending:
        if _match_verb(t, _APPROVE_WORDS):
            return IntentResult(
                Intent.brief_reply, confidence=0.9, via="fastpath",
                slots={"verb": "approve"},
            )
        if _match_verb(t, _HOLD_WORDS):
            return IntentResult(
                Intent.brief_reply, confidence=0.9, via="fastpath",
                slots={"verb": "hold"},
            )
        if _match_verb(t, _REJECT_WORDS):
            return IntentResult(
                Intent.brief_reply, confidence=0.9, via="fastpath",
                slots={"verb": "reject"},
            )

    # a bare number: brief reply if a brief is pending, else a clarification answer.
    nm = _BARE_NUMBER_RE.match(text or "")
    if nm:
        n = int(nm.group(1))
        if brief_pending:
            return IntentResult(
                Intent.brief_reply, confidence=0.9, via="fastpath",
                slots={"verb": "select", "number": n},
            )
        return IntentResult(
            Intent.clarification_answer, confidence=0.85, via="fastpath",
            slots={"number": n},
        )

    # "latest * drawing" — a high-precision query fast-path.
    if _DRAWING_QUERY_RE.search(text or ""):
        return IntentResult(Intent.query, confidence=0.85, via="fastpath")

    # An explicit question mark plus a query lead-in is almost certainly a query.
    if "?" in t and any(lead in t for lead in _QUERY_LEADS):
        return IntentResult(Intent.query, confidence=0.8, via="fastpath")

    return None


# ---- LLM fallback ----------------------------------------------------------

_SYSTEM_PROMPT = (
    "You classify ONE inbound WhatsApp message in an Indian construction site "
    "group for an assistant named Nivaan. The assistant is a quiet guest: most "
    "messages are routine site updates it should just capture silently. "
    "Classify the message into exactly one intent:\n"
    "  capture  — a routine site update/log (default; no reply needed)\n"
    "  query    — a direct question asking the assistant for site information\n"
    "  brief_reply — a reply to the morning brief (a number, approve/hold/reject)\n"
    "  clarification_answer — a short answer to a question the assistant asked\n"
    "  help     — asking what the assistant can do\n"
    "Messages may be Hinglish (Hindi in Latin script). When unsure, prefer "
    "'capture'. Also return a confidence in [0,1] (how sure you are it is NOT a "
    'routine capture). Return strict JSON: {"intent": "...", "confidence": 0.0}.'
)

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["intent", "confidence"],
}

_VALID = {i.value for i in Intent}


async def classify(
    text: str,
    *,
    brief_pending: bool = False,
    clarification_pending: bool = False,
    llm: LLMClient | None = None,
) -> IntentResult:
    """Classify an inbound message into an :class:`Intent`.

    Tries the deterministic fast-paths first; only falls back to the LLM for the
    fuzzy long tail. ``brief_pending`` / ``clarification_pending`` are context
    flags from the caller (is the morning brief / a clarification awaiting a
    reply in this chat) that disambiguate bare numbers.
    """
    fp = fastpath(text, brief_pending=brief_pending)
    if fp is not None:
        return fp

    llm = llm or get_llm_client()
    # The extraction FakeLLMClient returns an event-extraction shape, not an
    # intent shape — so guard for the "intent" key and fall back to capture.
    try:
        result = await llm.complete(_SYSTEM_PROMPT, text, _RESPONSE_SCHEMA)
    except Exception:
        return IntentResult(Intent.capture, confidence=0.3, via="llm")

    raw_intent = (result or {}).get("intent")
    if raw_intent in _VALID:
        intent = Intent(raw_intent)
        try:
            conf = float(result.get("confidence", 0.5))
        except (TypeError, ValueError):
            conf = 0.5
        # A clarification answer only makes sense if one is actually pending.
        if intent is Intent.clarification_answer and not clarification_pending:
            intent = Intent.capture
        return IntentResult(intent, confidence=conf, via="llm")

    # Unknown / extraction-shaped payload → default to a silent capture.
    return IntentResult(Intent.capture, confidence=0.3, via="llm")
