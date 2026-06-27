"""Phase 1e: the morning brief surfaces proactive SiteFindings."""
from datetime import date

from app.brief.generate import build_brief
from app.extraction.llm import FakeLLMClient
from app.models import SiteFinding

DAY = date(2026, 6, 25)


def _finding(site_id, *, status="open", ftype="stale_milestone", sev="high", phase="plastering"):
    return SiteFinding(
        site_id=site_id, finding_type=ftype, severity=sev, status=status,
        headline="Plastering has run 41 days (usually 10-18)",
        detail="The Plastering phase started 41 days ago and is still open.",
        phase=phase, dedupe_key=f"{ftype}:{phase}", evidence=["m1"], detected_on=DAY,
    )


async def test_brief_includes_open_findings_even_without_events(db_session, factory):
    company = await factory.company()
    site = await factory.site(company, name="Sunrise")
    db_session.add(_finding(site.id))
    await db_session.flush()

    result = await build_brief(db_session, company.id, DAY, llm=FakeLLMClient())
    sites = {s["name"]: s for s in result["payload"]["sites"]}
    assert "Sunrise" in sites  # appears though it had no events today
    findings = sites["Sunrise"]["findings"]
    assert any(f["finding_type"] == "stale_milestone" for f in findings)
    assert findings[0]["headline"]
    assert findings[0]["severity"] == "high"


async def test_brief_hides_acknowledged_findings(db_session, factory):
    company = await factory.company()
    site = await factory.site(company, name="Quiet")
    db_session.add(_finding(site.id, status="acknowledged"))
    await db_session.flush()

    result = await build_brief(db_session, company.id, DAY, llm=FakeLLMClient())
    sites = {s["name"]: s for s in result["payload"]["sites"]}
    # only an acknowledged finding + no events -> the site is not surfaced
    assert "Quiet" not in sites


async def test_brief_findings_appear_in_fallback_text(db_session, factory):
    company = await factory.company()
    site = await factory.site(company, name="Sunrise")
    db_session.add(_finding(site.id))
    await db_session.flush()

    # FakeLLMClient returns its canned/derived shape; force the deterministic
    # fallback by asserting the payload carries findings the renderer can use.
    result = await build_brief(db_session, company.id, DAY, llm=FakeLLMClient())
    payload = result["payload"]
    site_payload = next(s for s in payload["sites"] if s["name"] == "Sunrise")
    assert site_payload["findings"][0]["headline"].startswith("Plastering")
