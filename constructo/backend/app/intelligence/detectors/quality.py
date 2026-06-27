"""Quality / compliance detectors: structural curing window and approval gates.

Pure functions over EventRow lists; no LLM, no DB. Keyword heuristics over
progress text, deliberately conservative — findings are advisory and
acknowledgeable, never blocking.
"""
from __future__ import annotations

from datetime import date

from app.intelligence.detectors.base import EventRow, Finding

MIN_CURING_DAYS = 21

# Progress text that indicates a fresh RCC pour (curing must follow).
_SLAB_KW = ("slab", "casting", "cast", "dhalai", "rcc", "roof cast")
# Progress text that indicates load-bearing work resuming on the cured element.
_LOADWORK_KW = ("brick", "masonry", "chinai", "blockwork", "block work")
# Phases whose work conventionally requires a logged approval before it starts.
_GATED_KW = ("slab", "casting", "rcc", "waterproof", "foundation")


def _has(blob: str, kws) -> bool:
    return any(k in blob for k in kws)


def curing_violation(
    events: list[EventRow], *, today: date, min_curing_days: int = MIN_CURING_DAYS
) -> list[Finding]:
    """Flag load-bearing masonry resuming within the slab's curing window.

    Heuristic: a slab-cast progress event followed by brickwork/masonry within
    ``min_curing_days``. Floor context isn't modelled yet, so this is advisory —
    a critical-severity prompt to verify, not a verdict. (Refinement: scope to
    same/upper floor once floor data exists.)
    """
    prog = [e for e in events if e.event_type == "progress_update"]
    slabs = [e for e in prog if _has(e.summary.lower(), _SLAB_KW)]
    loads = [e for e in prog if _has(e.summary.lower(), _LOADWORK_KW)]
    out: list[Finding] = []
    for s in slabs:
        for ld in loads:
            delta = (ld.occurred_on - s.occurred_on).days
            if 0 < delta < min_curing_days:
                out.append(
                    Finding(
                        finding_type="curing_violation",
                        severity="critical",
                        headline=(
                            f"Load-bearing work resumed {delta} days after slab cast "
                            f"(needs {min_curing_days})"
                        ),
                        detail=(
                            f"A slab was cast on {s.occurred_on.isoformat()} and load-bearing "
                            f"work appears to have resumed {delta} days later, inside the "
                            f"{min_curing_days}-day curing window. Verify the floor first."
                        ),
                        evidence_event_ids=[s.id, ld.id],
                        phase="curing",
                    )
                )
                break  # one finding per slab event
    return out


def missing_approval(events: list[EventRow], *, today: date) -> list[Finding]:
    """Flag approval-gated work (slab/RCC/waterproofing/foundation) with no
    approval event logged on or before the work date."""
    approvals = [e for e in events if e.event_type == "approval"]
    out: list[Finding] = []
    for e in events:
        if e.event_type != "progress_update" or not _has(e.summary.lower(), _GATED_KW):
            continue
        if any(a.occurred_on <= e.occurred_on for a in approvals):
            continue
        out.append(
            Finding(
                finding_type="missing_approval",
                severity="high",
                headline=f"Gated work logged with no prior approval: {e.summary[:60]}",
                detail=(
                    f"Progress on approval-gated work was recorded on {e.occurred_on.isoformat()}, "
                    f"but no approval event precedes it in the record."
                ),
                evidence_event_ids=[e.id],
            )
        )
    return out
