"""Enrich the QA company (Tripathi Auto Constructions / Tiwari Dream House) with
the data the AI features need to actually fire during a QA run: a site location,
a headcount baseline, today's + yesterday's site events (including a below-
baseline attendance and an invoice that mismatches its delivery), two decisions
(one overdue), two permits (one near expiry), a DRAFT DPR, filled-in user names,
and the supervisor's site assignment. Finally it builds the owner brief and
indexes events so search/@ask work immediately.

Idempotent: deterministic uuid5 ids upsert in place; the DPR is created only if a
draft for today doesn't already exist. Safe to run repeatedly.

    cd constructo/backend && uv run python -m scripts.seed_qa_company

Targets the EXISTING company/site by name (errors if they're absent — wrong DB).
Login for every user is phone + dev OTP 000000.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.brief.generate import build_brief
from app.db import SessionLocal
from app.dpr.draft import draft_dpr
from app.models import (
    Company,
    Decision,
    DecisionKind,
    DecisionState,
    Dpr,
    DprStatus,
    Permit,
    PermitStatus,
    Site,
    SiteBaseline,
    SiteEventModel,
    User,
)
from app.search.index import index_all_unindexed
from app.sites.models import SiteAssignment

COMPANY_NAME = "Tripathi Auto Constructions"
SITE_NAME = "Tiwari Dream House"

# Deterministic id namespace so re-runs upsert instead of duplicating.
NS = uuid5(NAMESPACE_URL, "constructo.seed.qa-company")

TODAY = datetime.now(UTC).date()
NOW = datetime.now(UTC)
YESTERDAY = TODAY - timedelta(days=1)

# Fallback display names for any user whose name is still null.
NAME_BY_ROLE = {
    "owner": "Rajesh (Owner)",
    "pm": "Akhanda (PM)",
    "architect": "Munna bhaiya (Architect)",
    "supervisor": "Satvik (Supervisor)",
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update a row by primary-key id (idempotent seeding)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for key, value in fields.items():
            setattr(obj, key, value)
    return obj


async def seed() -> dict[str, int]:
    counts: dict[str, int] = {}
    async with SessionLocal() as s:
        company = (
            await s.execute(select(Company).where(Company.name == COMPANY_NAME))
        ).scalar_one_or_none()
        if company is None:
            raise SystemExit(f"Company {COMPANY_NAME!r} not found — wrong DB?")
        site = (
            await s.execute(
                select(Site).where(
                    Site.company_id == company.id, Site.name == SITE_NAME
                )
            )
        ).scalar_one_or_none()
        if site is None:
            raise SystemExit(f"Site {SITE_NAME!r} not found — wrong DB?")

        # --- Site location + headcount baseline ----------------------------
        if not site.location:
            site.location = "Gomti Nagar, Lucknow"

        users = (
            await s.execute(select(User).where(User.company_id == company.id))
        ).scalars().all()
        by_role = {u.role: u for u in users}
        owner = by_role.get("owner")
        supervisor = by_role.get("supervisor")

        # Fill any null names so screens don't render "—".
        for u in users:
            if not u.name:
                u.name = NAME_BY_ROLE.get(str(u.role), str(u.role))

        await _upsert(
            s,
            SiteBaseline,
            _id("baseline"),
            site_id=site.id,
            expected_daily_headcount=20,
            notes="QA baseline",
            updated_by=owner.id if owner else None,
        )

        # --- Supervisor site assignment ------------------------------------
        if supervisor:
            exists = (
                await s.execute(
                    select(SiteAssignment).where(
                        SiteAssignment.site_id == site.id,
                        SiteAssignment.user_id == supervisor.id,
                    )
                )
            ).scalar_one_or_none()
            if exists is None:
                s.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))

        # --- Site events (today + yesterday) -------------------------------
        # Below-baseline attendance fires the labor-shortfall risk; the invoice
        # bills 60 vs 50 delivered → reconcile/approval surfaces.
        events = [
            ("att", "attendance", TODAY, "aaj sirf 12 mazdoor aaye",
             {"headcount": 12, "raw_phrase": "12 mazdoor"}),
            ("del", "material_delivery", YESTERDAY, "50 bori cement aaya ACC se",
             {"material": "cement", "quantity": 50, "unit": "bags", "vendor": "ACC Limited"}),
            ("inv", "invoice_received", TODAY, "ACC ka bill: 60 bags, Rs 36000",
             {"vendor": "ACC Limited", "material": "cement", "quantity": 60,
              "amount": 36000, "currency": "INR", "invoice_number": "ACC/2026/77"}),
            ("prog", "progress_update", TODAY, "pehli manzil ka slab 70% ho gaya",
             {"percent": 70, "area": "first floor slab"}),
            ("iss", "issue", TODAY, "paani ki supply band, concrete ka kaam ruka",
             {"category": "water", "blocking": True}),
        ]
        for key, event_type, on, summary, fields in events:
            await _upsert(
                s,
                SiteEventModel,
                _id("event", key),
                site_id=site.id,
                event_type=event_type,
                occurred_on=on,
                summary=summary,
                fields=fields,
                confidence=0.9,
                needs_clarification=False,
                source_message_ids=[],
                version=1,
            )
        counts["events"] = len(events)

        # --- Decisions (one pending, one overdue) --------------------------
        await _upsert(
            s,
            Decision,
            _id("decision", "invoice"),
            company_id=company.id,
            site_id=site.id,
            kind=DecisionKind.approval,
            title="Approve ACC cement invoice (₹36,000)?",
            detail="Invoice bills 60 bags but the site logged 50. ~₹6,000 at risk.",
            raised_by=None,
            assigned_to=owner.id if owner else None,
            state=DecisionState.pending,
            sla_due_at=NOW + timedelta(days=1),
            evidence_event_ids=[_id("event", "inv"), _id("event", "del")],
        )
        await _upsert(
            s,
            Decision,
            _id("decision", "overdue"),
            company_id=company.id,
            site_id=site.id,
            kind=DecisionKind.approval,
            title="Confirm next week's slab schedule?",
            detail="Owner to confirm the schedule with the team.",
            raised_by=None,
            assigned_to=owner.id if owner else None,
            state=DecisionState.pending,
            sla_due_at=NOW - timedelta(days=1),  # OVERDUE -> sla sweep escalates
        )
        counts["decisions"] = 2

        # --- Permits (one near expiry, one stale review) -------------------
        await _upsert(
            s,
            Permit,
            _id("permit", "bplan"),
            company_id=company.id,
            site_id=site.id,
            permit_type="Building Plan Approval",
            authority="LDA",
            status=PermitStatus.approved,
            applied_on=TODAY - timedelta(days=200),
            decided_on=TODAY - timedelta(days=170),
            expiry_on=TODAY + timedelta(days=12),  # near expiry -> sweep flags it
            reference_no="LDA/BP/2026/3391",
            notes="Renew before expiry",
            created_by=owner.id if owner else None,
        )
        await _upsert(
            s,
            Permit,
            _id("permit", "fire"),
            company_id=company.id,
            site_id=site.id,
            permit_type="NOC-fire",
            authority="UP Fire & Emergency Services",
            status=PermitStatus.under_review,
            applied_on=TODAY - timedelta(days=40),  # stale review -> sweep flags it
            reference_no="UPFS/NOC/2026/118",
            created_by=owner.id if owner else None,
        )
        counts["permits"] = 2

        await s.commit()

        # --- Draft DPR for today (guaranteed draft, idempotent) ------------
        # draft_dpr() assembles from the events above but does NOT persist; mirror
        # the router's persistence. QA needs a DRAFT to exercise the ConfirmCard
        # (AI-proposes → PM-sends) flow, so re-draft today's row back to draft even
        # if a prior run/QA already sent it (this is a QA seed, never prod).
        drafted = await draft_dpr(s, site.id, TODAY, llm=None)
        existing_dpr = (
            await s.execute(
                select(Dpr).where(
                    Dpr.site_id == site.id, Dpr.report_date == TODAY
                )
            )
        ).scalar_one_or_none()
        if existing_dpr is None:
            s.add(
                Dpr(
                    site_id=site.id,
                    report_date=TODAY,
                    sections=drafted.sections,
                    status=DprStatus.draft,
                    evidence_event_ids=drafted.evidence_event_ids,
                )
            )
            counts["dpr_drafted"] = 1
        else:
            existing_dpr.sections = drafted.sections
            existing_dpr.evidence_event_ids = drafted.evidence_event_ids
            existing_dpr.status = DprStatus.draft
            existing_dpr.sent_at = None
            counts["dpr_drafted"] = 1
        await s.commit()

        # --- Owner brief (yesterday + today) + index for @ask/search -------
        for brief_day in (YESTERDAY, TODAY):
            await build_brief(s, company.id, brief_day, llm=None)
        await s.commit()
        counts["briefs"] = 2

        counts["indexed"] = await index_all_unindexed(s)
        await s.commit()

    return counts


def main() -> None:
    counts = asyncio.run(seed())
    print("✅ Enriched QA company 'Tripathi Auto Constructions':")
    for k, v in counts.items():
        print(f"   - {k}: {v}")
    print("\nLogin (phone + dev OTP 000000):")
    print("   - owner       +919055905818")
    print("   - pm          +919011901818  Akhanda")
    print("   - architect   +919022902818  Munna bhaiya")
    print("   - supervisor  +919066906818  Satvik")
    print("\nNow re-run the QA sessions against this seeded data.")


if __name__ == "__main__":
    main()
