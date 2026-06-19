"""Seed a full CivilArch (CADS) team on the Tripathi Dream Home site so chat
testing shows the RIGHT role per login (not the auto-minted "owner").

Why this exists: POST /auth/login auto-creates an OWNER for any unknown phone,
so logging into a dev DB that lacks your seeded roles makes everyone an owner.
This script upserts the contractor team + client into the existing CivilArch
company so each phone resolves to its real role.

Idempotent — re-running just re-asserts roles/company/assignments. Login for
every seeded user is phone + dev OTP 000000.

    cd constructo/backend && uv run python -m scripts.seed_civilarch_chat
"""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Company, Site, User, UserRole
from app.sites.models import SiteAssignment

COMPANY_ID = UUID("fb181fef-6073-40ab-9941-e99f11c2033c")  # CivilArch (CADS)
SITE_ID = UUID("5432d2d9-9b94-4fc2-b749-816eca049e9d")  # Tripathi Dream Home

# phone -> (role, display name). Architect (…010) + homeowner (…020) already
# live in CivilArch; the homeowner also already has an active member row.
TEAM = [
    ("+919800000011", UserRole.owner, "Rajesh (Owner)"),
    ("+919800000012", UserRole.pm, "Priya (PM)"),
    ("+919800000013", UserRole.supervisor, "Vikas (Site Engineer)"),
    ("+919800000010", UserRole.architect, "Anamika Sagar"),
]


async def _main() -> None:
    async with SessionLocal() as s:
        company = await s.get(Company, COMPANY_ID)
        site = await s.get(Site, SITE_ID)
        if company is None or site is None:
            raise SystemExit("CivilArch company/site not found — wrong DB?")

        for phone, role, name in TEAM:
            user = (
                await s.execute(select(User).where(User.phone == phone))
            ).scalar_one_or_none()
            if user is None:
                user = User(company_id=COMPANY_ID, phone=phone, role=role, name=name)
                s.add(user)
                await s.flush()
            else:
                user.company_id = COMPANY_ID
                user.role = role
                user.name = user.name or name
                user.is_active = True

            # Assign to the Tripathi site (supervisors only see assigned sites;
            # harmless for owner/pm/architect who see all company sites by role).
            existing = (
                await s.execute(
                    select(SiteAssignment).where(
                        SiteAssignment.site_id == SITE_ID,
                        SiteAssignment.user_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                s.add(SiteAssignment(site_id=SITE_ID, user_id=user.id))

        await s.commit()

        print(f"Seeded CivilArch (CADS) / Tripathi Dream Home team in company {COMPANY_ID}")
        rows = (
            await s.execute(
                select(User.phone, User.role, User.name)
                .where(User.company_id == COMPANY_ID)
                .order_by(User.phone)
            )
        ).all()
        for phone, role, name in rows:
            print(f"  {phone}  {role.value:<11} {name or ''}")


if __name__ == "__main__":
    asyncio.run(_main())
