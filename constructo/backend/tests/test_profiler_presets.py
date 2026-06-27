"""Design Profiler — preset packs: list (filtered + image_url resolved) and
add-from-preset (a reference copying the preset's R2 key)."""
from uuid import uuid4

from app.auth.jwt import create_access_token
from app.models import UserRole
from app.models.profiler import ProfilerPreset
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
