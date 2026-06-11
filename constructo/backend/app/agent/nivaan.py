"""Nivaan in-thread: the constrained agent (design §C.2).

Invocation is explicit only (@nivaan / /nivaan / a card button). The answer path
reuses run_turn (deterministic reducers first, grounded RAG fallback, abstain-
over-invent) and adds the output numeric guard on LLM-authored text. The proposal
path (build_proposal, Task 5/6) emits a draft card a HUMAN commits — Nivaan never
commits, never moves money without bound evidence, never reaches the homeowner."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.loop import run_turn
from app.agent.nivaan_guard import numbers_are_grounded
from app.agent.tiers import MONEY_CAPTURE_TYPES, Proposal, propose_capture
from app.extraction.llm import LLMClient
from app.models import (
    AgentResultKind,
    AgentTurn,
    ChatMessage,
    Conversation,
    SiteEventModel,
    User,
)

_MENTION = re.compile(r"^\s*[@/]nivaan\b[:,]?\s*", re.IGNORECASE)


def parse_nivaan_invocation(body: str | None) -> str | None:
    """Return the utterance with the leading @nivaan/ /nivaan mention stripped,
    or None when the message does not summon Nivaan. Explicit-invocation only —
    Nivaan never speaks unprompted."""
    if not body:
        return None
    if not _MENTION.match(body):
        return None
    return _MENTION.sub("", body).strip()


@dataclass
class NivaanReply:
    """What Nivaan says. The chat layer persists this as a sender_kind=nivaan row."""

    body: str
    meta: dict | None = field(default=None)


def _has_digit(text: str) -> bool:
    return any(ch.isdigit() for ch in text)


async def _evidence_texts(session: AsyncSession, ids: list[str]) -> list[str]:
    """Numeric-bearing text for the evidence the grounded answer cited (events +
    messages; grounded evidence_event_ids mixes both)."""
    uuids: list[UUID] = []
    for i in ids:
        try:
            uuids.append(UUID(i))
        except ValueError:
            continue
    if not uuids:
        return []
    texts: list[str] = []
    events = (
        await session.execute(select(SiteEventModel).where(SiteEventModel.id.in_(uuids)))
    ).scalars().all()
    for e in events:
        texts.append(e.summary or "")
        texts.append(str(e.occurred_on))  # the LLM's grounded context includes occurred_on
        texts.append(" ".join(str(v) for v in (e.fields or {}).values()))
    msgs = (
        await session.execute(select(ChatMessage).where(ChatMessage.id.in_(uuids)))
    ).scalars().all()
    for m in msgs:
        texts.append(m.body or "")
    return texts


async def run_nivaan_turn(
    session: AsyncSession,
    user: User,
    conv: Conversation,
    utterance: str,
    *,
    llm: LLMClient | None = None,
) -> NivaanReply:
    """One constrained answer turn, scoped to the conversation's site. Reuses
    run_turn (which audits + enforces scope); guards LLM-authored numbers."""
    result = await run_turn(session, user, utterance, site_id=conv.site_id, llm=llm)
    text = result.text

    # Numeric guard: an LLM-authored answer may never introduce an ungrounded
    # digit. Deterministic (aggregate) answers are safe by construction.
    # Guard ANY LLM-authored answer. Only deterministic tools are safe by
    # construction: "aggregate" numbers come from reducers, "none" is a
    # digit-free clarify. Every other tool (now or future) must be guarded.
    if result.tool not in ("aggregate", "none") and _has_digit(text):
        allowed = await _evidence_texts(session, result.evidence_event_ids)
        if not numbers_are_grounded(text, allowed):
            # downgrade the answer to a clarify — never serve an unverifiable number
            return NivaanReply(
                body=(
                    "I can't verify those numbers from the site record — "
                    "please check with your team."
                ),
                meta={"nivaan": {"kind": "clarify", "tool": "guard_blocked"}},
            )

    return NivaanReply(
        body=text,
        meta={
            "nivaan": {
                "kind": result.kind.value,
                "tool": result.tool,
                "evidence_event_ids": result.evidence_event_ids,
            }
        },
    )


@dataclass
class ProposalRequest:
    """A card-button / slash request asking Nivaan to DRAFT (not commit) a card."""

    capture_type: str
    fields: dict


def _draft_summary(capture_type: str, fields: dict) -> str:
    """A deterministic, human-readable draft line built from the fields — numbers
    come straight from `fields`, so the guard always passes by construction."""
    qty = fields.get("quantity")
    unit = fields.get("unit", "")
    material = fields.get("material", capture_type.replace("_", " "))
    vendor = fields.get("vendor")
    amount = fields.get("amount")
    if amount is not None:
        head = f"₹{amount}"
        if vendor:
            head += f" to {vendor}"
    elif qty is not None:
        head = f"{qty} {unit} {material}".strip()
        if vendor:
            head += f" from {vendor}"
    else:
        head = material
    return f"{head} — confirm to log it?"


async def _log_proposal_turn(
    session: AsyncSession, user: User, conv: Conversation, summary: str
) -> None:
    """One audit row per proposal (mirrors run_turn's AgentTurn discipline)."""
    session.add(
        AgentTurn(
            company_id=user.company_id, actor_id=user.id, site_id=conv.site_id,
            utterance=summary[:2000], result_kind=AgentResultKind.cards,
            tool="propose", model="deterministic", token_cost=0,
        )
    )
    await session.commit()


async def build_proposal(
    session: AsyncSession, user: User, conv: Conversation, req: ProposalRequest
) -> NivaanReply:
    """Draft a card a human commits. Non-money → a commit-tier capture proposal.
    Money (Task 6) → evidence-bound or missing_proof. The agent never commits."""
    summary = _draft_summary(req.capture_type, req.fields)
    # Guard the drafted line against the field values (defense-in-depth; the
    # deterministic _draft_summary is grounded by construction).
    source = [str(v) for v in req.fields.values()]
    if _has_digit(summary) and not numbers_are_grounded(summary, source):
        summary = "Confirm to log this?"  # strip ungrounded digits, never invent

    proposal: Proposal
    if req.capture_type in MONEY_CAPTURE_TYPES:
        proposal = await _build_money_proposal(session, user, conv, req, summary)  # Task 6
    else:
        proposal = propose_capture(req.capture_type, req.fields, summary)

    await _log_proposal_turn(session, user, conv, summary)
    return NivaanReply(body=proposal.summary, meta=proposal.as_meta())


async def _build_money_proposal(
    session: AsyncSession, user: User, conv: Conversation, req: ProposalRequest, summary: str
) -> Proposal:
    """Money tier (filled in Task 6). Minimal: no evidence yet → missing_proof."""
    from app.agent.tiers import propose_money

    return propose_money(req.capture_type, req.fields, summary, evidence=[])
