"""Metrics API — owner-only endpoints for kill-criteria snapshots.

GET /api/v1/metrics/chat-bet  → most recent weekly snapshots for the caller's company.
The rollup job (app/metrics/rollup.py) persists rows; this endpoint reads them.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import UserRole
from app.models.bet_metrics import BetMetricsWeekly
from app.models.user import User

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])

_DEFAULT_LIMIT = 12  # ~3 months of weekly snapshots


class BetMetricsOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    week_start: date
    payload: dict
    computed_at: str


@router.get("/chat-bet", response_model=list[BetMetricsOut])
async def list_chat_bet_metrics(
    limit: int = _DEFAULT_LIMIT,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BetMetricsOut]:
    """Return the most recent weekly kill-criteria snapshots for the caller's company.

    Owner-only — returns 403 for any other role.
    Returns an empty list if no snapshots have been persisted yet.
    """
    if user.role is not UserRole.owner:
        raise AppError(403, "forbidden", "Owner access required")

    rows = (
        await session.execute(
            select(BetMetricsWeekly)
            .where(BetMetricsWeekly.company_id == user.company_id)
            .order_by(BetMetricsWeekly.week_start.desc())
            .limit(limit)
        )
    ).scalars().all()

    return [
        BetMetricsOut(
            id=r.id,
            week_start=r.week_start,
            payload=r.payload,
            computed_at=r.computed_at.isoformat(),
        )
        for r in rows
    ]
