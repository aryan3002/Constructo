"""Transparent site health score from active findings.

Start at 100, subtract a weighted penalty per finding, floor at 0. The score is
explainable by construction — the dashboard shows exactly which findings drag it
down, no black box.
"""
from __future__ import annotations

PENALTY = {"critical": 25, "high": 15, "medium": 7, "low": 3}

HEALTHY_FLOOR = 85
WATCH_FLOOR = 60


def health_score(severities: list[str]) -> int:
    """0-100 score from the severities of a site's active findings."""
    score = 100 - sum(PENALTY.get(s, 0) for s in severities)
    return max(0, score)


def health_band(score: int) -> str:
    """'healthy' (85+) | 'watch' (60-84) | 'at_risk' (<60)."""
    if score >= HEALTHY_FLOOR:
        return "healthy"
    if score >= WATCH_FLOOR:
        return "watch"
    return "at_risk"
