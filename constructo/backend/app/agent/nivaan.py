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
from app.extraction.llm import LLMClient
from app.models import ChatMessage, Conversation, SiteEventModel, User

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
        except (ValueError, AttributeError):
            continue
    if not uuids:
        return []
    texts: list[str] = []
    events = (
        await session.execute(select(SiteEventModel).where(SiteEventModel.id.in_(uuids)))
    ).scalars().all()
    for e in events:
        texts.append(e.summary or "")
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
    if result.tool == "grounded_qa" and _has_digit(text):
        allowed = await _evidence_texts(session, result.evidence_event_ids)
        if not numbers_are_grounded(text, allowed):
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
