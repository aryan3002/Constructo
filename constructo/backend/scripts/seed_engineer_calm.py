"""Seed the Site-Engineer "Calm Cockpit" demo — company "CivilArch (Field Demo)".

Run from the backend dir (backend/.env pointing at your dev DB):

    uv run python -m scripts.seed_engineer_calm

Creates one company with a SITE ENGINEER ("Lokesh", role=supervisor) plus an
owner + PM/designer to author the asks. Lokesh is ASSIGNED (SiteAssignment) to
four sites so `effective_visible_site_ids` actually returns them — without that a
supervisor sees nothing. Lights up the new engineer surface:

  - Home / Capture: his assigned sites + today's to-do (action items).
  - Tasks: asks pointed at him (decisions assigned_to Lokesh).
  - Audit: two REQUESTED audits to run (named sections, empty → he conducts).
  - Drawings: released revisions incl. one superseded chain.

IDEMPOTENT: deterministic uuid5 ids, so re-running upserts in place. Login as the
engineer with phone +919810000010 and dev OTP 000000.

NOTE: like ``seed_owner_calm``, this runs ``Base.metadata.create_all`` (checkfirst)
so the Labs audit tables exist even on a dev DB whose Alembic head has diverged
from this branch. On a clean DB run ``alembic upgrade head`` instead.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

import app.models as models  # noqa: F401  register every table on Base.metadata
from app.db import Base, SessionLocal, engine
from app.models import (
    ActionItem,
    ActionItemStatus,
    Audit,
    AuditSection,
    AuditStatus,
    Company,
    Decision,
    DecisionKind,
    DecisionState,
    DrawingKind,
    PublishedDrawing,
    Site,
    User,
    UserRole,
)
from app.sites.models import SiteAssignment

NS = uuid5(NAMESPACE_URL, "constructo.seed.civilarch-field-demo")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


NOW = datetime.now(UTC)
TODAY = NOW.date()


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


# (key, name, location, stage)
SITES = [
    ("kutumb", "Kutumb Nivaas", "Gomti Nagar, Lucknow", "Finishing"),
    ("sharma", "Sharma Residence", "Indira Nagar, Lucknow", "Interiors"),
    ("verma", "Verma Duplex", "Aliganj, Lucknow", "Structure"),
    ("agarwal", "Agarwal Villa", "Mahanagar, Lucknow", "Snagging"),
]


async def seed() -> dict[str, int]:
    # Ensure all tables (incl. the Labs audit ones) exist on this dev DB.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    counts: dict[str, int] = {}
    async with SessionLocal() as session:
        company = await _upsert(session, Company, _id("co"), name="CivilArch (Field Demo)")
        await session.flush()

        # The engineer (Lokesh) + the people who ask him things.
        lokesh = await _upsert(
            session, User, _id("u", "lokesh"), company_id=company.id,
            phone="+919810000010", role=UserRole.supervisor,
            name="Lokesh Verma (Site Engineer)", language="en",
        )
        owner = await _upsert(
            session, User, _id("u", "owner"), company_id=company.id,
            phone="+919810000011", role=UserRole.owner,
            name="Saurabh Tripathi (Owner)", language="en",
        )
        designer = await _upsert(
            session, User, _id("u", "anamika"), company_id=company.id,
            phone="+919810000012", role=UserRole.architect,
            name="Anamika Sagar (Designer)", language="en",
        )
        await session.flush()
        counts["users"] = 3

        sites = {}
        for skey, name, location, _stage in SITES:
            site = await _upsert(
                session, Site, _id("site", skey), company_id=company.id,
                name=name, location=location, type="residential", status="active",
            )
            sites[skey] = site
            # The assignment that makes the engineer actually SEE the site.
            await _upsert(
                session, SiteAssignment, _id("asg", skey),
                site_id=site.id, user_id=lokesh.id,
            )
        await session.flush()
        counts["sites"] = len(sites)

        # --- Today's work: action items assigned to Lokesh (home to-do) ---
        def todo(key, skey, title, status=ActionItemStatus.open, detail=None):
            return _upsert(
                session, ActionItem, _id("todo", key), company_id=company.id,
                site_id=sites[skey].id, title=title, detail=detail,
                created_by=owner.id, created_by_ai=False, assignee_id=lokesh.id,
                status=status, due_on=TODAY,
            )

        await todo("t1", "verma", "Pour 2nd-floor slab")
        await todo("t2", "kutumb", "Start kitchen wall plaster")
        await todo("t3", "sharma", "Waterproofing water-test — master bath")
        await todo("t4", "sharma", "Mark out wardrobe positions", ActionItemStatus.done)
        await todo("t5", "agarwal", "Snag walkthrough with PM")
        counts["action_items"] = 5

        # --- Asks for you: decisions assigned to Lokesh (approvals?for=me) ---
        def ask(key, kind, title, skey, raiser, *, due_days, detail=None):
            return _upsert(
                session, Decision, _id("ask", key), company_id=company.id,
                site_id=sites[skey].id, kind=kind, title=title, detail=detail,
                raised_by=raiser.id, assigned_to=lokesh.id, state=DecisionState.pending,
                sla_due_at=NOW + timedelta(days=due_days),
            )

        await ask("a1", DecisionKind.generic, "Confirm beam B4 grouting is done", "kutumb",
                  owner, due_days=0, detail="Ground floor · Beam B4 — confirm non-shrink "
                  "grouting before plaster starts.")
        await ask("a2", DecisionKind.homeowner_question, "Confirm wardrobe laminate code",
                  "sharma", designer, due_days=0,
                  detail="Daughter bedroom — read the exact code off the sample on site.")
        await ask("a3", DecisionKind.generic, "Confirm 2nd-floor slab progress %", "verma",
                  owner, due_days=0, detail="Update read 80% but the photo looked part-poured.")
        await ask("a4", DecisionKind.generic, "Upload 7-day cube test result", "verma",
                  designer, due_days=-1, detail="7-day cube results pending against the slab pour.")
        counts["asks"] = 4

        # --- Audits to run: REQUESTED audits with named (empty) sections ---
        def request_audit(key, skey):
            return _upsert(
                session, Audit, _id("audit", key), company_id=company.id,
                site_id=sites[skey].id, status=AuditStatus.requested, score=None,
                requested_by=owner.id, conducted_by=None, scheduled_for="today",
                requested_at=NOW - timedelta(hours=4),
            )

        audit_specs = [
            ("au1", "kutumb", ["Flooring", "Painting"]),
            ("au2", "verma", ["Civil work"]),
        ]
        for akey, skey, section_names in audit_specs:
            audit = await request_audit(akey, skey)
            await session.flush()
            for pos, sname in enumerate(section_names):
                await _upsert(
                    session, AuditSection, _id("sec", akey, sname), audit_id=audit.id,
                    name=sname, position=pos, score=None,
                    pass_count=0, obs_count=0, fail_count=0, items=[],
                )
        counts["audits_requested"] = len(audit_specs)

        # --- Drawings: released revisions incl. one superseded chain ---
        def drawing(key, skey, title, version, kind, *, supersedes=None, change_note=None,
                    days_ago=4):
            return _upsert(
                session, PublishedDrawing, _id("dwg", key), site_id=sites[skey].id,
                title=title, version=version, file_url=f"https://demo.local/dwg/{key}.pdf",
                kind=kind, published_by=designer.id, change_note=change_note,
                plain_summary_en=None, plain_summary_hi=None, supersedes_id=supersedes,
            )

        kitchen_b = await drawing("d_kit_b", "kutumb", "Kitchen layout", "B", DrawingKind.plan,
                                  days_ago=11)
        await session.flush()
        await drawing("d_kit_c", "kutumb", "Kitchen layout", "C", DrawingKind.plan,
                      supersedes=kitchen_b.id, change_note="Sink moved 300mm; island widened.",
                      days_ago=3)
        await drawing("d_elec", "kutumb", "Electrical layout", "B", DrawingKind.electrical)
        await drawing("d_plumb", "kutumb", "Plumbing riser", "A", DrawingKind.plumbing)
        await drawing("d_slab", "verma", "Slab reinforcement", "A", DrawingKind.structural)
        await drawing("d_wrd", "sharma", "Wardrobe detail", "A", DrawingKind.section)
        await drawing("d_foyer", "agarwal", "Foyer flooring layout", "B", DrawingKind.plan)
        counts["drawings"] = 7

        await session.commit()
    return counts


if __name__ == "__main__":
    result = asyncio.run(seed())
    print("Seeded Site-Engineer Calm-Cockpit demo:", result)
    print("Login: phone +919810000010 · OTP 000000")
