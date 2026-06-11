"""member_user_ids: derived membership per conversation kind."""
import pytest_asyncio

from app.chat.members import member_user_ids
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    HomeownerSubRole,
    MemberStatus,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember
from app.sites.models import SiteAssignment


@pytest_asyncio.fixture
async def setup(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    outsider = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            sub_role=HomeownerSubRole.primary_owner,
            status=MemberStatus.active,
        )
    )
    await db_session.flush()
    return company, site, owner, supervisor, outsider, homeowner


async def test_site_thread_members_are_assigned_crew_plus_owners(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert owner.id in ids and supervisor.id in ids
    assert outsider.id not in ids  # not assigned to the site
    assert homeowner.id not in ids  # never in the crew room


async def test_homeowner_thread_members_include_active_homeowners(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner
    )
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert homeowner.id in ids and owner.id in ids and supervisor.id in ids


async def test_group_members_are_explicit(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group)
    db_session.add(conv)
    await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=supervisor.id))
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert set(ids) == {supervisor.id}


async def test_invited_homeowner_not_in_member_ids(db_session, factory, setup):
    """Deviation 3 + active-filter: invited (status != active) HomeownerMembers
    with a null user_id must never appear in member_user_ids (status guard +
    user_id IS NOT NULL guard)."""
    company, site, owner, supervisor, outsider, homeowner = setup
    # Add an invited (not yet redeemed) HomeownerMember — user_id is null.
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=None,
            sub_role=HomeownerSubRole.primary_owner,
            status=MemberStatus.invited,
        )
    )
    await db_session.flush()
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner
    )
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    # The invited member has no user_id → must not appear.
    assert None not in ids
    # The active homeowner is still present.
    assert homeowner.id in ids


async def test_deactivated_crew_user_not_in_member_ids(db_session, factory, setup):
    """is_active filter: a deactivated assigned supervisor must be excluded from
    member_user_ids even though they have a valid SiteAssignment."""
    company, site, owner, supervisor, outsider, homeowner = setup
    # Deactivate the assigned supervisor in-place and flush.
    supervisor.is_active = False
    await db_session.flush()
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    # Deactivated supervisor must not receive push/receipt writes.
    assert supervisor.id not in ids
    # Active owner is still present.
    assert owner.id in ids
