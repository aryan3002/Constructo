"""Seed ONE live clarification into the supervisor's "Asks for you" inbox so the
field → answer loop can be seen end-to-end on a real pilot DB.

Creates a single PENDING Decision (kind=approval) assigned to the SUPERVISOR
(default phone +919000010008), authored "by the designer". It shows up in the
engineer's Tasks / Asks screen (GET /api/v1/approvals?for=me); answering it
(confirm/reject) resolves it — that's the whole clarification lifecycle.

Safe by design:
  - DRY-RUN by default — prints the user / company / site it WOULD touch and the
    decision it WOULD create, but writes nothing. Pass --apply to actually write.
  - IDEMPOTENT — a fixed client_decision_id + deterministic id, so re-running
    --apply upserts the same row (never a duplicate).
  - REVERSIBLE — pass --remove (with --apply) to delete the demo decision.
  - NON-DESTRUCTIVE — only ever touches this ONE seeded row; aborts if the
    supervisor user isn't found (never guesses).

Run from backend/ with DATABASE_URL pointing at the target DB:

    export DATABASE_URL=$(sed -n '8s/^# *DATABASE_URL=//p' .env)
    uv run python -m scripts.seed_clarification_demo                  # dry-run
    uv run python -m scripts.seed_clarification_demo --apply          # write it
    uv run python -m scripts.seed_clarification_demo --remove --apply # delete it
"""

from __future__ import annotations

import argparse
import asyncio
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

import app.models as models  # noqa: F401  register every table on Base.metadata
from app.db import SessionLocal
from app.models import Decision, DecisionKind, DecisionState, Site, User, UserRole
from app.sites.models import SiteAssignment

NS = uuid5(NAMESPACE_URL, "constructo.seed.clarification-demo")
CLIENT_KEY = "demo-clarification-asks-001"

SUPERVISOR_PHONE = "+919000010008"
DESIGNER_PHONE = "+919000010009"

TITLE = "Confirm first-floor slab steel before Thursday's pour"
DETAIL = (
    "Designer: please confirm the bar spacing on the first-floor slab matches "
    "the latest released drawing (Rev 2) before the Thursday pour. Reply here "
    "once you've checked on site."
)


async def _user_by_phone(session, phone: str) -> User | None:
    return (
        await session.execute(select(User).where(User.phone == phone))
    ).scalar_one_or_none()


async def main(apply: bool, remove: bool, phone: str) -> None:
    async with SessionLocal() as session:
        sup = await _user_by_phone(session, phone)
        if sup is None:
            print(f"✗ No user found with phone {phone}. Aborting (not guessing).")
            return
        if sup.role is not UserRole.supervisor:
            print(f"⚠ User {phone} has role {sup.role}, expected supervisor. Continuing.")

        designer = await _user_by_phone(session, DESIGNER_PHONE)

        # A site the supervisor is assigned to (so the ask is realistic + in scope);
        # falls back to site-less (which is always visible in the company).
        site_id: UUID | None = (
            await session.execute(
                select(SiteAssignment.site_id)
                .where(SiteAssignment.user_id == sup.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        site = await session.get(Site, site_id) if site_id is not None else None

        decision_id = uuid5(NS, f"{sup.company_id}:{CLIENT_KEY}")
        existing = await session.get(Decision, decision_id)

        print("— target —")
        print(f"  supervisor : {sup.name} ({phone})  user_id={sup.id}")
        print(f"  company_id : {sup.company_id}")
        print(f"  site       : {site.name if site else '(site-less, always visible)'} ({site_id})")
        print(f"  raised_by  : {designer.name if designer else '(unknown — left null)'}")
        print(f"  decision   : {decision_id}  (exists={existing is not None})")

        if remove:
            if existing is None:
                print("— remove — nothing to remove.")
                return
            if not apply:
                print("— DRY RUN — would DELETE the demo decision. Pass --apply.")
                return
            await session.delete(existing)
            await session.commit()
            print("✓ Removed the demo clarification.")
            return

        if not apply:
            print("— DRY RUN — would create/upsert ONE pending clarification (above).")
            print("  Pass --apply to write it; --remove --apply to delete it later.")
            return

        if existing is None:
            session.add(
                Decision(
                    id=decision_id,
                    company_id=sup.company_id,
                    client_decision_id=CLIENT_KEY,
                    site_id=site_id,
                    kind=DecisionKind.approval,
                    title=TITLE,
                    detail=DETAIL,
                    raised_by=designer.id if designer else None,
                    assigned_to=sup.id,
                    state=DecisionState.pending,
                )
            )
            print("✓ Created the demo clarification (pending, assigned to the supervisor).")
        else:
            existing.state = DecisionState.pending
            existing.title = TITLE
            existing.detail = DETAIL
            existing.assigned_to = sup.id
            print("✓ Upserted the demo clarification (reset to pending).")
        await session.commit()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--apply", action="store_true", help="actually write (default: dry-run)")
    p.add_argument("--remove", action="store_true", help="delete the demo decision instead")
    p.add_argument("--phone", default=SUPERVISOR_PHONE, help="supervisor login phone")
    args = p.parse_args()
    asyncio.run(main(args.apply, args.remove, args.phone))
