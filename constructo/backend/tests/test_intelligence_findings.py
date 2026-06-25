"""SiteFinding persistence: dedupe-on-rerun and auto-resolve. DB-backed."""
from datetime import date

from sqlalchemy import select

from app.intelligence.detectors.base import Finding
from app.intelligence.findings import dedupe_key, persist_findings
from app.models import SiteFinding

D1 = date(2026, 6, 25)
D2 = date(2026, 6, 26)


def _f(ftype, phase, severity="medium", headline="h", detail="d", evidence=None):
    return Finding(
        finding_type=ftype, severity=severity, headline=headline, detail=detail,
        evidence_event_ids=evidence or ["e1"], phase=phase,
    )


# ---- dedupe_key (pure) ----

def test_dedupe_key_combines_type_and_phase():
    assert dedupe_key("stale_milestone", "plastering") == "stale_milestone:plastering"
    assert dedupe_key("idle_gap", None) == "idle_gap:-"


# ---- persist_findings (DB) ----

async def test_persist_inserts_new_open_findings(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    await persist_findings(
        db_session, site.id,
        [_f("stale_milestone", "plastering"), _f("idle_gap", None)],
        detected_on=D1,
    )
    rows = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalars().all()
    assert len(rows) == 2
    assert {r.status for r in rows} == {"open"}


async def test_rerun_dedupes_instead_of_duplicating(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    await persist_findings(
        db_session, site.id, [_f("stale_milestone", "plastering")], detected_on=D1
    )
    # same finding fires again next night with a fresh detail
    await persist_findings(
        db_session, site.id,
        [_f("stale_milestone", "plastering", detail="updated detail")],
        detected_on=D2,
    )
    rows = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalars().all()
    assert len(rows) == 1  # deduped, not duplicated
    assert rows[0].detail == "updated detail"
    assert rows[0].status == "open"


async def test_finding_absent_this_run_is_auto_resolved(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    await persist_findings(
        db_session, site.id,
        [_f("stale_milestone", "plastering"), _f("idle_gap", None)],
        detected_on=D1,
    )
    # next night only idle_gap fires -> stale_milestone condition cleared
    await persist_findings(db_session, site.id, [_f("idle_gap", None)], detected_on=D2)
    rows = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalars().all()
    by_type = {r.finding_type: r for r in rows}
    assert by_type["stale_milestone"].status == "resolved"
    assert by_type["stale_milestone"].resolved_on == D2
    assert by_type["idle_gap"].status == "open"


async def test_acknowledged_finding_stays_acknowledged_on_recurrence(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    await persist_findings(db_session, site.id, [_f("idle_gap", None)], detected_on=D1)
    row = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalar_one()
    row.status = "acknowledged"
    await db_session.flush()
    # fires again -> must NOT revert to open (don't re-nag)
    await persist_findings(
        db_session, site.id, [_f("idle_gap", None, detail="again")], detected_on=D2
    )
    refreshed = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalar_one()
    assert refreshed.status == "acknowledged"
    assert refreshed.detail == "again"
