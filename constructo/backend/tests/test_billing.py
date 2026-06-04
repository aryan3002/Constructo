"""Company billing tracking (W4.8)."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_get_billing_defaults_empty(client, factory, db_session):
    owner = await factory.user(role=UserRole.owner)
    await db_session.commit()
    resp = await client.get("/api/v1/billing", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json() == {
        "plan": None,
        "billing_email": None,
        "billing_contact": None,
        "notes": None,
    }


async def test_owner_sets_billing(client, factory, db_session):
    owner = await factory.user(role=UserRole.owner)
    await db_session.commit()
    resp = await client.put(
        "/api/v1/billing",
        json={"plan": "Pilot", "billing_email": "accounts@verma.example"},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plan"] == "Pilot"
    assert body["billing_email"] == "accounts@verma.example"

    # Persisted; partial patch keeps the other fields.
    patched = await client.put(
        "/api/v1/billing", json={"billing_contact": "R. Verma"}, headers=auth(owner)
    )
    assert patched.json()["plan"] == "Pilot"
    assert patched.json()["billing_contact"] == "R. Verma"


async def test_member_reads_owner_writes(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    pm = await factory.user(company=company, role=UserRole.pm)
    await db_session.commit()
    await client.put("/api/v1/billing", json={"plan": "Starter"}, headers=auth(owner))

    # PM can read.
    read = await client.get("/api/v1/billing", headers=auth(pm))
    assert read.json()["plan"] == "Starter"
    # PM cannot write.
    denied = await client.put("/api/v1/billing", json={"plan": "x"}, headers=auth(pm))
    assert denied.status_code == 403
