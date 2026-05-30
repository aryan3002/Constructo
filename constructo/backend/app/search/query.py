"""Plain-language query parsing for hybrid search.

Turns a user's natural-language question into (a) structured filters we can push
down to SQL and (b) the residual semantic text we embed for the vector search.

Examples:
  "show cement deliveries Site A this week"
    -> event_type=material_delivery, date>=<this week>, semantic="cement"
  "which sites had labor below plan"
    -> event_type=attendance, semantic="labor below plan"

Deterministic + network-free (keyword heuristics in the construction domain,
mirroring ``app.extraction.llm._classify_text``). The semantic vector handles
the long tail; this parser just lifts the cheap, high-precision filters out.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.contracts.events import EventType

# Keyword -> event type. First match wins, scanned in this order so the more
# specific intents (deliveries, invoices) beat the generic ones.
_TYPE_KEYWORDS: list[tuple[EventType, tuple[str, ...]]] = [
    (EventType.material_delivery, ("delivery", "deliveries", "delivered", "material",
                                   "cement", "steel", "sariya", "bricks", "sand")),
    (EventType.invoice_received, ("invoice", "invoices", "challan", "bill", "gst")),
    (EventType.payment_request, ("payment", "payments", "advance", "paisa")),
    (EventType.attendance, ("attendance", "labor", "labour", "mazdoor", "worker",
                            "workers", "headcount", "manpower")),
    (EventType.issue, ("issue", "issues", "problem", "problems", "delay", "blocked",
                       "crack", "leak", "safety")),
    (EventType.progress_update, ("progress", "slab", "casting", "plaster",
                                 "completed", "pour")),
    (EventType.drawing_shared, ("drawing", "drawings", "naksha", "blueprint", "plan")),
    (EventType.approval, ("approval", "approvals", "approved", "sanction")),
]

# Words we drop from the residual semantic text once they've been consumed as
# filters or are pure scaffolding ("show", "which", "had").
_STOPWORDS = frozenset({
    "show", "me", "the", "a", "an", "of", "in", "on", "at", "for", "which",
    "what", "was", "were", "had", "has", "have", "is", "are", "list", "find",
    "get", "all", "any", "site", "sites", "this", "that", "give",
})


@dataclass
class ParsedQuery:
    """Structured filters + residual semantic text extracted from a query."""

    semantic_text: str
    event_type: EventType | None = None
    date_from: date | None = None
    date_to: date | None = None
    site_name_hint: str | None = None
    consumed: list[str] = field(default_factory=list)


def _detect_event_type(text: str) -> tuple[EventType | None, list[str]]:
    for etype, kws in _TYPE_KEYWORDS:
        for kw in kws:
            if re.search(rf"\b{re.escape(kw)}\b", text):
                return etype, [kw]
    return None, []


def _detect_date_range(text: str, today: date) -> tuple[date | None, date | None, list[str]]:
    """Recognise a few common relative ranges. Returns (from, to, consumed)."""
    if "today" in text:
        return today, today, ["today"]
    if "yesterday" in text:
        y = today - timedelta(days=1)
        return y, y, ["yesterday"]
    if "this week" in text:
        start = today - timedelta(days=today.weekday())  # Monday
        return start, today, ["this", "week"]
    if "last week" in text:
        this_monday = today - timedelta(days=today.weekday())
        start = this_monday - timedelta(days=7)
        end = this_monday - timedelta(days=1)
        return start, end, ["last", "week"]
    if "this month" in text:
        return today.replace(day=1), today, ["this", "month"]
    m = re.search(r"last (\d{1,3}) days", text)
    if m:
        n = int(m.group(1))
        return today - timedelta(days=n), today, ["last", m.group(1), "days"]
    return None, None, []


# Words that follow "site" but are NOT a site name ("site events", "site progress").
# Kept narrow so short real names like "Site A"/"Site B" still resolve.
_SITE_HINT_DENYLIST = frozenset({
    "events", "event", "progress", "updates", "update", "issues", "issue",
    "deliveries", "delivery", "attendance", "had", "have", "has", "was", "were",
})


def _detect_site_hint(text: str) -> tuple[str | None, list[str]]:
    """Lift a ``Site X`` / ``site X`` name hint (single trailing token).

    Conservative: only fires on the literal pattern ``site <word>`` so we don't
    swallow real query terms. The hint is matched against visible site names at
    query time; it never widens scope.
    """
    m = re.search(r"\bsite\s+([a-z0-9]+)\b", text)
    if m:
        token = m.group(1)
        if token not in _SITE_HINT_DENYLIST:
            return token, ["site", token]
    return None, []


def parse_query(raw: str, *, today: date | None = None) -> ParsedQuery:
    """Parse a plain-language query into filters + residual semantic text."""
    today = today or date.today()
    text = (raw or "").lower().strip()

    consumed: list[str] = []
    etype, c = _detect_event_type(text)
    consumed += c
    date_from, date_to, c = _detect_date_range(text, today)
    consumed += c
    site_hint, c = _detect_site_hint(text)
    consumed += c

    # Build residual semantic text: original words minus consumed filter tokens
    # and stopwords. Keep it non-empty (fall back to the original query) so the
    # vector search always has something to embed.
    consumed_set = {w.lower() for w in consumed}
    words = re.findall(r"[a-z0-9]+", text)
    residual = [w for w in words if w not in consumed_set and w not in _STOPWORDS]
    semantic_text = " ".join(residual).strip() or raw.strip()

    return ParsedQuery(
        semantic_text=semantic_text,
        event_type=etype,
        date_from=date_from,
        date_to=date_to,
        site_name_hint=site_hint,
        consumed=consumed,
    )
