"""notify_site_homeowners honours each member's per-category cadence."""
from __future__ import annotations

from app.models import HomeownerMember, HomeownerSubRole, MemberStatus
from app.push import sender


async def test_cadence_gating_and_spike(db_session, ctx):
    sender.reset_dry_run_log()

    # The existing member paused "site_updates".
    ctx.member.notif_prefs = {
        "push_token": "ExponentPushToken[paused]",
        "cadence": {"site_updates": "pause"},
    }
    # A second member with a token and no stored cadence → default = as it happens.
    live = HomeownerMember(
        site_id=ctx.site.id,
        user_id=ctx.owner.id,
        sub_role=HomeownerSubRole.family,
        status=MemberStatus.active,
        notif_prefs={"push_token": "ExponentPushToken[live]"},
    )
    db_session.add(live)
    await db_session.flush()

    # A "site_updates" push: the live member gets it, the paused one does not.
    await sender.notify_site_homeowners(
        db_session, ctx.site.id, "t", "b", category="site_updates"
    )
    tos = {m["to"] for m in sender.dry_run_log()}
    assert "ExponentPushToken[live]" in tos
    assert "ExponentPushToken[paused]" not in tos

    # An urgent SPIKE punches through the pause.
    sender.reset_dry_run_log()
    await sender.notify_site_homeowners(
        db_session, ctx.site.id, "t", "b", category="site_updates", spike=True
    )
    tos2 = {m["to"] for m in sender.dry_run_log()}
    assert "ExponentPushToken[paused]" in tos2

    # No category (a direct reply) ignores cadence — everyone with a token gets it.
    sender.reset_dry_run_log()
    await sender.notify_site_homeowners(db_session, ctx.site.id, "t", "b")
    tos3 = {m["to"] for m in sender.dry_run_log()}
    assert "ExponentPushToken[paused]" in tos3 and "ExponentPushToken[live]" in tos3
