"""Deliver the morning brief over WhatsApp and persist its reply context.

:func:`deliver_brief`:

  1. builds (or reuses) the company's :class:`OwnerBrief` for the date via the
     shared :func:`app.brief.generate.build_brief`,
  2. gathers the owner's open :class:`Decision` rows as numbered, tappable
     actions,
  3. renders the brief-with-numbers message (:func:`app.bot.compose.compose_brief`),
  4. sends it to the owner's chat via :mod:`app.bot.sender`, and
  5. persists the number → decision_id ``reply_map`` into
     ``owner_briefs.payload`` (NO new table) and stamps ``sent_at``.

The persisted ``reply_map`` is exactly what :func:`app.bot.reply_actions.apply_brief_reply`
reads to settle the right ledger row when the owner replies "1"/"approve"/etc.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.bot import compose, sender
from app.brief.generate import build_brief
from app.extraction.llm import LLMClient
from app.models import Decision, DecisionState, OwnerBrief, User, UserRole


@dataclass
class DeliveryResult:
    """Outcome of delivering a brief.

    ``brief_id`` is the persisted/refreshed OwnerBrief; ``reply_map`` the
    number→decision_id map stored on it; ``sent`` the send result; ``to`` the
    owner chat the brief went to (``None`` if no owner could be resolved).
    """

    brief_id: UUID
    reply_map: dict[str, str] = field(default_factory=dict)
    sent: sender.SendResult | None = None
    to: str | None = None


async def _owner(session: AsyncSession, company_id: UUID) -> User | None:
    stmt = (
        select(User)
        .where(User.company_id == company_id, User.role == UserRole.owner)
        .order_by(User.created_at)
    )
    return (await session.execute(stmt)).scalars().first()


async def _open_decisions(session: AsyncSession, company_id: UUID) -> list[Decision]:
    """Owner-actionable open decisions, oldest first (stable numbering)."""
    open_states = (DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated)
    stmt = (
        select(Decision)
        .where(Decision.company_id == company_id, Decision.state.in_(open_states))
        .order_by(Decision.created_at)
    )
    return list((await session.execute(stmt)).scalars().all())


async def deliver_brief(
    session: AsyncSession,
    company_id: UUID,
    brief_date: date,
    *,
    llm: LLMClient | None = None,
) -> DeliveryResult:
    """Build, send, and persist the morning brief for one company/day."""
    built = await build_brief(session, company_id, brief_date, llm=llm)
    brief_id = built["brief_id"]
    brief_text = built["text"]

    decisions = await _open_decisions(session, company_id)
    render = compose.compose_brief(
        brief_text,
        [{"id": d.id, "title": d.title} for d in decisions],
    )

    owner = await _owner(session, company_id)
    to = owner.phone if owner else None

    sent = None
    if to is not None:
        sent = await sender.send(
            to, text=render.text, dm=True,
            idempotency_key=f"brief:{brief_id}",
        )

    # Persist the reply context into owner_briefs.payload (no new table).
    brief = await session.get(OwnerBrief, brief_id)
    if brief is not None:
        payload = dict(brief.payload or {})
        payload["reply_map"] = render.reply_map
        payload["delivered_text"] = render.text
        brief.payload = payload
        flag_modified(brief, "payload")
        if sent is not None and sent.ok:
            brief.sent_at = datetime.now(UTC)
        await session.commit()

    return DeliveryResult(brief_id=brief_id, reply_map=render.reply_map, sent=sent, to=to)
