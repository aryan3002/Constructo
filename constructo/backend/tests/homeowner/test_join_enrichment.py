"""H6 JoinOut onboarding enrichment.

POST /join returns the property display_name + the building company name on top
of the bare token, so the app can greet the homeowner with their build. Both
fields are nullable (a sparsely-seeded property never breaks redemption).
"""
from app.models import Property

from .conftest import auth


async def test_join_returns_display_name_and_company(client, factory, db_session):
    company = await factory.company(name="Skyline Builders")
    owner = await factory.user(company=company)
    site = await factory.site(company, name="Plot 12")
    db_session.add(
        Property(company_id=company.id, site_id=site.id, display_name="The Mehra Residence")
    )
    await db_session.flush()

    minted = await client.post(
        "/api/v1/homeowner/members",
        json={"site_id": str(site.id), "sub_role": "primary_owner"},
        headers=auth(owner),
    )
    join_code = minted.json()["join_code"]

    joined = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": join_code, "phone": "+919812340000", "otp": "000000"},
    )
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["token"]
    assert body["site_id"] == str(site.id)
    assert body["sub_role"] == "primary_owner"
    assert body["display_name"] == "The Mehra Residence"
    assert body["company_name"] == "Skyline Builders"


async def test_join_without_property_still_succeeds(client, factory):
    """No Property row published yet → display_name is null, redemption still ok."""
    company = await factory.company(name="Acme Co")
    owner = await factory.user(company=company)
    site = await factory.site(company)

    minted = await client.post(
        "/api/v1/homeowner/members",
        json={"site_id": str(site.id)},
        headers=auth(owner),
    )
    join_code = minted.json()["join_code"]

    joined = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": join_code, "phone": "+919812341111", "otp": "000000"},
    )
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["display_name"] is None
    assert body["company_name"] == "Acme Co"
