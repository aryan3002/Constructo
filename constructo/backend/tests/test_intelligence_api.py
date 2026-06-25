"""Site Health API — score + findings, acknowledge/resolve. Scoped, DB-backed."""
from datetime import date, timedelta

from app.auth.jwt import create_access_token
from app.models import Milestone, MilestoneStatus, UserRole


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _stale_site(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    # plastering overrunning AND underway before brickwork is done -> two high findings
    db_session.add_all([
        Milestone(
            site_id=site.id, name="Plastering", status=MilestoneStatus.now,
            started_on=date.today() - timedelta(days=40), order=1,
        ),
        Milestone(
            site_id=site.id, name="Brickwork", status=MilestoneStatus.now,
            started_on=date.today() - timedelta(days=20), order=0,
        ),
    ])
    await db_session.flush()
    return company, owner, site


async def test_health_returns_score_and_findings(client, db_session, factory):
    _, owner, site = await _stale_site(factory, db_session)
    resp = await client.get(f"/api/v1/sites/{site.id}/health?refresh=true", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] < 100
    assert body["band"] in ("watch", "at_risk")
    assert any(f["finding_type"] == "stale_milestone" for f in body["findings"])


async def test_health_homeowner_blocked(client, db_session, factory):
    company, _, site = await _stale_site(factory, db_session)
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get(f"/api/v1/sites/{site.id}/health", headers=auth(homeowner))
    assert resp.status_code == 403


async def test_acknowledge_finding(client, db_session, factory):
    _, owner, site = await _stale_site(factory, db_session)
    listed = (
        await client.get(f"/api/v1/sites/{site.id}/health?refresh=true", headers=auth(owner))
    ).json()
    fid = listed["findings"][0]["id"]
    ack = await client.post(f"/api/v1/findings/{fid}/acknowledge", headers=auth(owner))
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"


async def test_resolve_finding_removes_from_active(client, db_session, factory):
    _, owner, site = await _stale_site(factory, db_session)
    listed = (
        await client.get(f"/api/v1/sites/{site.id}/health?refresh=true", headers=auth(owner))
    ).json()
    fid = listed["findings"][0]["id"]
    res = await client.post(f"/api/v1/findings/{fid}/resolve", headers=auth(owner))
    assert res.status_code == 200
    again = (
        await client.get(f"/api/v1/sites/{site.id}/health", headers=auth(owner))
    ).json()
    assert all(f["id"] != fid for f in again["findings"])
