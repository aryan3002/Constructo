"""Phase 3b: homeowner responds to a heads-up (approve/dispute/show-more) and the
proactive 'something looks off' flag — both feed the builder handoff."""
from datetime import date

from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import HomeownerRequest, SiteFinding


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _finding(site_id, ftype="photo_vs_theme", *, status="open", phase="bathroom"):
    return SiteFinding(
        site_id=site_id, finding_type=ftype, severity="high", status=status,
        headline="Installed tiles look different from the approved design",
        detail="raw detail", phase=phase, dedupe_key=f"{ftype}:{phase}",
        evidence=[], detected_on=date(2026, 6, 25),
    )


async def _requests(db_session, site_id):
    return (
        await db_session.execute(
            select(HomeownerRequest).where(HomeownerRequest.site_id == site_id)
        )
    ).scalars().all()


async def test_respond_approved_resolves_finding(client, db_session, ctx):
    f = _finding(ctx.site.id)
    db_session.add(f)
    await db_session.flush()

    resp = await client.post(
        f"/api/v1/homeowner/heads-up/{f.id}/respond",
        json={"action": "approved"}, headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200
    await db_session.refresh(f)
    assert f.status == "resolved"
    assert await _requests(db_session, ctx.site.id) == []  # approval needs no handoff


async def test_respond_disputed_opens_builder_handoff(client, db_session, ctx):
    f = _finding(ctx.site.id)
    db_session.add(f)
    await db_session.flush()

    resp = await client.post(
        f"/api/v1/homeowner/heads-up/{f.id}/respond",
        json={"action": "disputed", "note": "this isn't the tile I picked"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200
    reqs = await _requests(db_session, ctx.site.id)
    assert len(reqs) == 1
    assert "this isn't the tile I picked" in (reqs[0].detail or "")
    await db_session.refresh(f)
    assert f.status == "acknowledged"  # leaves the heads-up; now a tracked request


async def test_flag_creates_builder_request(client, db_session, ctx):
    resp = await client.post(
        "/api/v1/homeowner/flag",
        json={"site_id": str(ctx.site.id), "note": "the living room paint looks patchy"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code in (200, 201)
    reqs = await _requests(db_session, ctx.site.id)
    assert any("patchy" in (r.detail or "") for r in reqs)
