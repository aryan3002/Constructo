"""Thin bot endpoints (testing + W3 integration).

These are intentionally minimal seams over the bot brain so the bridge (W1) /
integration (W3) and tests can drive the same code paths the production wiring
would:

  * ``POST /api/v1/bot/handle``        {raw_message_id}            → handle one inbound
  * ``POST /api/v1/bot/deliver-brief`` {company_id, date?}         → deliver a brief
  * ``POST /api/v1/bot/reply``         {chat_jid, text}            → apply a brief reply

Auth: gated behind the existing bearer dependency (:func:`app.auth.deps.get_current_user`)
so they aren't open. The bridge calls these server-to-server with a service token.
"""
from __future__ import annotations

import datetime as dt
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.bot import brief_delivery, handle, reply_actions
from app.db import get_session
from app.models import User

router = APIRouter(prefix="/api/v1/bot", tags=["bot"])


class HandleIn(BaseModel):
    raw_message_id: UUID


class HandleOut(BaseModel):
    action: str
    intent: str
    site_id: UUID | None = None
    sent: dict[str, Any] | None = None


class DeliverBriefIn(BaseModel):
    company_id: UUID | None = None
    brief_date: dt.date | None = Field(default=None, alias="date")

    model_config = {"populate_by_name": True}


class DeliverBriefOut(BaseModel):
    brief_id: UUID
    reply_map: dict[str, str]
    to: str | None = None
    sent_ok: bool = False


class ReplyIn(BaseModel):
    chat_jid: str
    text: str


class ReplyOut(BaseModel):
    handled: bool
    verb: str | None = None
    decision_id: UUID | None = None
    state: str | None = None
    already: bool = False


def _send_summary(result: Any) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "ok": result.ok,
        "transport": result.transport,
        "kind": result.kind,
        "to": result.to,
        "dm": result.dm,
        "message_id": result.message_id,
    }


@router.post("/handle", response_model=HandleOut)
async def handle_message(
    body: HandleIn,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> HandleOut:
    result = await handle.handle_inbound(session, body.raw_message_id)
    return HandleOut(
        action=result.action,
        intent=result.intent.value,
        site_id=result.site_id,
        sent=_send_summary(result.sent),
    )


@router.post("/deliver-brief", response_model=DeliverBriefOut)
async def deliver_brief_endpoint(
    body: DeliverBriefIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DeliverBriefOut:
    company_id = body.company_id or user.company_id
    brief_date = body.brief_date or (dt.datetime.now(dt.UTC).date() - dt.timedelta(days=1))
    result = await brief_delivery.deliver_brief(session, company_id, brief_date)
    return DeliverBriefOut(
        brief_id=result.brief_id,
        reply_map=result.reply_map,
        to=result.to,
        sent_ok=bool(result.sent and result.sent.ok),
    )


@router.post("/reply", response_model=ReplyOut)
async def reply_endpoint(
    body: ReplyIn,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ReplyOut:
    result = await reply_actions.apply_brief_reply(session, body.chat_jid, body.text)
    return ReplyOut(
        handled=result.handled,
        verb=result.verb,
        decision_id=result.decision_id,
        state=result.state,
        already=result.already,
    )
