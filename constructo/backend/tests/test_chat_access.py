"""Conversation access resolver (doc 18 Phase 2, Task 4).

Site/homeowner threads stay site-scoped (homeowner role blocked from site kind);
group threads are explicit-membership (a homeowner CAN be a group member).
"""
import pytest
import pytest_asyncio

from app.chat.access import can_access
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberRole,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember, MemberStatus


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Heights")
    return company, owner, site


async def _make_site_conversation(db_session, company, site, created_by):
    conv = Conversation(
        company_id=company.id,
        site_id=site.id,
        kind=ConversationKind.site,
        created_by=created_by.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _make_homeowner_conversation(db_session, company, site):
    conv = Conversation(
        company_id=company.id,
        site_id=site.id,
        kind=ConversationKind.homeowner,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _make_group(db_session, company, created_by, members):
    """A kind=group conversation with the given (user, role) members."""
    conv = Conversation(
        company_id=company.id,
        site_id=None,
        kind=ConversationKind.group,
        title="Site coordination",
        created_by=created_by.id,
    )
    db_session.add(conv)
    await db_session.flush()
    for member_user, role in members:
        db_session.add(
            ConversationMember(
                conversation_id=conv.id,
                user_id=member_user.id,
                role=role,
                added_by=created_by.id,
            )
        )
    await db_session.flush()
    return conv


@pytest.mark.asyncio
async def test_homeowner_blocked_from_site_thread(db_session, factory, world):
    company, owner, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    conv = await _make_site_conversation(db_session, company, site, owner)
    assert await can_access(db_session, homeowner, conv) is False


@pytest.mark.asyncio
async def test_homeowner_can_access_her_homeowner_channel(db_session, factory, world):
    company, owner, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code="ho-access-1",
        )
    )
    await db_session.flush()
    conv = await _make_homeowner_conversation(db_session, company, site)
    assert await can_access(db_session, homeowner, conv) is True


@pytest.mark.asyncio
async def test_homeowner_still_blocked_from_site_kind(db_session, factory, world):
    company, owner, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code="ho-access-2",
        )
    )
    await db_session.flush()
    conv = await _make_site_conversation(db_session, company, site, owner)
    # Even an active member is blocked from the crew (kind=site) thread.
    assert await can_access(db_session, homeowner, conv) is False


@pytest.mark.asyncio
async def test_homeowner_blocked_from_another_sites_homeowner_channel(
    db_session, factory, world
):
    company, owner, site = world
    # A homeowner who is a member of nothing — not of this site's channel.
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    conv = await _make_homeowner_conversation(db_session, company, site)
    assert await can_access(db_session, homeowner, conv) is False


@pytest.mark.asyncio
async def test_crew_can_access_homeowner_channel(db_session, factory, world):
    company, owner, site = world
    conv = await _make_homeowner_conversation(db_session, company, site)
    # The owner (crew) sees the homeowner channel for a site in their scope.
    assert await can_access(db_session, owner, conv) is True


@pytest.mark.asyncio
async def test_owner_sees_site_thread(db_session, factory, world):
    company, owner, site = world
    conv = await _make_site_conversation(db_session, company, site, owner)
    assert await can_access(db_session, owner, conv) is True


@pytest.mark.asyncio
async def test_group_member_allowed_non_member_blocked(db_session, factory, world):
    company, owner, _ = world
    member = await factory.user(company=company, role=UserRole.supervisor)
    outsider = await factory.user(company=company, role=UserRole.supervisor)
    conv = await _make_group(
        db_session,
        company,
        owner,
        [(owner, MemberRole.admin), (member, MemberRole.member)],
    )
    assert await can_access(db_session, member, conv) is True
    assert await can_access(db_session, outsider, conv) is False


@pytest.mark.asyncio
async def test_homeowner_can_be_group_member(db_session, factory, world):
    company, owner, _ = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    conv = await _make_group(
        db_session,
        company,
        owner,
        [(owner, MemberRole.admin), (homeowner, MemberRole.member)],
    )
    assert await can_access(db_session, homeowner, conv) is True


@pytest.mark.asyncio
async def test_group_cross_company_blocked(db_session, factory, world):
    """Defence-in-depth: even if a (future buggy/malicious) write inserted a
    cross-tenant membership row, can_access must NOT grant a user of company B
    access to a group owned by company A — the company guard catches it."""
    company_a, owner_a, _ = world
    conv = await _make_group(db_session, company_a, owner_a, [(owner_a, MemberRole.admin)])

    company_b = await factory.company(name="Rival Builders")
    user_b = await factory.user(company=company_b, role=UserRole.owner)
    # A rogue membership row tying company B's user to company A's group.
    db_session.add(
        ConversationMember(
            conversation_id=conv.id,
            user_id=user_b.id,
            role=MemberRole.member,
            added_by=owner_a.id,
        )
    )
    await db_session.flush()

    assert await can_access(db_session, user_b, conv) is False
