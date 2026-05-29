"""Owner Morning Brief endpoints.

- ``POST /api/v1/briefs/run`` (owner/pm): build + persist a brief for the
  caller's company on the given (or yesterday's) date; returns the payload,
  text, and stored brief id.
- ``GET /api/v1/briefs?date=YYYY-MM-DD`` (any authed user): list stored briefs
  for the caller's company, optionally filtered by date, cursor-paginated.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.brief.generate import build_brief
from app.common.errors import AppError
from app.common.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    Page,
    decode_cursor,
    encode_cursor,
)
from app.db import get_session
from app.models import OwnerBrief, User, UserRole

router = APIRouter(prefix="/api/v1", tags=["briefs"])


class BriefRunIn(BaseModel):
    # Optional: defaults to the authenticated user's own company. An owner/PM
    # running their own brief shouldn't need to know/send their company id.
    company_id: UUID | None = None
    brief_date: dt.date | None = Field(default=None, alias="date")

    model_config = {"populate_by_name": True}


class BriefRunOut(BaseModel):
    payload: dict
    text: str
    brief_id: UUID


class BriefOut(BaseModel):
    brief_id: UUID
    company_id: UUID
    brief_date: dt.date
    payload: dict
    text: str
    sent_at: dt.datetime | None = None


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


@router.post("/briefs/run", response_model=BriefRunOut)
async def run_brief(
    body: BriefRunIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> BriefRunOut:
    if body.company_id is not None and body.company_id != user.company_id:
        raise AppError(403, "forbidden", "Cannot run a brief for another company")

    brief_date = body.brief_date or (
        dt.datetime.now(dt.UTC).date() - dt.timedelta(days=1)
    )
    result = await build_brief(session, user.company_id, brief_date, llm=None)
    return BriefRunOut(
        payload=result["payload"], text=result["text"], brief_id=result["brief_id"]
    )


@router.get("/briefs", response_model=Page[BriefOut])
async def list_briefs(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    date: dt.date | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[BriefOut]:
    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = (
        select(OwnerBrief)
        .where(OwnerBrief.company_id == user.company_id)
        .order_by(OwnerBrief.id)
    )
    if date is not None:
        stmt = stmt.where(OwnerBrief.brief_date == date)
    if after is not None:
        stmt = stmt.where(OwnerBrief.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[BriefOut](items=[_brief_out(b) for b in rows], next_cursor=next_cursor)


def _brief_out(b: OwnerBrief) -> BriefOut:
    payload = dict(b.payload or {})
    text = payload.pop("text", "")
    return BriefOut(
        brief_id=b.id,
        company_id=b.company_id,
        brief_date=b.brief_date,
        payload=payload,
        text=text,
        sent_at=b.sent_at,
    )
