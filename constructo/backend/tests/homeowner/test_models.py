"""H0 model round-trips: every new table persists and reads back with its enums
and server defaults intact."""
from datetime import date

from app.models import (
    Change,
    Component,
    ComponentStatus,
    DesignProfile,
    DesignReference,
    DesignSelection,
    HomeownerMember,
    HomeownerRequest,
    HomeownerRequestStatus,
    MemberStatus,
    Milestone,
    MilestoneStatus,
    Property,
    PublishedPhoto,
    ReferenceSource,
    Space,
    SpaceKind,
    Update,
    UpdateType,
    WeeklySummary,
)


async def test_property_skeleton_round_trip(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    prop = Property(
        company_id=company.id, site_id=site.id, display_name="My Home", type="villa",
        status="building", started_on=date(2026, 1, 1),
        expected_handover_on=date(2026, 12, 1),
    )
    db_session.add(prop)
    floor = Space(site_id=site.id, name="Ground Floor", kind=SpaceKind.floor)
    db_session.add(floor)
    await db_session.flush()
    room = Space(site_id=site.id, parent_id=floor.id, name="Kitchen", kind=SpaceKind.room, order=1)
    db_session.add(room)
    await db_session.flush()
    comp = Component(space_id=room.id, name="Cabinets")
    db_session.add(comp)
    await db_session.flush()

    assert prop.created_at is not None
    assert room.parent_id == floor.id
    assert room.order == 1
    assert comp.status is ComponentStatus.not_started  # server default


async def test_design_tables_round_trip(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    profile = DesignProfile(site_id=site.id, profile={"profile": "warm minimal", "tone": ["calm"]})
    ref = DesignReference(site_id=site.id, image_url="http://x/1.jpg", room_tag="kitchen")
    sel = DesignSelection(site_id=site.id, item="flooring", choice="oak")
    db_session.add_all([profile, ref, sel])
    await db_session.flush()

    assert profile.profile["tone"] == ["calm"]
    assert ref.source is ReferenceSource.upload  # server default
    assert sel.status == "proposed"  # server default


async def test_feed_tables_round_trip(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    m = Milestone(site_id=site.id, name="Foundation", status=MilestoneStatus.now, order=0)
    db_session.add(m)
    await db_session.flush()
    photo = PublishedPhoto(site_id=site.id, image_url="http://x/p.jpg", milestone_id=m.id)
    upd = Update(site_id=site.id, type=UpdateType.progress, title="Slab poured")
    ws = WeeklySummary(site_id=site.id, week_start=date(2026, 5, 25), text="Calm week")
    ch = Change(site_id=site.id, description="Extra socket", cost_delta=5000, schedule_delta_days=2)
    db_session.add_all([photo, upd, ws, ch])
    await db_session.flush()

    assert photo.is_starred is False  # server default
    assert photo.milestone_id == m.id
    assert upd.type is UpdateType.progress
    assert float(ch.cost_delta) == 5000.0


async def test_member_and_request_round_trip(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)

    member = HomeownerMember(site_id=site.id)
    db_session.add(member)
    await db_session.flush()
    # Defaults: a unique join code is generated, status starts "invited".
    assert member.join_code
    assert member.status is MemberStatus.invited
    assert member.notif_prefs == {}

    req = HomeownerRequest(site_id=site.id, title="Leaky tap")
    db_session.add(req)
    await db_session.flush()
    assert req.status is HomeownerRequestStatus.sent  # server default
    assert req.nudged_at is None
