"""Orchestrate one inbound WhatsApp message end-to-end.

:func:`handle_inbound` is the single entrypoint W3 wires the bridge's inbound
webhook to. It:

  1. loads the :class:`RawMessageModel`,
  2. resolves chat → site via :class:`WhatsappGroup`,
  3. classifies the intent (LLM + fast-paths),
  4. composes Nivaan's reply (Guest Rule),
  5. for queries/clarifications, runs a scoped ledger lookup and sends a reply;
     for brief replies, delegates to :mod:`app.bot.reply_actions`;
     for routine captures, reacts ✅ (or stays silent) — never narrates.

It returns a :class:`HandleResult` describing what it did (for tests + the
integration wiring). Sensitive content defaults to a DM to the owner.

Search note: queries use a deterministic, scoped ledger lookup over
``site_events`` (keyword/event-type filter from :func:`app.search.query.parse_query`),
NOT the pgvector path — so the bot stays network-free in tests and only ever
answers from the chat's own site (the bot has no logged-in user to scope by).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot import compose, reply_actions, sender
from app.bot.compose import Reply, ReplyKind
from app.bot.intents import Intent, IntentResult, classify
from app.extraction.llm import LLMClient
from app.models import (
    OwnerBrief,
    RawMessageModel,
    Site,
    SiteEventModel,
    User,
    UserRole,
    WhatsappGroup,
)
from app.search.query import parse_query


@dataclass
class HandleResult:
    """What the handler decided/did — the contract tests and W3 assert on.

    ``action`` is one of: ``silent`` | ``reaction`` | ``reply`` | ``dm`` |
    ``brief_reply``. ``sent`` is the :class:`app.bot.sender.SendResult` when a
    message went out (``None`` for a pure silent/capture). ``intent`` carries the
    classified intent. ``meta`` holds extras (resolved site id, etc.).
    """

    action: str
    intent: Intent
    sent: sender.SendResult | None = None
    site_id: UUID | None = None
    meta: dict[str, Any] = field(default_factory=dict)


async def _resolve_group(session: AsyncSession, msg: RawMessageModel) -> WhatsappGroup | None:
    stmt = select(WhatsappGroup).where(
        WhatsappGroup.external_group_id == msg.external_group_id,
        WhatsappGroup.source == msg.source,
    )
    return (await session.execute(stmt)).scalars().first()


async def _owner_chat(session: AsyncSession, company_id: UUID) -> str | None:
    """The owner's WhatsApp destination for DMs (their phone)."""
    stmt = (
        select(User)
        .where(User.company_id == company_id, User.role == UserRole.owner)
        .order_by(User.created_at)
    )
    owner = (await session.execute(stmt)).scalars().first()
    return owner.phone if owner else None


async def _latest_brief_with_replies(
    session: AsyncSession, company_id: UUID
) -> OwnerBrief | None:
    """The most recent brief for the company that has a reply_map."""
    stmt = (
        select(OwnerBrief)
        .where(OwnerBrief.company_id == company_id)
        .order_by(OwnerBrief.brief_date.desc(), OwnerBrief.sent_at.desc())
    )
    for brief in (await session.execute(stmt)).scalars().all():
        if (brief.payload or {}).get("reply_map"):
            return brief
    return None


async def _scoped_events(
    session: AsyncSession,
    site_id: UUID,
    query_text: str,
) -> list[dict[str, Any]]:
    """Deterministic, scoped ledger lookup for a query (no vectors).

    Filters the chat's site events by the event type the query parser lifts (if
    any), newest first. Each result is the plain dict the composer expects.
    """
    parsed = parse_query(query_text)
    stmt = select(SiteEventModel, Site.name).join(Site, Site.id == SiteEventModel.site_id).where(
        SiteEventModel.site_id == site_id
    )
    if parsed.event_type is not None:
        stmt = stmt.where(SiteEventModel.event_type == parsed.event_type.value)
    if parsed.date_from is not None:
        stmt = stmt.where(SiteEventModel.occurred_on >= parsed.date_from)
    if parsed.date_to is not None:
        stmt = stmt.where(SiteEventModel.occurred_on <= parsed.date_to)
    stmt = stmt.order_by(
        SiteEventModel.occurred_on.desc(), SiteEventModel.created_at.desc()
    ).limit(5)

    rows = (await session.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for event, site_name in rows:
        out.append(
            {
                "summary": event.summary,
                "site_name": site_name,
                "occurred_on": event.occurred_on,
                "event_type": event.event_type,
            }
        )
    return out


async def _execute(
    reply: Reply,
    *,
    group_chat: str,
    owner_chat: str | None,
    reply_to: str | None,
    idempotency_key: str | None,
) -> tuple[str, sender.SendResult | None]:
    """Run a composed :class:`Reply` through the sender. Returns (action, result)."""
    if reply.kind is ReplyKind.silent:
        return "silent", None
    if reply.kind is ReplyKind.reaction:
        result = await sender.send(
            group_chat, react_to=reply_to, idempotency_key=idempotency_key
        )
        return "reaction", result
    if reply.kind is ReplyKind.dm:
        # Sensitive: DM the owner; never the group. If no owner chat, stay silent.
        if not owner_chat:
            return "silent", None
        result = await sender.send(
            owner_chat, text=reply.text, dm=True, idempotency_key=idempotency_key
        )
        return "dm", result
    # text → reply in the group
    result = await sender.send(
        group_chat, text=reply.text, reply_to=reply_to, idempotency_key=idempotency_key
    )
    return "reply", result


async def handle_inbound(
    session: AsyncSession,
    raw_message_id: UUID,
    *,
    llm: LLMClient | None = None,
    today: date | None = None,
) -> HandleResult:
    """Handle one inbound message: resolve, classify, compose, (maybe) send.

    Returns a :class:`HandleResult`. Honours the Guest Rule: routine captures get
    a ✅ reaction (or silence); only genuine queries / warranted clarifications
    speak; sensitive content goes to a DM.
    """
    msg = await session.get(RawMessageModel, raw_message_id)
    if msg is None:
        return HandleResult(action="silent", intent=Intent.capture, meta={"error": "no_message"})

    group = await _resolve_group(session, msg)
    group_chat = msg.external_group_id
    site_id = group.site_id if group else None
    company_id = group.company_id if group else None
    owner_chat = await _owner_chat(session, company_id) if company_id else None

    brief = await _latest_brief_with_replies(session, company_id) if company_id else None
    reply_map: dict[str, str] = (brief.payload or {}).get("reply_map", {}) if brief else {}

    # Idempotency: one outbound per inbound message (keyed by message id).
    idem = f"inbound:{raw_message_id}"

    ir: IntentResult = await classify(
        msg.text or "",
        brief_pending=bool(reply_map),
        clarification_pending=False,
        llm=llm,
    )

    # ---- brief reply: hand off to the one-ledger reply action --------------
    if ir.intent is Intent.brief_reply and reply_map:
        action_res = await reply_actions.apply_brief_reply(
            session, group_chat, msg.text or "", owner_chat=owner_chat
        )
        return HandleResult(
            action="brief_reply",
            intent=ir.intent,
            sent=action_res.sent,
            site_id=site_id,
            meta={"reply": action_res.__dict__},
        )

    # ---- help --------------------------------------------------------------
    if ir.intent is Intent.help:
        result = await sender.send(
            group_chat, text=compose.compose_help(), idempotency_key=idem
        )
        return HandleResult(action="reply", intent=ir.intent, sent=result, site_id=site_id)

    # ---- query -------------------------------------------------------------
    if ir.intent is Intent.query:
        hits: list[dict[str, Any]] = []
        if site_id is not None:
            hits = await _scoped_events(session, site_id, msg.text or "")
        reply = compose.compose_query_answer(
            msg.text or "", hits, answerable=bool(hits)
        )
        action, result = await _execute(
            reply,
            group_chat=group_chat,
            owner_chat=owner_chat,
            reply_to=str(raw_message_id),
            idempotency_key=idem,
        )
        return HandleResult(
            action=action, intent=ir.intent, sent=result, site_id=site_id,
            meta={"hits": len(hits)},
        )

    # ---- clarification answer (no clarification was actually pending here) --
    # Treated as capture: acknowledge and let extraction handle it.
    # ---- capture (default) -------------------------------------------------
    reply = compose.compose_capture(msg.text or "", confidence=ir.confidence)
    action, result = await _execute(
        reply,
        group_chat=group_chat,
        owner_chat=owner_chat,
        reply_to=str(raw_message_id),
        idempotency_key=idem,
    )
    return HandleResult(
        action=action, intent=ir.intent, sent=result, site_id=site_id,
        meta={"confidence": ir.confidence},
    )


__all__ = ["handle_inbound", "HandleResult"]
