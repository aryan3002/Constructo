"""READ-ONLY report: companies that may hold builders pooled together (S3).

Before the S3 fix, every unknown phone that signed in became an owner of one
shared company looked up by the name "Default Company" until the web first-run
renamed it. This lists every company that has more than one owner, or is still
named "Default Company", with owner / user / site counts and the owners' phone
numbers masked, so the founder can check production for builders who ended up
inside someone else's company.

It makes NO writes: the session runs in a READ ONLY transaction that is rolled
back at the end.

    cd constructo/backend && uv run python -m scripts.report_shared_companies
    DATABASE_URL="<prod>" uv run python -m scripts.report_shared_companies
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal

PLACEHOLDER_NAME = "Default Company"


@dataclass
class SharedCompany:
    company_id: str
    name: str
    owners: int
    users: int
    sites: int
    owner_phones: list[str] = field(default_factory=list)


def mask_phone(phone: str | None) -> str:
    """Keep the country prefix shape and the last 3 digits: +91•••••••210."""
    if not phone:
        return "-"
    if phone.startswith("deleted:"):
        return "deleted"
    tail = phone[-3:]
    head = phone[:3] if phone.startswith("+") else ""
    hidden = max(len(phone) - len(head) - len(tail), 0)
    return f"{head}{'•' * hidden}{tail}"


_QUERY = text(
    """
    select c.id::text as company_id,
           c.name as name,
           (select count(*) from users u
             where u.company_id = c.id and u.role = 'owner') as owners,
           (select count(*) from users u where u.company_id = c.id) as users,
           (select count(*) from sites s where s.company_id = c.id) as sites,
           (select coalesce(array_agg(u.phone order by u.created_at), '{}')
              from users u
             where u.company_id = c.id and u.role = 'owner') as owner_phones
      from companies c
     where c.name = :placeholder
        or (select count(*) from users u
             where u.company_id = c.id and u.role = 'owner') > 1
     order by owners desc, c.name
    """
)


async def collect(session: AsyncSession) -> list[SharedCompany]:
    rows = (await session.execute(_QUERY, {"placeholder": PLACEHOLDER_NAME})).mappings()
    return [
        SharedCompany(
            company_id=r["company_id"],
            name=r["name"],
            owners=r["owners"],
            users=r["users"],
            sites=r["sites"],
            owner_phones=[mask_phone(p) for p in r["owner_phones"]],
        )
        for r in rows
    ]


async def main() -> None:
    async with SessionLocal() as s:
        await s.execute(text("SET TRANSACTION READ ONLY"))
        try:
            found = await collect(s)
        finally:
            await s.rollback()
    if not found:
        print("No company has more than one owner or the placeholder name.")
        return
    print(f"{len(found)} compan{'y' if len(found) == 1 else 'ies'} to check:\n")
    for c in found:
        print(f"{c.name!r}  ({c.company_id})")
        print(f"  owners={c.owners}  users={c.users}  sites={c.sites}")
        print(f"  owner phones: {', '.join(c.owner_phones) or '-'}\n")


if __name__ == "__main__":
    asyncio.run(main())
