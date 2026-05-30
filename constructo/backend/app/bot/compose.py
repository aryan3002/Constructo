"""Compose Nivaan's replies — Hinglish, brief, evidence-bearing.

Nivaan is a polite, near-invisible site assistant. These helpers turn structured
inputs (an intent result, search hits, a brief payload) into the exact outbound
shape the Guest Rule allows:

  * capture   → a REACTION (✅) by default, OR one short numbered clarification
                question, but only when confidence is low or there is money /
                schedule ambiguity. Never both, never chatty.
  * query     → a plain-text WhatsApp answer that ALWAYS carries its evidence
                (what / when / which site). Sensitive (money) answers are flagged
                for a DM to the owner, not the group.
  * brief     → the morning brief rendered as a reply-with-number message, plus
                the number→decision_id mapping to persist in owner_briefs.payload.

Pure + deterministic: no I/O here. :mod:`app.bot.handle` does the DB/search/send.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID


class ReplyKind(StrEnum):
    silent = "silent"  # do nothing (Guest Rule default for routine captures)
    reaction = "reaction"  # react ✅ only
    text = "text"  # send a text reply (to the group)
    dm = "dm"  # send a text DM to the owner (sensitive)


@dataclass
class Reply:
    """A composed outbound action for the handler to execute.

    ``kind`` decides the transport call; ``text`` is the body (``None`` for a
    pure reaction); ``emoji`` the reaction glyph; ``dm`` whether it must go to
    the owner privately (sensitive content / Guest Rule).
    """

    kind: ReplyKind
    text: str | None = None
    emoji: str | None = None
    dm: bool = False


# Money / payment / dispute keywords → sensitive: never answered in the group,
# always DM'd to the owner (Guest Rule).
_SENSITIVE_TOKENS = (
    "payment", "paisa", "advance", "rs ", "rs.", "₹", "inr", "amount", "salary",
    "tankhwah", "bill", "invoice", "challan", "dispute", "jhagda", "lena dena",
    "udhar", "transfer", "bhugtan",
)

# Schedule ambiguity hints — combined with low confidence these justify ONE
# clarification question rather than a silent capture.
_SCHEDULE_TOKENS = ("deadline", "schedule", "tareekh", "kab tak", "kab karni")

# Uncertainty markers: a captured message is only worth clarifying when the
# sender themselves sounds unsure (a question, "maybe"). Routine declaratives
# ("aaj cement aa gaya") are NOT ambiguous just because they mention a day.
_UNCERTAIN_TOKENS = (
    "?", "shayad", "pata nahi", "kya karna", "karna hai kya", "karu kya", "ya nahi",
)

# Confidence below this on a non-routine message warrants a clarification.
LOW_CONFIDENCE = 0.55


def is_sensitive(text: str | None) -> bool:
    """True if the text touches money / payments / disputes."""
    t = (text or "").lower()
    return any(tok in t for tok in _SENSITIVE_TOKENS)


# ---------------------------------------------------------------------------
# capture → reaction vs clarification
# ---------------------------------------------------------------------------


def compose_capture(text: str, *, confidence: float) -> Reply:
    """Decide the Guest-Rule response to a routine captured message.

    Default is a silent ✅ reaction (acknowledge, don't narrate). We ask ONE
    short numbered clarification only when confidence is low AND there is money
    or schedule ambiguity — exactly the cases where guessing is expensive.
    """
    t = (text or "").lower()
    uncertain = confidence < LOW_CONFIDENCE or any(tok in t for tok in _UNCERTAIN_TOKENS)
    money = is_sensitive(text)
    schedule = any(tok in t for tok in _SCHEDULE_TOKENS)

    # Only ask when the message itself is unsure AND touches money/schedule —
    # exactly where a silent wrong guess is expensive. Routine declaratives that
    # merely mention a day stay a quiet ✅ (the Guest Rule).
    if uncertain and (money or schedule):
        # ONE question, numbered tappable options, Hinglish, no preamble.
        if money:
            q = (
                "Ek cheez confirm kar du? Yeh kis bare me hai:\n"
                "1. Payment karni hai\n"
                "2. Sirf record ke liye\n"
                "(1 ya 2 reply karein)"
            )
        else:
            q = (
                "Thoda confirm kar du — yeh kab ke liye hai:\n"
                "1. Aaj\n"
                "2. Aane wale dino me\n"
                "(1 ya 2 reply karein)"
            )
        # A clarification about money goes via DM to keep the group quiet on
        # sensitive matters; schedule clarifications can stay in the group.
        return Reply(kind=ReplyKind.dm if money else ReplyKind.text, text=q, dm=money)

    # Routine: acknowledge silently with a tick.
    return Reply(kind=ReplyKind.reaction, emoji="✅")


# ---------------------------------------------------------------------------
# query → plain-text answer with evidence
# ---------------------------------------------------------------------------


def _fmt_when(d: date | None) -> str:
    return d.isoformat() if d else "—"


def compose_query_answer(
    query: str,
    hits: list[dict[str, Any]],
    *,
    answerable: bool,
) -> Reply:
    """Format a WhatsApp answer for a query, always carrying evidence.

    ``hits`` is a list of plain dicts with keys: ``summary``, ``site_name``,
    ``occurred_on`` (date | None), ``event_type``. When ``answerable`` is False
    or there are no hits, Nivaan says so honestly rather than inventing data.

    Sensitive answers (money) are returned as a ``dm`` Reply so they never post
    to the group.
    """
    if not answerable or not hits:
        return Reply(
            kind=ReplyKind.text,
            text=(
                "Iske bare me mere paas pakka data nahi hai abhi. "
                "Thoda aur detail batayenge to dhoond deta hu."
            ),
        )

    sensitive = is_sensitive(query) or any(is_sensitive(h.get("summary")) for h in hits)

    lines: list[str] = []
    top = hits[:3]
    for h in top:
        when = _fmt_when(h.get("occurred_on"))
        site = h.get("site_name") or "site"
        summary = (h.get("summary") or "").strip()
        lines.append(f"• {summary} ({site}, {when})")

    body = "\n".join(lines)
    # Every answer carries its evidence: the what/when/site is in each bullet.
    if sensitive:
        prefix = "🔒 (private)\n"
        return Reply(kind=ReplyKind.dm, text=prefix + body, dm=True)
    return Reply(kind=ReplyKind.text, text=body)


# ---------------------------------------------------------------------------
# brief → numbered reply-message + number→decision mapping
# ---------------------------------------------------------------------------


@dataclass
class BriefRender:
    """A rendered brief ready to send + its reply-context map.

    ``text`` is the WhatsApp message (the brief plus numbered actionable items).
    ``reply_map`` maps the tappable number (as a string key, JSON-friendly) to
    the decision id it acts on — this is exactly what we persist into
    ``owner_briefs.payload['reply_map']`` so a later "1" reply resolves the right
    ledger row.
    """

    text: str
    reply_map: dict[str, str] = field(default_factory=dict)


def compose_brief(
    brief_text: str,
    pending_decisions: list[dict[str, Any]],
) -> BriefRender:
    """Render the morning brief as a reply-with-number message.

    Args:
        brief_text: the already-rendered brief body (from ``app.brief``).
        pending_decisions: ordered list of the owner's open decisions, each a
            dict with ``id`` (UUID|str) and ``title`` (str). These become the
            numbered, tappable actions appended to the brief.

    Returns a :class:`BriefRender`. The numbering is 1-based and stable; the
    ``reply_map`` is what gets stored in ``owner_briefs.payload``.
    """
    lines = [brief_text.rstrip()]
    reply_map: dict[str, str] = {}
    if pending_decisions:
        lines.append("")
        lines.append("Aapke faisle (reply with number):")
        for i, d in enumerate(pending_decisions, start=1):
            title = (d.get("title") or "Decision").strip()
            lines.append(f"{i}. {title}")
            reply_map[str(i)] = str(d.get("id"))
        lines.append("")
        lines.append("Reply: number = approve, 'hold N' = rok do, 'show proof N' = sabut.")
    return BriefRender(text="\n".join(lines), reply_map=reply_map)


# ---------------------------------------------------------------------------
# confirmations (reply_actions)
# ---------------------------------------------------------------------------


def compose_confirmation(verb: str, title: str, *, already: bool = False) -> str:
    """Short Hinglish confirmation after acting on a brief reply.

    ``verb`` is the canonical action (``approve`` | ``hold`` | ``reject`` |
    ``proof``); ``already`` is True when the action was an idempotent no-op
    (the decision was already in that state).
    """
    t = title.strip()
    if verb == "approve":
        if already:
            return f"✅ '{t}' pehle se approved hai."
        return f"✅ Done — '{t}' approve kar diya."
    if verb == "hold":
        if already:
            return f"⏸ '{t}' pehle se hold/rejected hai."
        return f"⏸ '{t}' hold pe daal diya."
    if verb == "reject":
        if already:
            return f"❌ '{t}' pehle se rejected hai."
        return f"❌ '{t}' reject kar diya."
    return f"'{t}' ke liye samajh gaya."


def compose_proof(title: str, evidence_lines: list[str]) -> str:
    """Render the evidence for a 'show proof N' request (Hinglish, brief)."""
    if not evidence_lines:
        return f"'{title}' ke liye abhi koi proof record nahi hai."
    body = "\n".join(f"• {line}" for line in evidence_lines)
    return f"'{title}' ka proof:\n{body}"


def compose_help() -> str:
    """The one-screen 'what can I do' message (Hinglish, brief)."""
    return (
        "Main Nivaan hu — site ka chhota assistant. 🙂\n"
        "• Site updates bhejte raho, main note kar leta hu (✅).\n"
        "• Sawaal pucho: 'kitne mazdoor aaye Site A?', 'latest slab drawing?'\n"
        "• Subah ke brief pe reply: number = approve, 'hold N', 'show proof N'."
    )


def resolve_reply_target(text: str, reply_map: dict[str, str]) -> tuple[str, UUID] | None:
    """Map a brief-reply text to (verb, decision_id) using the stored reply_map.

    Handles:
      * a bare number "2"            → ("approve", <decision for 2>)
      * "hold 2" / "reject 2"        → ("hold"|"reject", <decision for 2>)
      * "show proof 2" / "proof 2"   → ("proof", <decision for 2>)
      * "approve"/"hold" w/ one item → applies to the single pending decision
    Returns ``None`` if no target can be resolved.
    """
    import re

    if not reply_map:
        return None

    t = (text or "").strip().lower()

    proof = re.search(r"(?:show\s+)?proof\s+(\d+)|sab[uū]t\s+(\d+)", t)
    if proof:
        n = proof.group(1) or proof.group(2)
        did = reply_map.get(str(int(n)))
        return ("proof", UUID(did)) if did else None

    verb_num = re.search(r"\b(approve|hold|reject)\b\s*(\d+)?", t)
    bare_num = re.match(r"^\s*(\d{1,2})\s*$", t)

    if bare_num:
        did = reply_map.get(str(int(bare_num.group(1))))
        return ("approve", UUID(did)) if did else None

    if verb_num:
        verb = verb_num.group(1)
        num = verb_num.group(2)
        if num:
            did = reply_map.get(str(int(num)))
            return (verb, UUID(did)) if did else None
        # verb with no number: only unambiguous when exactly one item is pending.
        if len(reply_map) == 1:
            did = next(iter(reply_map.values()))
            return (verb, UUID(did))
        return None

    return None
