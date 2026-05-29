from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import select

from app.models import (
    Company,
    OwnerBrief,
    RawMessageModel,
    Site,
    SiteEventModel,
    User,
    UserRole,
    WhatsappGroup,
)


async def test_company_user_site_roundtrip(db_session, factory):
    company = await factory.company(name="Constructo Demo Co")
    user = await factory.user(company=company, role=UserRole.pm, phone="+15551234567")
    site = await factory.site(company=company, name="Tower One")
    await db_session.flush()

    fetched = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fetched.company_id == company.id
    assert fetched.role is UserRole.pm
    assert site.company_id == company.id


async def test_raw_message_and_site_event_persist(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)

    msg = RawMessageModel(
        source="baileys",
        external_group_id="g1",
        sender_id="s1",
        media_type="text",
        text="hi",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={"k": "v"},
    )
    db_session.add(msg)
    await db_session.flush()

    event = SiteEventModel(
        site_id=site.id,
        event_type="attendance",
        occurred_on=date(2026, 5, 28),
        summary="20 workers",
        fields={"count": 20},
        confidence=0.9,
        source_message_ids=[msg.id],
    )
    db_session.add(event)
    await db_session.flush()

    stored = (
        await db_session.execute(select(SiteEventModel).where(SiteEventModel.id == event.id))
    ).scalar_one()
    assert stored.source_message_ids == [msg.id]
    assert stored.fields == {"count": 20}
    assert stored.version == 1
    assert stored.needs_clarification is False


async def test_whatsapp_group_and_owner_brief(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="ext-1",
        source="baileys",
        label="Site A crew",
    )
    brief = OwnerBrief(company_id=company.id, brief_date=date(2026, 5, 28), payload={"x": 1})
    db_session.add_all([group, brief])
    await db_session.flush()
    assert group.id is not None
    assert brief.sent_at is None
    assert isinstance(company, Company)
    _ = uuid4()
