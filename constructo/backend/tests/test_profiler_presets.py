"""Design Profiler — preset packs: list (filtered + image_url resolved) and
add-from-preset (a reference copying the preset's R2 key)."""
from uuid import UUID, uuid4

from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import Company, UserRole
from app.models.profiler import (
    ContributorRole,
    ProfilerContributor,
    ProfilerPreset,
    ProfilerReference,
)
from app.storage import get_storage


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _seed_preset(db_session, **kw):
    defaults = dict(
        area_kind="interior",
        area_key="kitchen",
        pack="Warm Minimal",
        title="Oak & linen",
        image_r2_key="presets/kitchen/oak.jpg",
        sort=0,
    )
    defaults.update(kw)
    p = ProfilerPreset(**defaults)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


async def _profile_with_area(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 6}],
            "contributors": [
                {"role": "co_owner", "is_decision_owner": True, "user_id": str(architect.id)}
            ],
        },
        headers=auth(architect),
    )
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    return architect, site, pid, detail["areas"][0]["id"], detail["my_contributor_id"]


async def test_list_presets_filters_by_kind_and_key(client, factory, db_session):
    await _seed_preset(db_session)  # interior/kitchen
    await _seed_preset(
        db_session, area_key=None, title="Any interior", image_r2_key="presets/any.jpg"
    )
    await _seed_preset(
        db_session, area_kind="house_build", area_key=None, title="Facade",
        image_r2_key="presets/facade.jpg",
    )
    user = await factory.user(role=UserRole.architect)
    resp = await client.get(
        "/api/v1/design/presets?area_kind=interior&area_key=kitchen", headers=auth(user)
    )
    assert resp.status_code == 200
    rows = resp.json()
    titles = {r["title"] for r in rows}
    assert "Oak & linen" in titles
    assert "Any interior" in titles  # area_key NULL applies to any interior area
    assert "Facade" not in titles  # different area_kind
    assert all(r["image_url"] for r in rows)  # resolved for rendering


async def test_list_presets_matches_across_space_underscore(client, factory, db_session):
    # Catalog keys (spaces) must match area keys (underscores) — convention drift
    # otherwise hides every multi-word room's curated packs.
    await _seed_preset(
        db_session, area_key="master bedroom", title="Soft neutrals",
        image_r2_key="presets/mb.jpg",
    )
    user = await factory.user(role=UserRole.architect)
    resp = await client.get(
        "/api/v1/design/presets?area_kind=interior&area_key=master_bedroom",
        headers=auth(user),
    )
    assert resp.status_code == 200
    assert any(r["title"] == "Soft neutrals" for r in resp.json())


async def test_list_presets_falls_back_to_generic_pack_for_uncataloged_area(
    client, factory, db_session
):
    """An area with no room-specific catalog entry (e.g. a custom room like
    "pooja") must still see the area_kind's generic (area_key=None) packs —
    otherwise "Use presets" looks broken for every area that isn't one of the
    handful of named rooms in the seed catalog."""
    await _seed_preset(
        db_session, area_key=None, title="Designer picks", image_r2_key="presets/any.jpg",
    )
    user = await factory.user(role=UserRole.architect)
    resp = await client.get(
        "/api/v1/design/presets?area_kind=interior&area_key=pooja", headers=auth(user)
    )
    assert resp.status_code == 200
    titles = {r["title"] for r in resp.json()}
    assert "Designer picks" in titles


async def test_reference_from_preset_creates_reference(client, factory, db_session):
    preset = await _seed_preset(db_session)
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    resp = await client.post(
        "/api/v1/design/references/from-preset",
        json={"area_id": area_id, "contributor_id": contributor_id, "preset_id": str(preset.id)},
        headers=auth(architect),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["source_type"] == "preset"
    assert body["preset_id"] == str(preset.id)
    assert body["image_r2_key"] == "presets/kitchen/oak.jpg"
    assert body["image_url"] == get_storage().url_for("presets/kitchen/oak.jpg")


async def test_reference_from_preset_unknown_is_404(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    resp = await client.post(
        "/api/v1/design/references/from-preset",
        json={"area_id": area_id, "preset_id": str(uuid4())},
        headers=auth(architect),
    )
    assert resp.status_code == 404


async def test_reference_from_preset_area_kind_mismatch_is_422(client, factory, db_session):
    # A house_build preset cannot be attached to an interior area.
    preset = await _seed_preset(
        db_session, area_kind="house_build", area_key=None, title="Facade",
        image_r2_key="presets/facade.jpg",
    )
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    resp = await client.post(
        "/api/v1/design/references/from-preset",
        json={"area_id": area_id, "contributor_id": contributor_id, "preset_id": str(preset.id)},
        headers=auth(architect),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "preset_area_mismatch"


async def test_reference_from_preset_cross_company_stranger_404(client, factory, db_session):
    preset = await _seed_preset(db_session)
    _architect, _site, _pid, area_id, _contributor_id = await _profile_with_area(client, factory)
    stranger = await factory.user(role=UserRole.architect)  # different company
    resp = await client.post(
        "/api/v1/design/references/from-preset",
        json={"area_id": area_id, "preset_id": str(preset.id)},
        headers=auth(stranger),
    )
    assert resp.status_code == 404


async def test_reference_from_preset_is_idempotent_per_contributor(client, factory, db_session):
    """Tapping "add this preset" twice for the same contributor+area must not
    create a duplicate reference — a repeat tap (double-click, retry) is a
    true no-op beyond returning the existing row."""
    preset = await _seed_preset(db_session)
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    payload = {"area_id": area_id, "contributor_id": contributor_id, "preset_id": str(preset.id)}

    first = await client.post(
        "/api/v1/design/references/from-preset", json=payload, headers=auth(architect)
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    count_before = (
        await db_session.execute(select(func.count()).select_from(ProfilerReference))
    ).scalar_one()

    second = await client.post(
        "/api/v1/design/references/from-preset", json=payload, headers=auth(architect)
    )
    assert second.status_code == 201
    assert second.json()["id"] == first_id

    count_after = (
        await db_session.execute(select(func.count()).select_from(ProfilerReference))
    ).scalar_one()
    assert count_after == count_before  # no new row inserted on the dedupe path


async def test_reference_from_preset_different_contributor_creates_new_row(
    client, factory, db_session
):
    """The same preset added by a DIFFERENT contributor on the same area is not
    a duplicate — each contributor's taste model needs its own reference row."""
    preset = await _seed_preset(db_session)
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)

    company = await db_session.get(Company, site.company_id)
    other_user = await factory.user(company=company, role=UserRole.architect)
    other_contributor = ProfilerContributor(
        profile_id=UUID(pid), user_id=other_user.id, role=ContributorRole.architect
    )
    db_session.add(other_contributor)
    await db_session.commit()
    await db_session.refresh(other_contributor)

    first = await client.post(
        "/api/v1/design/references/from-preset",
        json={"area_id": area_id, "contributor_id": contributor_id, "preset_id": str(preset.id)},
        headers=auth(architect),
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/design/references/from-preset",
        json={
            "area_id": area_id,
            "contributor_id": str(other_contributor.id),
            "preset_id": str(preset.id),
        },
        headers=auth(other_user),
    )
    assert second.status_code == 201
    assert second.json()["id"] != first.json()["id"]
