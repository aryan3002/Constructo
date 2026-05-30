"""Admin / operations endpoints — manual triggers for the scheduled jobs.

These exist so an owner can run the SLA escalation sweep, the permit alert
sweep, the nightly brief, or a search backfill on demand (e.g. to verify wiring
in a fresh environment, or to recover after the scheduler was disabled). The
same callables run on a timer in :mod:`app.scheduler`.

All routes are guarded to the ``owner`` role — they are tenant-wide,
side-effecting operations, not per-user actions. Each runs the underlying
callable with its own DB session(s) so a manual trigger behaves exactly like the
scheduled job.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.db import get_session
from app.models import User, UserRole

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# All admin operations require the owner role (most privileged, tenant-wide).
_require_owner = require_role(UserRole.owner)


@router.post("/run-sla-sweep")
async def run_sla_sweep_now(
    user: User = Depends(_require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """Escalate every overdue, undecided decision across all tenants now."""
    from app.approvals.sla import run_sla_sweep

    escalated = await run_sla_sweep(session, now=datetime.now(UTC))
    return {"escalated": [str(i) for i in escalated], "count": len(escalated)}


@router.post("/run-permit-sweep")
async def run_permit_sweep_now(
    user: User = Depends(_require_owner),
) -> dict[str, object]:
    """Raise permit expiry/renewal/staleness alerts across all tenants now."""
    from app.permits.alerts import run_permit_sweep

    created = await run_permit_sweep(today=datetime.now(UTC).date())
    return {"created": [str(i) for i in created], "count": len(created)}


@router.post("/run-nightly")
async def run_nightly_now(
    user: User = Depends(_require_owner),
) -> dict[str, object]:
    """Generate the nightly brief(s) now (same callable the scheduler runs)."""
    from app.brief.schedule import run_nightly

    ids = await run_nightly()
    return {"briefs": [str(i) for i in ids], "count": len(ids)}


@router.post("/reindex")
async def reindex_now(
    user: User = Depends(_require_owner),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Backfill search embeddings for every event that is not yet indexed.

    Network-free unless real embedding-provider creds are configured (otherwise
    the FakeEmbeddings fallback is used).
    """
    from app.search.index import index_all_unindexed

    indexed = await index_all_unindexed(session)
    return {"indexed": indexed}
