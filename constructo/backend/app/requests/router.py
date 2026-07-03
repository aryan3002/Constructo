"""GET /api/v1/requests — the owner/pm/architect-scoped read of homeowner
requests.

``app/homeowner/router.py``'s ``GET /requests`` is gated by ``require_homeowner``
plus homeowner-site scoping (``resolve_site``), so it 403s an OWNER token — the
web Requests view and every activity-feed request row's Reply/click were
calling it and always failing. This endpoint is the owner-side twin: same
company-scoped visibility as ``GET /api/v1/activity`` (`visible_site_ids`),
reusing the EXISTING ``RequestOut`` schema and ``_request_out`` mapper rather
than duplicating them.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.scoping import visible_site_ids
from app.db import get_session
from app.homeowner.router import _request_out
from app.homeowner.schemas import RequestOut
from app.models import HomeownerRequest, User

router = APIRouter(prefix="/api/v1", tags=["requests"])


@router.get("/requests", response_model=list[RequestOut])
async def list_requests(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[RequestOut]:
    """List homeowner requests across the caller's visible sites, newest-first.

    Company-scoped via the same ``visible_site_ids`` helper as the activity
    feed (owner/pm/architect -> every site in their company; other roles see
    nothing here — they use the homeowner-facing ``/homeowner/requests``
    instead). An optional ``?site_id=`` narrows to one site, but only if it is
    already in scope (an out-of-scope site_id yields an empty list, not a 403,
    matching the activity router's own narrowing behavior).
    """
    visible = await visible_site_ids(session, user)
    if site_id is not None:
        visible = [sid for sid in visible if sid == site_id]
    if not visible:
        return []

    rows = (
        await session.execute(
            select(HomeownerRequest)
            .where(HomeownerRequest.site_id.in_(visible))
            .order_by(HomeownerRequest.created_at.desc())
        )
    ).scalars().all()
    return [_request_out(r) for r in rows]
