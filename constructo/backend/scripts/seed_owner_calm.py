"""Seed the owner "Calm Cockpit" demo — company "CivilArch (Owner Demo)".

Run from the backend dir (backend/.env pointing at your dev DB):

    uv run python -m scripts.seed_owner_calm

Creates one company with an owner (+ PM + a site engineer "Lokesh"), 4 sites
with baselines + attendance, a realistic spread of decisions (2 overdue, 3 open,
3 resolved for the log), material specs across sites, ONE completed site audit
(sections + findings) and ONE SiteSync survey. This lights up the new owner
surface: Brief (decisions + site strip + spec summary + log), Sites, Specs, and
the Audit Hub / Audit Site / Survey screens.

IDEMPOTENT: deterministic uuid5 ids, so re-running upserts in place. Login as the
owner with phone +919810000001 and dev OTP 000000.

NOTE: this script also runs ``Base.metadata.create_all`` (checkfirst) so the
Labs audit/survey tables exist even on a dev DB whose Alembic head has diverged
from this branch. On a clean DB just run ``alembic upgrade head`` instead.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import app.models as models  # noqa: F401  register every table on Base.metadata
from app.db import Base, SessionLocal, engine
from app.models import (
    Audit,
    AuditFinding,
    AuditSection,
    AuditStatus,
    Company,
    Component,
    ComponentStatus,
    Decision,
    DecisionKind,
    DecisionState,
    FindingSeverity,
    FindingStatus,
    Site,
    SiteBaseline,
    SiteEventModel,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
    Survey,
    SurveyStatus,
    User,
    UserRole,
)

NS = uuid5(NAMESPACE_URL, "constructo.seed.civilarch-owner-demo")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


NOW = datetime.now(UTC)
TODAY = NOW.date()
BRIEF_DAY = TODAY - timedelta(days=1)


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


SITES = [
    ("kutumb", "Kutumb Nivaas", "Gomti Nagar, Lucknow", 18, 19),
    ("sharma", "Sharma Residence", "Indira Nagar, Lucknow", 12, 8),
    ("verma", "Verma Duplex", "Aliganj, Lucknow", 22, 22),
    ("agarwal", "Agarwal Villa", "Mahanagar, Lucknow", 10, 6),
]


async def seed() -> dict[str, int]:
    # Ensure all tables (incl. the Labs audit/survey ones) exist on this dev DB.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    counts: dict[str, int] = {}
    async with SessionLocal() as session:
        company = await _upsert(session, Company, _id("co"), name="CivilArch (Owner Demo)")
        await session.flush()

        owner = await _upsert(
            session, User, _id("u", "owner"), company_id=company.id,
            phone="+919810000001", role=UserRole.owner,
            name="Aryan Tripathi (Owner)", language="en",
        )
        pm = await _upsert(
            session, User, _id("u", "pm"), company_id=company.id,
            phone="+919810000002", role=UserRole.pm,
            name="Anamika Sagar (PM)", language="en",
        )
        lokesh = await _upsert(
            session, User, _id("u", "lokesh"), company_id=company.id,
            phone="+919810000003", role=UserRole.supervisor,
            name="Lokesh Verma (Site Engineer)", language="hi",
        )
        await session.flush()
        counts["users"] = 3

        sites = {}
        for skey, name, location, baseline, present in SITES:
            site = await _upsert(
                session, Site, _id("site", skey), company_id=company.id,
                name=name, location=location, type="residential", status="active",
            )
            sites[skey] = site
            await _upsert(
                session, SiteBaseline, _id("bl", skey), site_id=site.id,
                expected_daily_headcount=baseline, notes="Demo baseline", updated_by=owner.id,
            )
            # Yesterday's attendance (drives /dashboard/home status + counts).
            await _upsert(
                session, SiteEventModel, _id("att", skey), site_id=site.id,
                event_type="attendance", occurred_on=BRIEF_DAY,
                summary=f"{present} mazdoor aaye",
                fields={"headcount": present, "raw_phrase": f"{present} mazdoor"},
                confidence=0.95, needs_clarification=False, source_message_ids=[],
            )
        await session.flush()
        counts["sites"] = len(sites)

        # --- Decisions: 2 overdue + 3 open (pending) + 3 resolved (the log) ---
        def dec(key, kind, title, skey, state, *, due_days=None, resolved_days=None,
                detail=None, evidence=0):
            sla = (NOW + timedelta(days=due_days)) if due_days is not None else None
            resolved = (NOW - timedelta(days=resolved_days)) if resolved_days is not None else None
            note = "Approved by owner" if state == DecisionState.resolved else None
            return _upsert(
                session, Decision, _id("dec", key),
                company_id=company.id, site_id=sites[skey].id, kind=kind, title=title,
                detail=detail, raised_by=pm.id, assigned_to=owner.id, state=state,
                sla_due_at=sla, resolved_at=resolved, resolution_note=note,
                evidence_event_ids=[uuid4() for _ in range(evidence)],
            )

        await dec("d1", DecisionKind.approval, "Kitchen tile Rev C — release for laying?",
                  "kutumb", DecisionState.pending, due_days=-2,
                  detail="Kutumb Nivaas · Kitchen", evidence=2)
        await dec("d2", DecisionKind.hold_payment, "Wardrobe laminate invoice ₹84,000",
                  "sharma", DecisionState.pending, due_days=-1,
                  detail="Sharma Residence · Daughter bedroom", evidence=1)
        await dec("d3", DecisionKind.approval, "Daughter bedroom wardrobe finish",
                  "sharma", DecisionState.pending, due_days=1,
                  detail="Sharma Residence · Bedroom 2")
        await dec("d4", DecisionKind.homeowner_question, "2nd-floor slab progress — confirm?",
                  "verma", DecisionState.pending, due_days=0,
                  detail="Verma Duplex · 2nd-floor slab")
        await dec("d5", DecisionKind.generic, "Master bath waterproofing sign-off",
                  "kutumb", DecisionState.pending, due_days=2,
                  detail="Kutumb Nivaas · Master bath")
        await dec("d6", DecisionKind.approval, "Living vitrified flooring approved",
                  "verma", DecisionState.resolved, resolved_days=1,
                  detail="Verma Duplex · Living")
        await dec("d7", DecisionKind.approval, "Foyer marble selection cleared",
                  "agarwal", DecisionState.resolved, resolved_days=2,
                  detail="Agarwal Villa · Foyer")
        await dec("d8", DecisionKind.generic, "MBR flooring cleared",
                  "kutumb", DecisionState.resolved, resolved_days=3,
                  detail="Kutumb Nivaas · Master bedroom")
        counts["decisions"] = 8

        # --- Specs (Site -> Space -> Component -> Spec) ---
        comps = {}
        for skey, site in sites.items():
            space = await _upsert(
                session, Space, _id("space", skey), site_id=site.id,
                name="Interiors", kind=SpaceKind.zone, order=0,
            )
            await session.flush()
            comps[skey] = await _upsert(
                session, Component, _id("comp", skey), space_id=space.id,
                name="Finishes", kind="finish", status=ComponentStatus.in_progress,
            )
        await session.flush()

        def spec(key, skey, label, status, code, qty=None, unit=None):
            return _upsert(
                session, Spec, _id("spec", key), company_id=company.id,
                site_id=sites[skey].id, component_id=comps[skey].id, material_id=None,
                label=label, qty=Decimal(qty) if qty else None, unit=unit,
                approval_status=status, client_final_code=code, assignee_id=pm.id,
            )

        await spec("s1", "kutumb", "Kitchen floor tile", SpecApprovalStatus.pending,
                   "TIL-KIT-01", "420", "sqft")
        await spec("s2", "kutumb", "Master bath wall tile", SpecApprovalStatus.approved,
                   "TIL-BTH-03", "180", "sqft")
        await spec("s3", "kutumb", "Living laminate", SpecApprovalStatus.rejected,
                   "LAM-LIV-02", "260", "sqft")
        await spec("s4", "sharma", "Wardrobe laminate", SpecApprovalStatus.pending, "LAM-WRD-01")
        await spec("s5", "sharma", "Kitchen counter granite", SpecApprovalStatus.pending,
                   "GRN-CTR-01", "32", "sqft")
        await spec("s6", "verma", "Staircase granite treads", SpecApprovalStatus.approved,
                   "GRN-STR-01")
        counts["specs"] = 6

        # --- Audit (completed) on Kutumb Nivaas ---
        audit = await _upsert(
            session, Audit, _id("audit", "kutumb"), company_id=company.id,
            site_id=sites["kutumb"].id, status=AuditStatus.completed, score=88,
            requested_by=owner.id, conducted_by=lokesh.id, scheduled_for="today",
            requested_at=NOW - timedelta(days=3), conducted_at=NOW - timedelta(days=2),
        )

        def item(label, status):
            return {"label": label, "status": status}

        await _upsert(
            session, AuditSection, _id("sec", "civil"), audit_id=audit.id, name="Civil work",
            position=0, score=92, pass_count=30, obs_count=3, fail_count=1,
            items=[item("RCC slab cover & spacing", "ok"), item("Column verticality", "ok"),
                   item("Beam B4 honeycombing", "fail"), item("Construction joints", "obs")],
        )
        await _upsert(
            session, AuditSection, _id("sec", "plumb"), audit_id=audit.id,
            name="Plumbing & sanitary", position=1, score=85, pass_count=18,
            obs_count=2, fail_count=0,
            items=[item("Slope to traps", "ok"), item("Pipe support spacing", "obs")],
        )
        await _upsert(
            session, AuditSection, _id("sec", "elec"), audit_id=audit.id, name="Electrical",
            position=2, score=80, pass_count=22, obs_count=4, fail_count=1,
            items=[item("Earthing continuity", "ok"), item("Conduit in slab", "fail"),
                   item("Load balancing", "obs")],
        )
        await _upsert(
            session, AuditFinding, _id("find", "f1"), audit_id=audit.id,
            company_id=company.id, site_id=sites["kutumb"].id,
            title="Honeycombing on RCC beam B4", severity=FindingSeverity.major,
            room="Ground floor", location="Beam B4", status=FindingStatus.open, assignee_id=None,
            note="Grade-2 honeycombing ~150 mm. Needs non-shrink grouting before plaster.",
            photo_url=None,
        )
        await _upsert(
            session, AuditFinding, _id("find", "f2"), audit_id=audit.id,
            company_id=company.id, site_id=sites["kutumb"].id,
            title="Conduit pulled through structural slab", severity=FindingSeverity.minor,
            room="First floor", location="Slab S2", status=FindingStatus.open, assignee_id=None,
            note="Re-route the conduit before the next pour; flagged for the electrician.",
            photo_url=None,
        )
        counts["audits"] = 1

        # --- Survey (SiteSync first-visit, submitted) ---
        await _upsert(
            session, Survey, _id("survey", "aryan"), company_id=company.id, site_id=None,
            name="Aryan Dream House", code="Cag14244", status=SurveyStatus.submitted,
            risk_score=38, filled_pct=85, photo_count=7, area="2027 sq ft",
            client_name="Aryan", engineer_id=lokesh.id, architect_name="Anamika Sagar",
            project_type="Residential", address="DLF Garden City, Mohanlalganj, Lucknow",
            gps="26.821982, 81.013240",
            plot={"no": "432", "facing": "South", "corner": "Yes", "actual": "1530 sq ft",
                  "shape": "Irregular", "far": "2.0", "coverage": "60%"},
            approvals=["Map approval", "NOC", "Fire", "Lift"], approval_status="Not applied",
            conditions=[["Soil type", "Black soil"], ["Water table", "350 ft"],
                        ["Filling", "Required"], ["Slope", "North-East"],
                        ["Plot level", "3 ft below road"]],
            risks=[{"name": "Flood", "level": "Low"}, {"name": "Water logging", "level": "Low"},
                   {"name": "Noise", "level": "Medium"}, {"name": "Pollution", "level": "Medium"}],
            requirement="4 BHK house with duplex",
            ai_analysis=(
                "Moderate risk. The plot sits ~3 ft below road level, so budget for "
                "filling and a raised plinth. Black soil needs an engineered foundation "
                "(under-reamed piles or a raft). Map/NOC/Fire approvals are not yet applied "
                "— start these before mobilising to avoid a stop-work."
            ),
            submitted_at=NOW - timedelta(days=2),
        )
        counts["surveys"] = 1

        await session.commit()
    return counts


if __name__ == "__main__":
    result = asyncio.run(seed())
    print("Seeded owner Calm-Cockpit demo:", result)
    print("Login: phone +919810000001 · OTP 000000")
