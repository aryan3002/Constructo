"""Spec vision extraction — gpt-4o proposes material fields from a photo."""
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import Component, Space, SpaceKind, UserRole
from app.specs.extraction import extract_material_from_image, get_llm


async def test_extract_returns_fields_and_passes_image():
    canned = {
        "brand": "WELMICA", "product_code": "EB-MR-856", "name": "Radiant Charm",
        "colour": "Mirror Gloss", "finish": "Gloss", "category": "Laminate",
        "size": "1220x2440", "thickness": "1.0", "confidence": 0.9,
    }
    llm = FakeLLMClient(canned=canned)
    out = await extract_material_from_image(llm, "data:image/jpeg;base64,AAAA")

    assert out["brand"] == "WELMICA"
    assert out["product_code"] == "EB-MR-856"
    # the image URL was actually passed to the vision call
    assert llm.calls[-1]["image_url"] == "data:image/jpeg;base64,AAAA"


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_extract_endpoint_creates_pending_spec(client, factory, db_session):
    canned = {
        "brand": "WELMICA", "product_code": "EB-MR-856", "name": "Radiant Charm",
        "colour": "Mirror Gloss", "finish": "Gloss", "category": "Laminate",
        "size": "1220x2440", "thickness": "1.0", "confidence": 0.9,
    }
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        room = Space(site_id=site.id, name="Daughter's Room", kind=SpaceKind.room)
        db_session.add(room)
        await db_session.flush()
        comp = Component(space_id=room.id, name="Wardrobe", location="Wall A")
        db_session.add(comp)
        await db_session.flush()
        await db_session.commit()

        resp = await client.post(
            "/api/v1/specs/extract",
            data={"site_id": str(site.id), "component_id": str(comp.id)},
            files={"image": ("page.jpg", b"\xff\xd8\xff\xe0fake-jpeg-bytes", "image/jpeg")},
            headers=_auth(architect),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["extracted"]["brand"] == "WELMICA"
        assert body["spec"]["approval_status"] == "pending"
        assert body["spec"]["material_id"] is not None
    finally:
        app.dependency_overrides.pop(get_llm, None)
