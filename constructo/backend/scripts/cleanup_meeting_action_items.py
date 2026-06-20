"""Clear the meeting/call-scheduling junk that floods the owner Brief/Approvals/Radar.

The action-item enrichment used to turn the architect's Google-Meet invites into
overdue to-dos; the Sentinel sweep then escalated them into '[SENTINEL] "join the
Google Meet" is 985 days overdue' decisions. This:

  1. CANCELS the open AI-created action items that are meeting/call chatter
     (status=cancelled — reversible, drops them off the Radar which reads `open`),
  2. RESOLVES the derived '[SENTINEL] …' decisions that are meeting chatter
     (drops them off the owner's pending Approvals + Brief count).

Idempotent + scoped to chatter only (real construction tasks are untouched). The
enrichment + live detector are also tightened (app/action_items/junk.py) so this
never recurs.

DRY-RUN by default — prints what it WOULD change. Pass --apply to write:
    DATABASE_URL=... uv run python -m scripts.cleanup_meeting_action_items --apply
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.action_items.junk import is_meeting_chatter
from app.db import SessionLocal
from app.models import (
    ActionItem,
    ActionItemStatus,
    ChatMessage,
    Decision,
    DecisionState,
)

_SENTINEL_TAG = "[SENTINEL]"


async def run(session_factory=SessionLocal, *, apply: bool = False) -> dict:
    async with session_factory() as s:
        # 1) Open AI-created action items that are meeting/call chatter (by title
        #    or by the source chat message body).
        rows = (
            await s.execute(
                select(ActionItem, ChatMessage.body)
                .outerjoin(ChatMessage, ActionItem.source_message_id == ChatMessage.id)
                .where(
                    ActionItem.created_by_ai.is_(True),
                    ActionItem.status == ActionItemStatus.open,
                )
            )
        ).all()
        junk_items = [ai for (ai, body) in rows if is_meeting_chatter(ai.title, body)]

        # Self-correct: re-open AI items that were cancelled by an earlier (looser)
        # run but no longer match the tightened filter (e.g. a real "connect the
        # drain" / "zoom in on the crack" task). Only AI-created cancelled rows are
        # touched (the seed/enrich never cancels; only this script does).
        cancelled_rows = (
            await s.execute(
                select(ActionItem, ChatMessage.body)
                .outerjoin(ChatMessage, ActionItem.source_message_id == ChatMessage.id)
                .where(
                    ActionItem.created_by_ai.is_(True),
                    ActionItem.status == ActionItemStatus.cancelled,
                )
            )
        ).all()
        restore_items = [
            ai for (ai, body) in cancelled_rows if not is_meeting_chatter(ai.title, body)
        ]

        # 2) Pending [SENTINEL] decisions whose text is meeting chatter.
        decisions = (
            await s.execute(
                select(Decision).where(
                    Decision.title.like(f"{_SENTINEL_TAG}%"),
                    Decision.state.in_([DecisionState.pending, DecisionState.escalated]),
                )
            )
        ).scalars().all()
        junk_decisions = [d for d in decisions if is_meeting_chatter(d.title, d.detail)]

        print(f"meeting action items to cancel : {len(junk_items)}")
        for ai in junk_items[:8]:
            print(f"    - {ai.title[:80]}")
        print(f"false-positive items to RESTORE: {len(restore_items)}")
        for ai in restore_items[:8]:
            print(f"    + {ai.title[:80]}")
        print(f"[SENTINEL] decisions to resolve: {len(junk_decisions)}")
        for d in junk_decisions[:8]:
            print(f"    - {d.title[:80]}")

        if not apply:
            print("\n(dry-run — re-run with --apply to write)")
            return {
                "would_cancel": len(junk_items),
                "would_restore": len(restore_items),
                "would_resolve": len(junk_decisions),
            }

        from datetime import UTC, datetime

        now = datetime.now(UTC)
        for ai in junk_items:
            ai.status = ActionItemStatus.cancelled
        for ai in restore_items:
            ai.status = ActionItemStatus.open
        for d in junk_decisions:
            d.state = DecisionState.resolved
            d.resolved_at = now
            if not d.resolution_note:
                d.resolution_note = "Auto-cleared: meeting/scheduling noise (not a decision)."
        await s.commit()
        return {
            "cancelled": len(junk_items),
            "restored": len(restore_items),
            "resolved": len(junk_decisions),
        }


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    apply = "--apply" in sys.argv
    print("Meeting-junk cleanup:", asyncio.run(run(apply=apply)))


if __name__ == "__main__":
    main()
