"""Deterministic weekly kill-criteria rollup for the chat bet.

Aggregates over chat_messages, raw_messages, and site_events — no LLM calls.
Returns a snapshot dict that can be stored in bet_metrics_weekly.payload.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatMessage, Conversation
from app.models.raw_message import RawMessageModel
from app.models.site_event import SiteEventModel

logger = logging.getLogger(__name__)

_WINDOW_DAYS = 7


async def compute_week(
    session: AsyncSession,
    company_id: UUID,
    *,
    week_start: datetime,
) -> dict:
    """Compute the kill-criteria snapshot for a single company and week window.

    The window is [week_start, week_start + 7 days).

    Returns a dict with keys:
        week_start, weekly_senders, messages_total, decision_origin, extraction
    """
    week_end = week_start + timedelta(days=_WINDOW_DAYS)

    # --- 1. Chat messages in window for this company -------------------------
    # Join ChatMessage → Conversation by company_id.
    msg_q = (
        select(ChatMessage.id, ChatMessage.sender_id)
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(
            Conversation.company_id == company_id,
            ChatMessage.created_at >= week_start,
            ChatMessage.created_at < week_end,
        )
    )
    msg_rows = (await session.execute(msg_q)).all()
    messages_total = len(msg_rows)
    weekly_senders = len({r.sender_id for r in msg_rows if r.sender_id is not None})

    # --- 2. Raw messages in window: per-source total + failed counts ---------
    # We need the raw_message_ids that belong to this company's window.
    # raw_messages doesn't have company_id, so we scope via chat_messages.raw_message_id.
    msg_raw_ids: list[UUID] = []
    # Collect raw_message_ids from chat messages in window
    bridge_q = (
        select(ChatMessage.raw_message_id)
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(
            Conversation.company_id == company_id,
            ChatMessage.created_at >= week_start,
            ChatMessage.created_at < week_end,
            ChatMessage.raw_message_id.isnot(None),
        )
    )
    bridge_rows = (await session.execute(bridge_q)).scalars().all()
    msg_raw_ids = list(bridge_rows)

    per_source: dict[str, dict] = {}
    if msg_raw_ids:
        raw_agg_q = (
            select(
                RawMessageModel.source,
                func.count().label("total"),
                func.count()
                .filter(RawMessageModel.status == "failed")
                .label("failed"),
            )
            .where(RawMessageModel.id.in_(msg_raw_ids))
            .group_by(RawMessageModel.source)
        )
        for row in (await session.execute(raw_agg_q)).all():
            per_source[row.source] = {"total": row.total, "failed": row.failed}

    # --- 3. SiteEvents in window for this company ----------------------------
    # site_events don't carry company_id directly; scope via source_message_ids
    # overlapping the raw_message_ids we already collected above.
    events_total = 0
    unknown_events = 0
    needs_clarification_events = 0
    decision_origin: dict[str, int] = {}

    if msg_raw_ids:
        # All events whose source_message_ids overlap with our raw ids.
        # Use .overlap() — the same idiom used in app/chat/router.py.
        events_q = (
            select(SiteEventModel)
            .where(
                SiteEventModel.source_message_ids.overlap(msg_raw_ids),
                SiteEventModel.created_at >= week_start,
                SiteEventModel.created_at < week_end,
            )
        )
        all_events = (await session.execute(events_q)).scalars().all()

        events_total = len(all_events)
        unknown_events = sum(1 for e in all_events if e.event_type == "unknown")
        needs_clarification_events = sum(1 for e in all_events if e.needs_clarification)

        # Decision-origin: approval events split by source of their raw message.
        approval_events = [e for e in all_events if e.event_type == "approval"]
        if approval_events:
            # Collect all source_message_ids from approval events.
            approval_raw_ids: list[UUID] = []
            for ev in approval_events:
                approval_raw_ids.extend(ev.source_message_ids)
            if approval_raw_ids:
                source_q = (
                    select(RawMessageModel.source)
                    .where(RawMessageModel.id.in_(approval_raw_ids))
                )
                for src_row in (await session.execute(source_q)).scalars().all():
                    decision_origin[src_row] = decision_origin.get(src_row, 0) + 1

    return {
        "week_start": week_start.date().isoformat(),
        "weekly_senders": weekly_senders,
        "messages_total": messages_total,
        "decision_origin": decision_origin,
        "extraction": {
            "per_source": per_source,
            "unknown_events": unknown_events,
            "needs_clarification_events": needs_clarification_events,
            "events_total": events_total,
        },
    }
