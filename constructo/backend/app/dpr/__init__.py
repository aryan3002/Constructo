"""C4 — PM Auto-DPR (Daily Progress Report).

``draft_dpr()`` assembles a DPR *draft* for one site+date from that day's
``site_events``: deterministic structured sections + an injectable LLM prose
summary (degrades to a deterministic fallback). The draft is the PM's to
review and Send — nothing here ever sends.
"""

from app.dpr.draft import DraftedDpr, draft_dpr

__all__ = ["DraftedDpr", "draft_dpr"]
