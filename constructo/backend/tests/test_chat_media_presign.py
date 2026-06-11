"""Presigned chat media: S3/R2 returns a direct PUT URL; local backend says
'use multipart' so the client falls back to POST /chat/media."""
from app.models import UserRole
from tests.test_chat_api import auth


async def test_presign_local_backend_falls_back_to_multipart(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/media/presign",
        json={"site_id": str(site.id), "kind": "image"},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["upload_mode"] == "multipart"  # local storage has no presigned PUT
    assert body["key"].startswith(f"chat/{site.id}/") and body["key"].endswith(".jpg")
    assert body["put_url"] is None


async def test_presign_requires_site_scope(client, factory):
    company = await factory.company()
    other = await factory.company(name="Other Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    foreign_site = await factory.site(other)
    resp = await client.post(
        "/api/v1/chat/media/presign",
        json={"site_id": str(foreign_site.id), "kind": "image"},
        headers=auth(owner),
    )
    assert resp.status_code == 403
