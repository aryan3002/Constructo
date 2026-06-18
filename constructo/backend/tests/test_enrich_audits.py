"""Audit-enrichment pass (scripts.enrich_audits).

Seeds the imported company/site + a few ``issue``/``progress_update`` SiteEvents
spread across two distinct month-windows, injects a network-free FakeLLM whose
canned result yields one audit's section/finding structure per call, and asserts:
  * one Audit is created per active window (2 windows -> 2 audits), each with at
    least one AuditSection and AuditFinding grounded in the real events,
  * section/audit scores are computed (deterministic, not from the LLM),
  * a second run() creates no duplicates (uuid5 idempotency), and
  * a site with no issue/progress signal yields zero audits.
"""
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_audits as ea
from app.extraction.llm import FakeLLMClient
from app.models import (
    Audit,
    AuditFinding,
    AuditSection,
    AuditStatus,
    Company,
    FindingSeverity,
    Site,
    SiteEventModel,
)

# Canned structure every complete() call returns: one section with mixed item
# statuses + one finding. The script grounds titles in the real events; this
# fixes the SHAPE (so scoring + row creation are exercised deterministically).
_CANNED = {
    "title": "Structural & finishing review",
    "sections": [
        {
            "name": "Plaster & finishing",
            "items": [
                {"label": "Master bedroom plaster", "status": "ok"},
                {"label": "Hairline crack on beam", "status": "fail"},
                {"label": "Surface evenness", "status": "obs"},
            ],
        }
    ],
    "findings": [
        {
            "title": "Hairline crack on the living-room beam",
            "severity": "major",
            "room": "Living Room",
            "note": "Re-check the beam shuttering before the next pour.",
        }
    ],
}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    """Force run() onto a canned, network-free FakeLLM (no Azure)."""
    monkeypatch.setattr(
        ea, "get_llm_client", lambda tier="smart": FakeLLMClient(canned=_CANNED)
    )


async def _event(db_session, site_id, *, etype, day, summary):
    db_session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site_id,
            event_type=etype,
            occurred_on=day,
            summary=summary,
            fields={},
            confidence=0.8,
        )
    )


async def _seed(db_session, *, with_events: bool = True) -> Site:
    """Imported company + site (+ optional issue/progress events in 2 windows)."""
    company = Company(id=ea._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ea._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    if with_events:
        # Window 1 (Feb): an issue + a progress update.
        await _event(
            db_session, site.id, etype="issue", day=date(2026, 2, 8),
            summary="Crack noticed on the living-room beam.",
        )
        await _event(
            db_session, site.id, etype="progress_update", day=date(2026, 2, 20),
            summary="Master bedroom plaster completed.",
        )
        # Window 2 (Apr): another issue.
        await _event(
            db_session, site.id, etype="issue", day=date(2026, 4, 3),
            summary="Water seepage near the servant bathroom.",
        )
        # Noise that must NOT spawn an audit on its own.
        await _event(
            db_session, site.id, etype="payment_request", day=date(2026, 4, 5),
            summary="Advance payment requested.",
        )
    await db_session.flush()
    return site


async def test_enrich_audits_creates_audits_with_sections_and_findings(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await ea.run(session_factory=sf)

    assert counts["audits"] == 2
    assert counts["sections"] >= 2
    assert counts["findings"] >= 2

    audits = (
        await db_session.execute(select(Audit).where(Audit.site_id == site.id))
    ).scalars().all()
    assert len(audits) == 2
    # All scoped to the imported company + completed with a deterministic score.
    assert all(a.company_id == ea._id("company") for a in audits)
    assert all(a.status == AuditStatus.completed for a in audits)
    assert all(a.score is not None for a in audits)

    # Sections carry deterministic pass/obs/fail counts + a score (NOT the LLM's).
    sections = (
        await db_session.execute(
            select(AuditSection).where(
                AuditSection.audit_id.in_([a.id for a in audits])
            )
        )
    ).scalars().all()
    assert len(sections) >= 2
    a_section = sections[0]
    # The canned section had 1 ok / 1 fail / 1 obs -> score round(100*(1+0.5)/3)=50.
    assert a_section.pass_count == 1
    assert a_section.fail_count == 1
    assert a_section.obs_count == 1
    assert a_section.score == 50

    findings = (
        await db_session.execute(
            select(AuditFinding).where(AuditFinding.site_id == site.id)
        )
    ).scalars().all()
    assert len(findings) >= 2
    assert all(f.severity == FindingSeverity.major for f in findings)
    assert all(f.note for f in findings)


async def test_enrich_audits_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await ea.run(session_factory=sf)
    second = await ea.run(session_factory=sf)  # re-run upserts the same rows

    assert second["audits"] == 2
    n_audits = (
        await db_session.execute(
            select(func.count()).select_from(Audit).where(Audit.site_id == site.id)
        )
    ).scalar()
    assert n_audits == 2  # not 4
    n_sections = (
        await db_session.execute(
            select(func.count()).select_from(AuditSection).join(
                Audit, AuditSection.audit_id == Audit.id
            ).where(Audit.site_id == site.id)
        )
    ).scalar()
    assert n_sections == 2  # not 4
    n_findings = (
        await db_session.execute(
            select(func.count()).select_from(AuditFinding).where(
                AuditFinding.site_id == site.id
            )
        )
    ).scalar()
    assert n_findings == 2  # not 4


async def test_enrich_audits_no_signal_is_zero(db_session):
    site = await _seed(db_session, with_events=False)

    counts = await ea.run(session_factory=_session_factory(db_session))

    assert counts == {"audits": 0, "sections": 0, "findings": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(Audit).where(Audit.site_id == site.id)
        )
    ).scalar()
    assert n == 0
