"""The trust membrane for proactive findings: which SiteFindings cross to the
homeowner, and how they're reframed warm.

Mirrors ``app.publish.membrane``'s CROSSING/NON-CROSSING discipline. Operational
findings (attendance, vendor, material mismatch, missing approval, out-of-sequence
work, recurring issues, curing) stay contractor-side. Only schedule honesty and
design fidelity reach the homeowner — and only while OPEN (acknowledged/resolved
never surface). Pure functions; no DB, no LLM.
"""
from __future__ import annotations

from dataclasses import dataclass

# Schedule-honesty findings -> a gentle "taking a little longer" card (informational).
_SCHEDULE_TYPES = {"stale_milestone"}
# Design-fidelity findings (Phase 4) -> a respondable "looks different from your
# approved design" card that drives the approve/dispute/show-more loop.
_DESIGN_TYPES = {"material_theme_clash", "photo_vs_theme"}


@dataclass
class HeadsUpCard:
    finding_id: str
    category: str  # "schedule" | "design"
    headline: str  # warm, homeowner-facing reframe
    respondable: bool  # design cards drive the approve/dispute/show-more loop


def _phase_label(phase: str | None) -> str:
    return phase.replace("_", " ") if phase else "this stage"


def to_card(finding) -> HeadsUpCard | None:
    """Reframe a SiteFinding as a homeowner heads-up card, or None if it must not
    cross the membrane (operational type, or not currently open)."""
    if finding.status != "open":
        return None
    if finding.finding_type in _SCHEDULE_TYPES:
        return HeadsUpCard(
            finding_id=str(finding.id),
            category="schedule",
            headline=(
                f"Your {_phase_label(finding.phase)} is taking a little longer than "
                f"the usual timeline — your builder is on it."
            ),
            respondable=False,
        )
    if finding.finding_type in _DESIGN_TYPES:
        return HeadsUpCard(
            finding_id=str(finding.id),
            category="design",
            headline=(
                "Something being installed looks different from your approved "
                "design — worth confirming with your builder."
            ),
            respondable=True,
        )
    return None


def homeowner_cards(findings) -> list[HeadsUpCard]:
    """Filter + reframe a list of SiteFindings into homeowner heads-up cards."""
    return [card for card in (to_card(f) for f in findings) if card is not None]
