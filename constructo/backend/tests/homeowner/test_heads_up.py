"""GET /api/v1/homeowner/heads-up — homeowner-safe findings, scoped + filtered."""
from datetime import date

from app.auth.jwt import create_access_token
from app.models import SiteFinding


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _f(site_id, ftype, *, status="open", phase=None):
    return SiteFinding(
        site_id=site_id, finding_type=ftype, severity="high", status=status,
        headline="raw", detail="raw", phase=phase,
        dedupe_key=f"{ftype}:{phase or '-'}", evidence=[], detected_on=date(2026, 6, 25),
    )


async def test_heads_up_shows_schedule_hides_operational(client, db_session, ctx):
    db_session.add_all([
        _f(ctx.site.id, "stale_milestone", phase="plastering"),
        _f(ctx.site.id, "attendance_erosion"),
        _f(ctx.site.id, "material_work_mismatch", phase="brickwork"),
    ])
    await db_session.flush()

    resp = await client.get(
        f"/api/v1/homeowner/heads-up?site_id={ctx.site.id}", headers=auth(ctx.homeowner)
    )
    assert resp.status_code == 200
    cards = resp.json()["cards"]
    assert len(cards) == 1  # only the schedule finding crosses
    assert cards[0]["category"] == "schedule"
    assert cards[0]["respondable"] is False
    assert "plastering" in cards[0]["headline"].lower()


async def test_heads_up_hides_acknowledged(client, db_session, ctx):
    db_session.add(_f(ctx.site.id, "stale_milestone", status="acknowledged", phase="plastering"))
    await db_session.flush()
    resp = await client.get(
        f"/api/v1/homeowner/heads-up?site_id={ctx.site.id}", headers=auth(ctx.homeowner)
    )
    assert resp.status_code == 200
    assert resp.json()["cards"] == []
