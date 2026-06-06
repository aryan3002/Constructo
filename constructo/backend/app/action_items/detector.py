"""AI-detected Action Items (2.7) — a deterministic, conservative detector.

Nivaan spots the task you forgot ("Ramesh ko Friday tak bolo") and proposes a
badged Action Item the user can keep or dismiss. This is the *deterministic*
stand-in for the agent's ``propose_action_item`` tool: high precision, low
recall, on purpose — a false task every day is worse than a missed one, so it
fires only on an explicit assignment pattern and is always ``created_by_ai`` (so
it's badged "Nivaan" and freely deletable). Auto-dismiss-if-untouched is enforced
by the caller's SLA sweep, not here.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

# Explicit assignment cues — an imperative directed at someone / a deadline'd task.
_ASSIGN_CUES = (
    "bolo", "bol do", "boldo", "keh do", "kehdo", "kehna", "kah do",
    "remind", "yaad dila", "follow up", "followup", "chase",
    "bhej do", "bhejo", "bhijwa", "order karo", "order kar do",
    "call karo", "phone karo", "complete karo", "karwa do", "karwado",
    "arrange karo", "mangwa", "mangao",
)

# Relative + weekday due hints (Hinglish + English).
_REL = {"aaj": 0, "today": 0, "kal": 1, "tomorrow": 1, "parso": 2}
_WEEKDAYS = {
    "monday": 0, "somwar": 0, "tuesday": 1, "mangalwar": 1, "wednesday": 2, "budhwar": 2,
    "thursday": 3, "guruwar": 3, "friday": 4, "shukrawar": 4, "saturday": 5, "shaniwar": 5,
    "sunday": 6, "ravivar": 6, "itwar": 6,
}


@dataclass(frozen=True)
class ActionProposal:
    title: str
    due_on: date | None


def _detect_due(text: str, today: date) -> date | None:
    for word, delta in _REL.items():
        if re.search(rf"\b{word}\b", text):
            return today + timedelta(days=delta)
    for word, wd in _WEEKDAYS.items():
        if re.search(rf"\b{word}\b", text):
            ahead = (wd - today.weekday()) % 7
            return today + timedelta(days=ahead or 7)  # the NEXT such weekday
    return None


def detect_action_item(text: str | None, *, today: date | None = None) -> ActionProposal | None:
    """Return a high-precision Action Item proposal, or None. Conservative: fires
    only when an explicit assignment cue is present (optionally with a due)."""
    if not text:
        return None
    today = today or date.today()
    n = re.sub(r"\s+", " ", text.strip().lower())
    if len(n) < 6:
        return None
    if not any(cue in n for cue in _ASSIGN_CUES):
        return None
    # Avoid firing on a pure capture sentence (a number-led delivery/attendance).
    title = text.strip()
    if len(title) > 200:
        title = title[:197] + "…"
    return ActionProposal(title=title, due_on=_detect_due(n, today))
