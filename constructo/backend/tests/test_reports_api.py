"""API tests for /api/v1/reports — E3 TDD.

Three tests:
  1. owner can generate the DPR-pack PDF and an audit row is written
  2. a supervisor is forbidden from the progress PDF
  3. cross-company site_id is rejected for the DPR-pack PDF (scope guard)
"""
from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.contracts.events import EventType
from app.models import (
    Dpr,
    DprStatus,
    ReportExport,
    SiteEventModel,
    UserRole,
)

DAY = date(2026, 6, 10)
DAY_STR = DAY.isoformat()
DATE_FROM = "2026-06-01"
DATE_TO = "2026-06-10"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _tok(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _add_attendance(session, site_id):
    session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site_id,
            event_type=EventType.attendance.value,
            occurred_on=DAY,
            summary="12 workers",
            fields={"headcount": 12},
            confidence=0.9,
            needs_clarification=False,
            source_message_ids=[uuid4()],
        )
    )
    await session.flush()


async def _seed_dpr(session, site):
    """Seed a minimal stored DPR so build_dpr_pack uses the fast path.

    The sections shape must match what draft_dpr() produces so the dpr_pack.html
    template renders without TypeError — in particular, work_done and blockers
    need an 'items' list (not a 'notes' string), and materials needs 'deliveries'.
    """
    dpr = Dpr(
        site_id=site.id,
        report_date=DAY,  # date object
        sections={
            "labor": {"headcount": 12},
            "materials": {"deliveries": []},
            "work_done": {"items": []},
            "blockers": {"items": []},
            "next": {"items": []},
            "summary": "Test DPR summary.",
        },
        status=DprStatus.draft,
        evidence_event_ids=[],
    )
    session.add(dpr)
    await session.flush()
    return dpr


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def setup(factory, db_session):
    company = await factory.company(name="Test Builders")
    owner = await factory.user(company=company, role=UserRole.owner, name="Owner")
    accountant = await factory.user(company=company, role=UserRole.accountant, name="Accountant")
    supervisor = await factory.user(company=company, role=UserRole.supervisor, name="Sup")
    site = await factory.site(company, name="Site A")
    await _add_attendance(db_session, site.id)
    await _seed_dpr(db_session, site)
    await db_session.flush()
    return company, owner, accountant, supervisor, site


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------


async def test_dpr_pdf_owner_ok_and_audited(client, setup, db_session):
    """owner can generate the DPR-pack PDF; an audit row is written."""
    _, owner, _, _, site = setup
    r = await client.get(
        f"/api/v1/reports/dpr.pdf?site_id={site.id}&date={DAY_STR}",
        headers=_tok(owner),
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"

    # Audit row must exist in the same session (savepoint transaction)
    rows = (await db_session.execute(select(ReportExport))).scalars().all()
    assert any(x.report_kind == "dpr_pack" and x.fmt == "pdf" for x in rows)


async def test_progress_pdf_forbidden_for_supervisor(client, setup):
    """supervisor (not owner/accountant) is forbidden from the progress PDF."""
    _, _, _, supervisor, site = setup
    r = await client.get(
        f"/api/v1/reports/progress.pdf?site_id={site.id}&date_from={DATE_FROM}&date_to={DATE_TO}",
        headers=_tok(supervisor),
    )
    assert r.status_code == 403


async def test_dpr_pdf_cross_company_site_rejected(client, setup, factory, db_session):
    """A user requesting dpr.pdf for a site in a different company is rejected (403/404)."""
    _, owner, _, _, _ = setup
    # Create a second company with its own site
    other_company = await factory.company(name="Other Co")
    other_site = await factory.site(other_company, name="Foreign Site")
    await db_session.flush()

    r = await client.get(
        f"/api/v1/reports/dpr.pdf?site_id={other_site.id}&date={DAY_STR}",
        headers=_tok(owner),
    )
    assert r.status_code in (403, 404)
