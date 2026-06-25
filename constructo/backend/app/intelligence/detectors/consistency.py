"""Work-consistency detectors: material arrived but no work follows.

Pure functions over EventRow lists; no LLM, no DB. Operate on event *presence and
dates*, not on (noisier) extracted quantities — so they are robust to the
field-level extraction gaps measured in the real-AI probe.
"""
from __future__ import annotations

from datetime import date

from app.intelligence.detectors.base import EventRow, Finding
from app.intelligence.sequence import phase_for_material

# A delivery with no following work for this many days is a "watch"; x2 is "high".
MISMATCH_WINDOW_DAYS = 10


def material_work_mismatch(
    events: list[EventRow], *, today: date, window_days: int = MISMATCH_WINDOW_DAYS
) -> list[Finding]:
    """Flag a material delivery with no progress update logged after it.

    Material that arrives and is followed by silence is a real signal (idle
    stock, possible diversion, or just an un-captured site). Any progress update
    on or after the delivery date clears it; deliveries newer than the window are
    given time.
    """
    deliveries = [e for e in events if e.event_type == "material_delivery"]
    progress = [e for e in events if e.event_type == "progress_update"]
    out: list[Finding] = []
    for d in deliveries:
        gap = (today - d.occurred_on).days
        if gap < window_days:
            continue
        if any(p.occurred_on >= d.occurred_on for p in progress):
            continue
        material = (d.fields or {}).get("material") or "material"
        phases = phase_for_material(material if isinstance(material, str) else None)
        severity = "high" if gap >= window_days * 2 else "medium"
        out.append(
            Finding(
                finding_type="material_work_mismatch",
                severity=severity,
                headline=f"{material} delivered {gap} days ago, no site progress logged since",
                detail=(
                    f"A {material} delivery on {d.occurred_on.isoformat()} has no progress "
                    f"update after it ({gap} days). The material may be sitting unused."
                ),
                evidence_event_ids=[d.id],
                phase=phases[0] if phases else None,
            )
        )
    return out
