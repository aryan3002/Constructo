"""Shared fixtures + helpers for the H0 homeowner-backend tests.

All tests use the session-bound ``client``/``factory``/``db_session`` fixtures
from the top-level conftest. The LLM is always the network-free
:class:`FakeLLMClient` (registered via a dependency override), so nothing here
touches a real provider.
"""
from types import SimpleNamespace

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.homeowner.ai import get_llm
from app.main import app
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
def fake_llm():
    """Register a network-free FakeLLM for ``get_llm`` for the duration of a test."""
    fake = FakeLLMClient()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


@pytest_asyncio.fixture
async def ctx(factory, db_session):
    """A ready homeowner world: company, owner (contractor), site, an active
    homeowner member, and the homeowner user bound to it."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Villa")
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    member = HomeownerMember(
        site_id=site.id,
        user_id=homeowner.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()
    return SimpleNamespace(
        company=company, owner=owner, site=site, homeowner=homeowner, member=member
    )
