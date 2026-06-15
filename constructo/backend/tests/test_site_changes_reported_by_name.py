"""Site changes reported_by_name (Elev-A Part B).

The list, get, create, and update endpoints must return reported_by_name —
the human-readable display name for the reporting user — resolved via a
single batched query (no N+1). A raw UUID must never appear where a name
is expected.
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    arch = await factory.user(company=company, role=UserRole.architect, name="Anamika Sharma")
    site = await factory.site(company, name="Kutumb Nivaas")
    return company, arch, site


async def _report(client, user, site, **kw):
    payload = {
        "site_id": str(site.id),
        "title": "Beam position shifted 200mm east",
        "note": "Structural beam at grid C-3 is 200mm east of drawing.",
    }
    payload.update(kw)
    return await client.post("/api/v1/site-changes", json=payload, headers=auth(user))


async def test_create_returns_reported_by_name(client, world):
    """POST /site-changes returns reported_by_name matching the reporting user's name."""
    _, arch, site = world
    r = await _report(client, arch, site)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reported_by"] == str(arch.id)
    assert body["reported_by_name"] == "Anamika Sharma"


async def test_list_returns_reported_by_name(client, world):
    """GET /site-changes list includes reported_by_name for each item."""
    _, arch, site = world
    await _report(client, arch, site)

    listed = await client.get("/api/v1/site-changes", headers=auth(arch))
    assert listed.status_code == 200, listed.text
    items = listed.json()
    assert len(items) >= 1
    for item in items:
        # Every item with a reported_by id must have a resolved name, not a raw UUID.
        if item["reported_by"] is not None:
            name = item.get("reported_by_name")
            assert name is not None, f"reported_by_name missing for {item['reported_by']}"
            # The name must NOT look like a UUID (32+ hex chars with hyphens).
            assert not _is_uuid_string(name), (
                f"reported_by_name is a raw UUID: {name}"
            )


async def test_get_returns_reported_by_name(client, world):
    """GET /site-changes/{id} returns reported_by_name."""
    _, arch, site = world
    created = (await _report(client, arch, site)).json()
    r = await client.get(f"/api/v1/site-changes/{created['id']}", headers=auth(arch))
    assert r.status_code == 200
    body = r.json()
    assert body["reported_by_name"] == "Anamika Sharma"


async def test_reported_by_name_is_null_safe(client, db_session, world):
    """A SiteChange with reported_by=None still returns without error; reported_by_name is None."""
    company, arch, site = world
    from app.models import SiteChange, SiteChangeStatus

    change = SiteChange(
        company_id=company.id,
        site_id=site.id,
        title="Manual entry",
        note="No reporter assigned",
        reported_by=None,
        status=SiteChangeStatus.new,
    )
    db_session.add(change)
    await db_session.flush()
    change_id = str(change.id)

    r = await client.get(f"/api/v1/site-changes/{change_id}", headers=auth(arch))
    assert r.status_code == 200
    body = r.json()
    assert body["reported_by"] is None
    assert body["reported_by_name"] is None


def _is_uuid_string(s: str) -> bool:
    """Heuristic: a UUID looks like 8-4-4-4-12 hex chars."""
    import re
    return bool(re.match(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        s,
        re.IGNORECASE,
    ))
