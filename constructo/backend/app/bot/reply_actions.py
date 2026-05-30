"""Apply a brief reply to the decision ledger — the WhatsApp ↔ app handoff.

When the owner replies to the morning brief in WhatsApp ("1", "approve",
"hold 2", "show proof 3"), :func:`apply_brief_reply`:

  1. finds the latest :class:`OwnerBrief` for that chat's company that carries a
     ``reply_map`` (number → decision_id),
  2. maps the reply text to a (verb, decision_id) via
     :func:`app.bot.compose.resolve_reply_target`,
  3. applies the action to the :class:`Decision` through the shared, idempotent
     :func:`app.approvals.service.apply_action` (so a WhatsApp reply and a
     dashboard tap converge on ONE ledger row), and
  4. sends a short Hinglish confirmation back via :mod:`app.bot.sender`.

Idempotent end-to-end: replying "approve" twice resolves once and confirms
politely the second time. "show proof N" reads evidence, never mutates state.
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.service import apply_action
from app.approvals.state_machine import DecisionAction
from app.bot import compose, sender
from app.models import (
    Decision,
    DecisionState,
    OwnerBrief,
    SiteEventModel,
    WhatsappGroup,
)

# Canonical reply verb → ledger action.
_VERB_TO_ACTION = {
    "approve": DecisionAction.resolve,
    "hold": DecisionAction.reject,  # "hold" parks/blocks the item: reject in the ledger
    "reject": DecisionAction.reject,
}


@dataclass
class ReplyActionResult:
    """Outcome of applying a brief reply.

    ``handled`` is False when the reply could not be mapped to a decision (we
    stay quiet rather than guess). ``verb`` is the resolved action,
    ``decision_id`` the affected row, ``state`` its resulting state,
    ``already`` whether it was an idempotent no-op, and ``sent`` the
    confirmation send result.
    """

    handled: bool
    verb: str | None = None
    decision_id: UUID | None = None
    state: str | None = None
    already: bool = False
    sent: sender.SendResult | None = None


async def _company_for_chat(session: AsyncSession, chat_jid: str) -> UUID | None:
    stmt = select(WhatsappGroup).where(WhatsappGroup.external_group_id == chat_jid)
    group = (await session.execute(stmt)).scalars().first()
    return group.company_id if group else None


async def _latest_brief(session: AsyncSession, company_id: UUID) -> OwnerBrief | None:
    stmt = (
        select(OwnerBrief)
        .where(OwnerBrief.company_id == company_id)
        .order_by(OwnerBrief.brief_date.desc(), OwnerBrief.sent_at.desc())
    )
    for brief in (await session.execute(stmt)).scalars().all():
        if (brief.payload or {}).get("reply_map"):
            return brief
    return None


async def _evidence_lines(session: AsyncSession, decision: Decision) -> list[str]:
    """Human-readable evidence for a 'show proof N' request."""
    lines: list[str] = []
    ids = list(decision.evidence_event_ids or [])
    if not ids:
        return lines
    rows = (
        (
            await session.execute(
                select(SiteEventModel).where(SiteEventModel.id.in_(ids))
            )
        )
        .scalars()
        .all()
    )
    for ev in rows:
        when = ev.occurred_on.isoformat() if ev.occurred_on else "—"
        lines.append(f"{ev.summary} ({when})")
    return lines


async def apply_brief_reply(
    session: AsyncSession,
    chat_jid: str,
    text: str,
    *,
    owner_chat: str | None = None,
) -> ReplyActionResult:
    """Map a brief reply to the pending decision and act on it idempotently.

    ``chat_jid`` is the WhatsApp chat the reply came from; ``owner_chat`` is
    where the confirmation is sent (defaults to ``chat_jid`` — the brief is
    delivered to the owner's chat, so replies and confirmations share it).
    """
    confirm_to = owner_chat or chat_jid

    company_id = await _company_for_chat(session, chat_jid)
    if company_id is None:
        return ReplyActionResult(handled=False)

    brief = await _latest_brief(session, company_id)
    if brief is None:
        return ReplyActionResult(handled=False)

    reply_map: dict[str, str] = (brief.payload or {}).get("reply_map", {})
    target = compose.resolve_reply_target(text, reply_map)
    if target is None:
        return ReplyActionResult(handled=False)

    verb, decision_id = target
    decision = await session.get(Decision, decision_id)
    if decision is None or decision.company_id != company_id:
        return ReplyActionResult(handled=False)

    # ---- "show proof N": read-only evidence -------------------------------
    if verb == "proof":
        lines = await _evidence_lines(session, decision)
        msg = compose.compose_proof(decision.title, lines)
        sent = await sender.send(
            confirm_to, text=msg, dm=True,
            idempotency_key=f"proof:{decision_id}:{chat_jid}",
        )
        return ReplyActionResult(
            handled=True, verb="proof", decision_id=decision_id,
            state=decision.state.value, sent=sent,
        )

    # ---- approve / hold / reject: mutate the one ledger -------------------
    action = _VERB_TO_ACTION[verb]
    was_state = decision.state
    updated = await apply_action(session, decision, action)
    # Idempotent no-op if state didn't change toward the target.
    already = was_state == updated.state and was_state in (
        DecisionState.resolved, DecisionState.rejected,
    )
    confirmation = compose.compose_confirmation(verb, decision.title, already=already)
    sent = await sender.send(
        confirm_to, text=confirmation, dm=True,
        idempotency_key=f"confirm:{decision_id}:{updated.state.value}:{chat_jid}",
    )
    return ReplyActionResult(
        handled=True, verb=verb, decision_id=decision_id,
        state=updated.state.value, already=already, sent=sent,
    )
