"""scripts.report_shared_companies: finds pooled companies, masks phones, writes nothing."""
from sqlalchemy import func, select

from app.models import Company, User, UserRole
from scripts.report_shared_companies import collect, mask_phone


def test_mask_phone_hides_the_middle():
    assert mask_phone("+919800000123") == "+91•••••••123"
    assert mask_phone("deleted:abc") == "deleted"
    assert mask_phone(None) == "-"


async def test_collect_lists_pooled_and_placeholder_companies(db_session, factory):
    pooled = await factory.company(name="Default Company")
    await factory.user(company=pooled, role=UserRole.owner, phone="+919811111111")
    await factory.user(company=pooled, role=UserRole.owner, phone="+919822222222")
    await factory.site(pooled)
    two_owners = await factory.company(name="Two Owners Ltd")
    await factory.user(company=two_owners, role=UserRole.owner)
    await factory.user(company=two_owners, role=UserRole.owner)
    fine = await factory.company(name="Solo Builders")
    await factory.user(company=fine, role=UserRole.owner)
    await factory.user(company=fine, role=UserRole.pm)
    await db_session.flush()

    before = (await db_session.execute(select(func.count()).select_from(User))).scalar()
    rows = {r.company_id: r for r in await collect(db_session)}
    after = (await db_session.execute(select(func.count()).select_from(User))).scalar()

    assert before == after
    assert str(fine.id) not in rows
    p = rows[str(pooled.id)]
    assert (p.owners, p.users, p.sites) == (2, 2, 1)
    assert p.owner_phones == ["+91•••••••111", "+91•••••••222"]
    assert rows[str(two_owners.id)].owners == 2
    assert (await db_session.get(Company, pooled.id)).name == "Default Company"
