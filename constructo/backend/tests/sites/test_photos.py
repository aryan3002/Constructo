"""Owner site-photos read endpoint — for the 'Latest from site' strip."""
from datetime import UTC, datetime

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Company, PublishedPhoto, UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _company(db_session, company_id):
    return await db_session.get(Company, company_id)


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def test_owner_lists_site_photos_newest_first(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    for i, (url, when) in enumerate(
        [
            ("https://x/old.jpg", datetime(2026, 5, 1, tzinfo=UTC)),
            ("documents/new.jpg", datetime(2026, 6, 1, tzinfo=UTC)),  # bare key -> presigned
        ]
    ):
        db_session.add(
            PublishedPhoto(site_id=site.id, image_url=url, caption=f"c{i}", published_at=when)
        )
    await db_session.flush()

    resp = await client.get(f"/api/v1/sites/{site.id}/photos", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 2
    # Newest first.
    assert items[0]["published_at"] > items[1]["published_at"]
    # Bare key resolved to a fetchable URL (local storage prefixes media_dir).
    assert items[0]["image_url"] != "documents/new.jpg"


async def test_other_company_site_photos_forbidden(client, factory, db_session, owner):
    other = await factory.company()
    other_site = await factory.site(company=other)
    resp = await client.get(f"/api/v1/sites/{other_site.id}/photos", headers=auth(owner))
    assert resp.status_code in (403, 404)
