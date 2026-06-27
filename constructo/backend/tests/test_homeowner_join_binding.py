"""A join code issued to a specific phone must bind only to that phone — a
forwarded invite link cannot be redeemed by a different number."""
from app.models.homeowner_member import HomeownerMember, MemberStatus


async def _invite(db_session, site, code, phone=None):
    db_session.add(
        HomeownerMember(
            site_id=site.id, status=MemberStatus.invited, join_code=code, phone=phone
        )
    )
    await db_session.commit()


async def test_join_rejects_phone_other_than_invited(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await _invite(db_session, site, "jb-mismatch", phone="+919810000001")

    resp = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": "jb-mismatch", "phone": "+919810000002", "otp": "000000"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "phone_mismatch"


async def test_join_accepts_the_invited_phone(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await _invite(db_session, site, "jb-match", phone="+919810000001")

    resp = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": "jb-match", "phone": "+919810000001", "otp": "000000"},
    )
    assert resp.status_code == 200


async def test_join_open_invite_without_phone_still_works(client, factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await _invite(db_session, site, "jb-open", phone=None)  # open invite, no bound phone

    resp = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": "jb-open", "phone": "+919810009999", "otp": "000000"},
    )
    assert resp.status_code == 200
