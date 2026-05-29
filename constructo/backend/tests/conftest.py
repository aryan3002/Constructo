"""Shared test fixtures: transactional test DB, async client, factory helpers."""
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import app.models as models  # noqa: F401  register all tables on Base.metadata
from app.config import settings
from app.db import Base, get_session
from app.main import app
from app.models import Company, Site, User, UserRole


def _split_url(url: str) -> tuple[str, str]:
    base, _, dbname = url.rpartition("/")
    return base, dbname


TEST_DB_NAME = _split_url(settings.database_url)[1] + "_test"
TEST_DATABASE_URL = _split_url(settings.database_url)[0] + "/" + TEST_DB_NAME
ADMIN_DATABASE_URL = _split_url(settings.database_url)[0] + "/postgres"


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def _setup_database():
    """Create the test database (if needed) and build a fresh schema once per session.

    Self-contained: every engine/connection it opens is disposed before returning, so
    nothing is shared across event loops (per-test fixtures run on their own loops).
    """
    admin = create_async_engine(ADMIN_DATABASE_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB_NAME}
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    await admin.dispose()

    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    yield


@pytest_asyncio.fixture
async def db_session(_setup_database) -> AsyncIterator[AsyncSession]:
    """Per-test session wrapped in an outer transaction that is rolled back at teardown.

    A fresh engine is created per test so the connection is bound to the test's own
    event loop. join_transaction_mode="create_savepoint" lets endpoint code call
    session.commit() (which becomes a SAVEPOINT release) without escaping the rollback.
    """
    engine = create_async_engine(TEST_DATABASE_URL)
    conn = await engine.connect()
    outer = await conn.begin()
    session = AsyncSession(
        bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    try:
        yield session
    finally:
        await session.close()
        if outer.is_active:
            await outer.rollback()
        await conn.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---- factory helpers -------------------------------------------------------


@pytest_asyncio.fixture
async def factory(db_session: AsyncSession):
    class Factory:
        def __init__(self, session: AsyncSession):
            self.session = session

        async def company(self, name: str = "Acme Builders") -> Company:
            obj = Company(name=name)
            self.session.add(obj)
            await self.session.flush()
            return obj

        async def user(
            self,
            company: Company | None = None,
            role: UserRole = UserRole.owner,
            phone: str | None = None,
            name: str = "Test User",
        ) -> User:
            if company is None:
                company = await self.company()
            obj = User(
                company_id=company.id,
                role=role,
                phone=phone or f"+1{uuid4().hex[:10]}",
                name=name,
            )
            self.session.add(obj)
            await self.session.flush()
            return obj

        async def site(self, company: Company, name: str = "Site A") -> Site:
            obj = Site(company_id=company.id, name=name)
            self.session.add(obj)
            await self.session.flush()
            return obj

    return Factory(db_session)
