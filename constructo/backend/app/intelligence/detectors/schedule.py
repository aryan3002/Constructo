"""Schedule detectors: drift against the industry-typical baseline, and
out-of-order phase progress. Pure functions, no LLM, no DB.
"""
from __future__ import annotations

from datetime import date

from app.homeowner.milestone_reference import typical_duration_days
from app.intelligence.detectors.base import Finding, MilestoneRow
from app.intelligence.sequence import canonical_phase, phase_order

# A phase running past typical_max x this is "watch"; x STALE_HIGH is "needs attention".
STALE_WARN = 1.5
STALE_HIGH = 2.0


def stale_milestone(milestones: list[MilestoneRow], *, today: date) -> list[Finding]:
    """Flag a milestone in status 'now' running far past its industry-typical max.

    Honest by construction: a milestone whose name has no known typical duration
    is skipped (we never fabricate a baseline), and only in-progress milestones
    with a start date are judged.
    """
    out: list[Finding] = []
    for ms in milestones:
        if ms.status != "now" or ms.started_on is None:
            continue
        span = typical_duration_days(ms.name)
        if span is None:
            continue
        typical_max = span[1]
        elapsed = (today - ms.started_on).days
        if elapsed <= typical_max * STALE_WARN:
            continue
        severity = "high" if elapsed > typical_max * STALE_HIGH else "medium"
        out.append(
            Finding(
                finding_type="stale_milestone",
                severity=severity,
                headline=f"{ms.name} has run {elapsed} days (usually {span[0]}–{span[1]})",
                detail=(
                    f"The {ms.name} phase started {elapsed} days ago and is still open. "
                    f"Industry-typical for this phase is {span[0]}–{span[1]} days."
                ),
                evidence_event_ids=[ms.id],
                phase=canonical_phase(ms.name),
            )
        )
    return out


def phase_sequence_violation(
    milestones: list[MilestoneRow], *, today: date
) -> list[Finding]:
    """Flag a later-sequence phase active/done while an earlier one this site
    actually tracks is not yet complete.

    Operates over the site's OWN milestone set (not the global phase list), so a
    simply-untracked phase never triggers a false positive — only a genuine
    out-of-order signal does.
    """
    # Resolve each milestone to (order, phase, milestone); ignore unmappable names.
    ranked = []
    for ms in milestones:
        phase = canonical_phase(ms.name)
        order = phase_order(phase) if phase else None
        if order is not None:
            ranked.append((order, phase, ms))
    ranked.sort(key=lambda r: r[0])

    out: list[Finding] = []
    for i, (_order_i, phase_i, ms_i) in enumerate(ranked):
        active_i = ms_i.status in ("now", "done")
        if not active_i:
            continue
        # Any earlier-tracked phase not yet done is an out-of-order signal.
        for _order_j, _phase_j, ms_j in ranked[:i]:
            if ms_j.status != "done":
                out.append(
                    Finding(
                        finding_type="phase_sequence_violation",
                        severity="high",
                        headline=f"{ms_i.name} is underway but {ms_j.name} isn't finished",
                        detail=(
                            f"{ms_i.name} (a later phase) is {ms_i.status}, while the "
                            f"earlier {ms_j.name} is still {ms_j.status}. Work may be "
                            f"out of sequence."
                        ),
                        evidence_event_ids=[ms_i.id, ms_j.id],
                        phase=phase_i,
                    )
                )
                break  # one finding per out-of-order milestone is enough
    return out
