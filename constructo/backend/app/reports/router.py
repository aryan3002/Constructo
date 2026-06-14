"""HTTP layer for /api/v1/reports — E3 of W5 Slice 1.

Two PDF endpoints:
  GET /api/v1/reports/dpr.pdf    — DPR pack PDF (owner/pm/accountant; site-scoped)
  GET /api/v1/reports/progress.pdf — Progress summary PDF (owner/accountant; company-scoped)

Both endpoints:
  1. Role-gate via require_role
  2. Site-scope guard (_require_site_in_scope) replicating the dpr/reconcile pattern
  3. Call the builder (builders.build_dpr_pack / builders.build_progress)
  4. Render to PDF bytes (pdf.render)
  5. Write an append-only ReportExport audit row
  6. Stream application/pdf response
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import ReportExport, Site, User, UserRole
from app.reports import builders, pdf
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# site-scope guard (mirrors app/dpr/router.py and app/reconcile/router.py)
# ---------------------------------------------------------------------------


async def _require_site_in_scope(
    session: AsyncSession,
    user: User,
    site_id: UUID,
) -> Site:
    """Raise 404 if the site does not exist; 403 if it is outside the user's scope."""
    visible = await effective_visible_site_ids(session, user)
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")
    if site_id not in visible:
        raise AppError(403, "forbidden", "Site not in scope")
    return site


# ---------------------------------------------------------------------------
# audit helper
# ---------------------------------------------------------------------------


async def _audit(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor: UUID,
    kind: str,
    fmt: str,
    scope: str,
    date_range: str,
) -> None:
    """Write one append-only ReportExport row and flush it within the request session."""
    session.add(
        ReportExport(
            company_id=company_id,
            actor_user_id=actor,
            report_kind=kind,
            fmt=fmt,
            scope=scope,
            date_range=date_range,
        )
    )
    # flush so the row is visible in the same session (tests use savepoint rollback),
    # but do not commit the outer transaction — that matches what the test fixtures
    # expect (join_transaction_mode="create_savepoint" turns commit into savepoint
    # release so reads within the same session see the row).
    await session.flush()


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------


@router.get("/dpr.pdf")
async def dpr_pdf(
    site_id: UUID,
    date: str,
    user: User = Depends(require_role(UserRole.owner, UserRole.accountant, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Generate the DPR-pack PDF for a site+date.

    Role gate: owner / accountant / pm.
    Site scope: only sites visible to the caller (effective_visible_site_ids).
    Audit: one ReportExport row per call.
    """
    await _require_site_in_scope(session, user, site_id)
    data = await builders.build_dpr_pack(session, site_id=site_id, on_date=date)
    content = pdf.render("dpr_pack.html", data)
    await _audit(
        session,
        company_id=user.company_id,
        actor=user.id,
        kind="dpr_pack",
        fmt="pdf",
        scope=str(site_id),
        date_range=date,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="dpr-{site_id}-{date}.pdf"'
        },
    )


@router.get("/progress.pdf")
async def progress_pdf(
    date_from: str,
    date_to: str,
    site_id: UUID | None = Query(default=None),
    user: User = Depends(require_role(UserRole.owner, UserRole.accountant)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Generate the progress-summary PDF for the company (optionally one site).

    Role gate: owner / accountant only.
    Site scope: if site_id is given, it must be in scope for the caller.
    Audit: one ReportExport row per call.
    """
    if site_id is not None:
        await _require_site_in_scope(session, user, site_id)
    data = await builders.build_progress(
        session,
        company_id=user.company_id,
        site_id=site_id,
        date_from=date_from,
        date_to=date_to,
    )
    content = pdf.render("progress.html", data)
    await _audit(
        session,
        company_id=user.company_id,
        actor=user.id,
        kind="progress",
        fmt="pdf",
        scope=str(site_id or "all"),
        date_range=f"{date_from}..{date_to}",
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="progress.pdf"'},
    )
