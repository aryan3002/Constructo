"""Detect **Quiet Periods** — silent windows on the site (DETERMINISTIC).

Eleventh-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): a *quiet period* is a stretch where nothing
visible happened on site. This pass walks the site's events in date order and,
wherever two consecutive ``occurred_on`` dates are ``>= MIN_GAP_DAYS`` apart,
upserts a :class:`QuietPeriod` for that gap.

NO LLM, NO FABRICATION (Determinism Doctrine): the gap is a pure fact of the
event timeline; ``phase_reason`` is left NULL (the reason is never invented — a
later contractor-confirm flow fills it). A site with no qualifying gap yields
zero rows (asserted by the test). Every row uses a deterministic ``uuid5`` id
derived from the gap's start date, so re-running upserts the same rows and never
duplicates.

Only ONE window may be live at a time per site (the ``uq_quiet_open_per_site``
partial index). Historical gaps were closed by the very event that ended them,
so all gaps EXCEPT the most recent are recorded ``closed`` (with that real
signal stamped); only the latest gap stays ``open``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_quiet_periods
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, date, datetime, time
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import QuietPeriod, QuietStatus, SiteEventModel

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# A gap of at least this many days between consecutive on-site events is "quiet".
MIN_GAP_DAYS = 7


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=UTC)


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update by primary-key id (idempotent re-runs)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Detect quiet windows between consecutive site events and upsert them.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_documents``); defaults to the real ``SessionLocal``.
    Returns ``{"gaps", "quiet_periods"}``.
    """
    site_id = _id("site")

    async with session_factory() as s:
        # Distinct active-day dates, ascending (a quiet period is a gap between
        # days on which *something* was recorded).
        days = (
            await s.execute(
                select(SiteEventModel.occurred_on)
                .where(SiteEventModel.site_id == site_id)
                .order_by(SiteEventModel.occurred_on)
            )
        ).scalars().all()
        ordered = sorted({d for d in days if d is not None})

        # Each qualifying gap → (start_day, next_day, gap_days).
        gaps: list[tuple[date, date, int]] = []
        for prev, nxt in zip(ordered, ordered[1:], strict=False):
            delta = (nxt - prev).days
            if delta >= MIN_GAP_DAYS:
                gaps.append((prev, nxt, delta))

        if not gaps:
            return {"gaps": 0, "quiet_periods": 0}

        quiet_periods = 0
        last_idx = len(gaps) - 1
        for i, (start_day, next_day, gap_days) in enumerate(gaps):
            is_latest = i == last_idx
            # Historical gaps were ended by the next event (a real signal), so
            # they are closed; only the most recent gap stays open/live. This also
            # satisfies the one-live-window-per-site partial unique index.
            await _upsert(
                s,
                QuietPeriod,
                _id("quiet", start_day.isoformat()),
                site_id=site_id,
                last_signal_at=_midnight(start_day),
                gap_days=gap_days,
                phase_reason=None,  # never invented — a later flow fills it
                reason_source="schedule",
                next_expected_at=_midnight(next_day),
                status=QuietStatus.open if is_latest else QuietStatus.closed,
                resolved_at=None if is_latest else _midnight(next_day),
            )
            quiet_periods += 1

        await s.commit()

    return {"gaps": len(gaps), "quiet_periods": quiet_periods}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched quiet periods:", counts)


if __name__ == "__main__":
    main()
