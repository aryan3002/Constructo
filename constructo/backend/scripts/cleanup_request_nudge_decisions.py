"""Resolve legacy homeowner-request shadow Decisions left by the pre-de-pollution
nudge path.

Before Option (a), every homeowner request raised a contractor-facing Decision
titled ``[homeowner-request-nudge][<req-id>] <title>`` (at creation and on the
overdue sweep). Those rows polluted the owner Brief numbering, the approvals
inbox, and the contractor bell feed. The live code no longer creates them; this
one-off clears the ones already in the DB.

It RESOLVES (state -> resolved, reversible-ish audit trail kept) every open
Decision whose title starts with ``[homeowner-request-nudge]``. It NEVER touches
``[homeowner-quiet-nudge]`` rows (those are a live, generic quiet-period signal —
see app/homeowner/quiet.py) or any real construction decision.

Idempotent + scoped to the request-nudge tag only.

DRY-RUN by default — prints what it WOULD change. Pass --apply to write:
    DATABASE_URL=... uv run python -m scripts.cleanup_request_nudge_decisions --apply
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.homeowner.nudge import NUDGE_TAG
from app.homeowner.quiet import QUIET_NUDGE_TAG
from app.models import Decision, DecisionState

_OPEN = (DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated)


async def run(session_factory=SessionLocal, *, apply: bool = False) -> dict:
    async with session_factory() as s:
        stale = (
            await s.execute(
                select(Decision).where(
                    Decision.title.like(f"{NUDGE_TAG}%"),
                    # Belt-and-braces: never the quiet-period signal.
                    Decision.title.not_like(f"{QUIET_NUDGE_TAG}%"),
                    Decision.state.in_(_OPEN),
                )
            )
        ).scalars().all()

        print(f"[homeowner-request-nudge] decisions to resolve: {len(stale)}")
        for d in stale[:8]:
            print(f"    - {d.title[:80]}")

        if not apply:
            print("\n(dry-run — re-run with --apply to write)")
            return {"would_resolve": len(stale)}

        from datetime import UTC, datetime

        now = datetime.now(UTC)
        for d in stale:
            d.state = DecisionState.resolved
            d.resolved_at = now
            if not d.resolution_note:
                d.resolution_note = (
                    "Auto-cleared: legacy homeowner-request nudge (now a push, not a decision)."
                )
        await s.commit()
        return {"resolved": len(stale)}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    apply = "--apply" in sys.argv
    print("Request-nudge decision cleanup:", asyncio.run(run(apply=apply)))


if __name__ == "__main__":
    main()
