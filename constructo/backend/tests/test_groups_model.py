"""Groups subsystem schema behavior (doc 18 Phase 2): partial unique index +
explicit conversation membership. Exercised via the create_all path."""
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberRole,
    UserRole,
)


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_partial_unique_allows_many_groups_one_site_thread(db_session, world):
    company, _owner, site = world
    db_session.add(
        Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    )
    db_session.add(
        Conversation(
            company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Plumbing"
        )
    )
    db_session.add(
        Conversation(
            company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Electrical"
        )
    )
    await db_session.flush()

    groups = (
        await db_session.execute(
            select(Conversation).where(
                Conversation.site_id == site.id,
                Conversation.kind == ConversationKind.group,
            )
        )
    ).scalars().all()
    assert len(groups) == 2


async def test_partial_unique_rejects_two_site_threads(db_session, world):
    company, _owner, site = world
    db_session.add(
        Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    )
    await db_session.flush()

    db_session.add(
        Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    )
    with pytest.raises(IntegrityError):  # partial unique index violation
        await db_session.flush()


async def test_group_allows_null_site_id(db_session, world):
    company, _owner, _site = world
    db_session.add(
        Conversation(
            company_id=company.id, site_id=None, kind=ConversationKind.group, title="Office"
        )
    )
    await db_session.flush()  # CHECK permits group rows without a site


async def test_site_thread_requires_site_id(db_session, world):
    company, _owner, _site = world
    db_session.add(
        Conversation(company_id=company.id, site_id=None, kind=ConversationKind.site)
    )
    with pytest.raises(IntegrityError):  # ck_conversation_site_required violation
        await db_session.flush()


async def test_duplicate_membership_rejected(db_session, world):
    company, owner, site = world
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Crew"
    )
    db_session.add(conv)
    await db_session.flush()

    db_session.add(
        ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin)
    )
    await db_session.flush()

    db_session.add(
        ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.member)
    )
    with pytest.raises(IntegrityError):  # composite PK violation
        await db_session.flush()


async def test_conversation_member_roles_persist(db_session, world):
    company, owner, site = world
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Crew"
    )
    db_session.add(conv)
    await db_session.flush()

    db_session.add(
        ConversationMember(
            conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin
        )
    )
    await db_session.flush()

    member = await db_session.get(ConversationMember, (conv.id, owner.id))
    assert member is not None
    assert member.role == MemberRole.admin
    assert member.muted is False
