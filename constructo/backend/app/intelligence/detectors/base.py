"""Shared shapes for the deterministic detector layer.

Detectors are PURE functions over these ORM-decoupled rows (mirrors aggregate.py's
``EventLike``), so they unit-test offline with hand-built data. Each detector
returns ``Finding`` objects; the engine maps them to persisted ``SiteFinding``
rows and dedupes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# Severity ladder (extends risk.py's low/medium/high with critical for
# structural/safety findings like a missed curing window).
SEVERITY = ("low", "medium", "high", "critical")


@dataclass(frozen=True)
class Finding:
    finding_type: str
    severity: str
    headline: str
    detail: str
    evidence_event_ids: list[str] = field(default_factory=list)
    phase: str | None = None


@dataclass
class MilestoneRow:
    """The minimal milestone shape a schedule detector needs."""

    id: str
    name: str
    status: str  # "upcoming" | "now" | "done"
    started_on: date | None = None
    expected_on: date | None = None
    completed_on: date | None = None


@dataclass
class EventRow:
    """The minimal site-event shape a consistency/quality detector needs."""

    id: str
    event_type: str
    occurred_on: date
    summary: str
    fields: dict
    confidence: float
