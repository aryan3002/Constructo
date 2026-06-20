"""Detect meeting / call-scheduling chatter so it never becomes an action item.

Construction WhatsApp threads are full of "join the Google Meet", "schedule a
session", "meeting link", etc. Those are NOT construction to-dos — surfacing them
as overdue action items (and the Sentinel decisions derived from them) floods the
owner's Brief / Approvals / Radar with junk like
'"connect via the Google Meet link" is 985 days overdue'.

One shared matcher used by the enrichment (so it never creates them), the live
chat detector (so live chat never creates them), and the cleanup script (so the
existing junk can be found and removed).
"""
import re

_MEETING_RE = re.compile(
    r"\b("
    r"google\s*meet|meet\.google\.com|zoom|video\s*call|"
    r"meeting\s*(link|notes|platform|id|invite|room)|"
    r"join\s+(the\s+)?(meeting|google\s*meet|call|session|link)|"
    r"schedule\s+(a\s+)?(google\s*meet|meeting|call|session)|"
    r"connect\s+(via|to|join)|"
    r"meeting\s+(scheduled|invite|request|platform)|"
    r"(re)?schedule(d)?\s+(the\s+)?(meet|call|session)|"
    r"verify\s+meeting\s+notes"
    r")\b",
    re.IGNORECASE,
)


def is_meeting_chatter(*texts: str | None) -> bool:
    """True if ANY given text is meeting/call-scheduling chatter (not a real task)."""
    return any(bool(t) and _MEETING_RE.search(t) is not None for t in texts)
