"""Design-loop notifier tests (Phase 2 Task 1).

Covers both directions of app.profiler.events.notify_design_event: homeowner
bell/push via notify_site_homeowners, designer push via push_tokens_for_user,
and the loud ValueError on an unknown kind.
"""
import pytest
from sqlalchemy import select

from app.models.homeowner_member import HomeownerMember
from app.models.profiler import ProfilerProfile
from app.profiler.events import notify_design_event
from app.push.sender import dry_run_log, reset_dry_run_log
from tests.test_profiler_membrane import _world


@pytest.fixture(autouse=True)
def _clean_push_log():
    reset_dry_run_log()
    yield
    reset_dry_run_log()


async def test_brief_sent_notifies_designer_not_homeowner(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "brief_sent_to_designer", version=1)
    msgs = dry_run_log()
    # architect has no PushToken registered in this world -> no crash, no homeowner push
    assert all(m["data"]["type"] == "design" for m in msgs)
    assert not any(
        m["data"]["kind"] == "brief_sent_to_designer" and m["data"].get("audience") == "homeowner"
        for m in msgs
    )


async def test_signed_off_reaches_homeowner_inbox_and_push(client, factory, db_session):
    w = await _world(client, factory, db_session)
    # give the owner member a push token + default cadence
    member = (
        await db_session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == w["owner"].id)
        )
    ).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()
    profile = await db_session.get(ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "designer_signed_off", version=2)
    msgs = dry_run_log()
    assert any(
        m["to"] == "ExponentPushToken[test-owner]" and m["data"]["kind"] == "designer_signed_off"
        for m in msgs
    )


async def test_unknown_kind_raises(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(ProfilerProfile, w["pid"])
    with pytest.raises(ValueError):
        await notify_design_event(db_session, profile, "brief_snet")  # typo must fail loudly
