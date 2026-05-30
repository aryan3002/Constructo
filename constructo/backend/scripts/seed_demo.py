"""Seed a full, demoable Constructo company — "Sunrise Builders".

Run from the backend dir (with backend/.env pointing at your dev DB and the
schema migrated — ``uv run alembic upgrade head``):

    uv run python -m scripts.seed_demo

It creates one company with an owner + one user of every role, 2-3 sites with
baselines, a realistic spread of Hindi/Hinglish SiteEvents (including an invoice
that MISMATCHES a delivery), a couple of payments, two permits (one near
expiry), and two decisions (one open, one overdue so the SLA sweep escalates
it). Finally it indexes the events (FakeEmbeddings offline) so search works
immediately.

IDEMPOTENT: every row uses a deterministic uuid5 id, so re-running upserts in
place rather than duplicating. Safe to run repeatedly.

NOTE on the "auth/invite path": the owner is the company's first user (exactly
what POST /auth/login mints for a new phone). Teammates are created directly as
their end-state User rows (the state invite-acceptance produces) plus one
PENDING Invite row so the invite UI has something to show. Login for any seeded
user is phone + dev OTP ``000000``.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from app.db import SessionLocal
from app.invites.models import Invite, InviteStatus
from app.models import (
    Company,
    Decision,
    DecisionKind,
    DecisionState,
    Payment,
    PaymentDirection,
    PaymentStatus,
    Permit,
    PermitStatus,
    Site,
    SiteBaseline,
    SiteEventModel,
    User,
    UserRole,
    WhatsappGroup,
)
from app.search.index import index_all_unindexed
from app.sites.models import SiteAssignment

# Deterministic id namespace so re-runs upsert instead of duplicating.
NS = uuid5(NAMESPACE_URL, "constructo.seed.sunrise-builders")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


TODAY = datetime.now(UTC).date()
NOW = datetime.now(UTC)
# The owner "morning brief" (GET /dashboard/home) defaults to YESTERDAY (UTC) —
# it reports the previous day's site activity. Anchor the day's events here so
# the default brief is populated (and the Site B labor-shortfall risk fires).
BRIEF_DAY = TODAY - timedelta(days=1)


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


# Six demo people — fixed phones so the demoer can log in as any role (OTP 000000).
PEOPLE = [
    ("owner", UserRole.owner, "+919800000001", "Rajesh Gupta (Owner)"),
    ("pm", UserRole.pm, "+919800000002", "Anita Rao (PM)"),
    ("supervisor", UserRole.supervisor, "+919800000003", "Vikram Singh (Supervisor)"),
    ("accountant", UserRole.accountant, "+919800000004", "Priya Nair (Accountant)"),
    ("procurement", UserRole.procurement, "+919800000005", "Imran Khan (Procurement)"),
    ("labor_contractor", UserRole.labor_contractor, "+919800000006", "Ramesh Yadav (Mukadam)"),
]


async def seed() -> dict[str, int]:
    counts: dict[str, int] = {}
    async with SessionLocal() as session:
        # --- Company -------------------------------------------------------
        company = await _upsert(session, Company, _id("company"), name="Sunrise Builders")
        await session.flush()

        # --- Users (owner + one of each role) ------------------------------
        users: dict[str, User] = {}
        for key, role, phone, name in PEOPLE:
            users[key] = await _upsert(
                session,
                User,
                _id("user", key),
                company_id=company.id,
                phone=phone,
                role=role,
                name=name,
                language="hi" if key in {"supervisor", "labor_contractor"} else "en",
            )
        owner = users["owner"]
        await session.flush()
        counts["users"] = len(users)

        # One pending invite so the invite/team UI has a row to show.
        await _upsert(
            session,
            Invite,
            _id("invite", "pending-pm2"),
            company_id=company.id,
            invited_by=owner.id,
            phone="+919800000007",
            role=UserRole.supervisor,
            name="Site 3 Supervisor",
            token="sunrise-demo-invite-token",
            status=InviteStatus.pending,
        )

        # --- Sites + baselines --------------------------------------------
        sites = {}
        site_specs = [
            ("a", "Sunrise Heights", "Whitefield, Bengaluru", "residential", 30),
            ("b", "Sunrise Meadows", "Sarjapur, Bengaluru", "residential", 40),
            ("c", "Sunrise Plaza", "MG Road, Bengaluru", "commercial", None),
        ]
        for skey, name, location, stype, headcount in site_specs:
            site = await _upsert(
                session,
                Site,
                _id("site", skey),
                company_id=company.id,
                name=name,
                location=location,
                type=stype,
                status="active",
            )
            sites[skey] = site
            if headcount is not None:
                await _upsert(
                    session,
                    SiteBaseline,
                    _id("baseline", skey),
                    site_id=site.id,
                    expected_daily_headcount=headcount,
                    notes="Demo baseline",
                    updated_by=owner.id,
                )
        await session.flush()
        counts["sites"] = len(sites)

        # A mapped WhatsApp group on Site A so the live /ingest demo routes here.
        await _upsert(
            session,
            WhatsappGroup,
            _id("group", "a"),
            company_id=company.id,
            site_id=sites["a"].id,
            external_group_id="sunrise-site-a",
            source="baileys",
            label="Sunrise Heights — site crew",
        )

        # --- Site assignments ---------------------------------------------
        # owner/pm see every company site implicitly; field + finance roles only
        # see sites they're assigned to (app.auth scoping via SiteAssignment), so
        # assign them here or their role screens come up empty.
        assignments = {
            "supervisor": ["a", "b"],
            "accountant": ["a", "b", "c"],
            "procurement": ["a", "b", "c"],
            "labor_contractor": ["a"],
        }
        for ukey, skeys in assignments.items():
            for skey in skeys:
                await _upsert(
                    session,
                    SiteAssignment,
                    _id("assignment", ukey, skey),
                    site_id=sites[skey].id,
                    user_id=users[ukey].id,
                )
        await session.flush()

        # --- SiteEvents (Hindi/Hinglish spread) ---------------------------
        site_a, site_b = sites["a"].id, sites["b"].id
        events = [
            # Site A: healthy attendance (>= baseline 30)
            dict(
                key="att-a",
                site_id=site_a,
                event_type="attendance",
                occurred_on=BRIEF_DAY,
                summary="32 mazdoor aaye, sab kaam pe",
                fields={"headcount": 32, "raw_phrase": "32 mazdoor aaye"},
            ),
            # Site B: attendance BELOW baseline 40 -> labor-shortfall risk fires
            dict(
                key="att-b",
                site_id=site_b,
                event_type="attendance",
                occurred_on=BRIEF_DAY,
                summary="aaj sirf 22 log aaye, 18 kam",
                fields={"headcount": 22, "raw_phrase": "22 log aaye"},
            ),
            # Site A: cement delivery — 100 bags from ACC
            dict(
                key="delivery-a",
                site_id=site_a,
                event_type="material_delivery",
                occurred_on=BRIEF_DAY - timedelta(days=1),
                summary="100 bori cement aaya ACC se",
                fields={
                    "material": "cement",
                    "quantity": 100,
                    "unit": "bags",
                    "vendor": "ACC Limited",
                },
            ),
            # Site A: invoice that MISMATCHES the delivery (billed 120 vs 100 got)
            dict(
                key="invoice-a",
                site_id=site_a,
                event_type="invoice_received",
                occurred_on=BRIEF_DAY,
                summary="ACC ka bill aaya: 120 bags, Rs 72,000",
                fields={
                    "vendor": "ACC Limited",
                    "material": "cement",
                    "quantity": 120,
                    "amount": 72000,
                    "currency": "INR",
                    "invoice_number": "ACC/2026/0456",
                },
            ),
            # Site A: progress
            dict(
                key="progress-a",
                site_id=site_a,
                event_type="progress_update",
                occurred_on=BRIEF_DAY,
                summary="pehli manzil ka slab 80% ho gaya",
                fields={"percent": 80, "area": "first floor slab"},
            ),
            # Site B: issue
            dict(
                key="issue-b",
                site_id=site_b,
                event_type="issue",
                occurred_on=BRIEF_DAY,
                summary="paani ki supply band, concrete ka kaam ruka",
                fields={"category": "water", "blocking": True},
            ),
        ]
        for ev in events:
            await _upsert(
                session,
                SiteEventModel,
                _id("event", ev["key"]),
                site_id=ev["site_id"],
                event_type=ev["event_type"],
                occurred_on=ev["occurred_on"],
                summary=ev["summary"],
                fields=ev["fields"],
                confidence=0.9,
                needs_clarification=False,
                source_message_ids=[],
                version=1,
            )
        await session.flush()
        counts["events"] = len(events)

        # --- Payments ------------------------------------------------------
        await _upsert(
            session,
            Payment,
            _id("payment", "homeowner-in"),
            company_id=company.id,
            site_id=site_a,
            direction=PaymentDirection.homeowner_to_contractor,
            counterparty_name="Sharma Residence",
            amount=Decimal("500000.00"),
            currency="INR",
            paid_on=TODAY - timedelta(days=5),
            method="bank",
            reference_no="NEFT-SR-88121",
            status=PaymentStatus.confirmed,
            notes="Milestone 2 advance",
            created_by=owner.id,
        )
        await _upsert(
            session,
            Payment,
            _id("payment", "supplier-out"),
            company_id=company.id,
            site_id=site_a,
            direction=PaymentDirection.contractor_to_supplier,
            counterparty_name="ACC Limited",
            amount=Decimal("60000.00"),
            currency="INR",
            paid_on=TODAY - timedelta(days=1),
            method="upi",
            reference_no="UPI-ACC-7782",
            status=PaymentStatus.recorded,
            notes="Partial cement payment (pending invoice reconciliation)",
            source_event_id=_id("event", "delivery-a"),
            created_by=owner.id,
        )
        counts["payments"] = 2

        # --- Permits (one near expiry, one stale review) -------------------
        await _upsert(
            session,
            Permit,
            _id("permit", "bplan"),
            company_id=company.id,
            site_id=site_a,
            permit_type="Building Plan Approval",
            authority="BBMP",
            status=PermitStatus.approved,
            applied_on=TODAY - timedelta(days=200),
            decided_on=TODAY - timedelta(days=170),
            expiry_on=TODAY + timedelta(days=15),  # near expiry -> sweep flags it
            reference_no="BBMP/BP/2025/3391",
            notes="Renew before expiry",
            created_by=owner.id,
        )
        await _upsert(
            session,
            Permit,
            _id("permit", "fire-noc"),
            company_id=company.id,
            site_id=site_b,
            permit_type="NOC-fire",
            authority="Karnataka Fire & Emergency Services",
            status=PermitStatus.under_review,
            applied_on=TODAY - timedelta(days=40),  # stale review -> sweep flags it
            reference_no="KFES/NOC/2026/118",
            created_by=owner.id,
        )
        counts["permits"] = 2

        # --- Decisions (one open, one overdue) -----------------------------
        await _upsert(
            session,
            Decision,
            _id("decision", "approve-invoice"),
            company_id=company.id,
            site_id=site_a,
            kind=DecisionKind.approval,
            title="Approve ACC cement invoice (₹72,000)?",
            detail="Invoice bills 120 bags but the site logged 100. ~₹12,000 at risk.",
            raised_by=users["accountant"].id,
            assigned_to=owner.id,
            state=DecisionState.pending,
            sla_due_at=NOW + timedelta(days=1),
            evidence_event_ids=[_id("event", "invoice-a"), _id("event", "delivery-a")],
        )
        await _upsert(
            session,
            Decision,
            _id("decision", "homeowner-overdue"),
            company_id=company.id,
            site_id=site_a,
            kind=DecisionKind.homeowner_question,
            title="Homeowner: can we begin the parking-level slab this week?",
            detail="Owner needs to confirm the schedule with the homeowner.",
            raised_by=None,  # a homeowner (not a user)
            assigned_to=owner.id,
            state=DecisionState.pending,
            sla_due_at=NOW - timedelta(days=1),  # OVERDUE -> run_sla_sweep escalates
        )
        counts["decisions"] = 2

        await session.commit()

        # --- Index events so search works immediately (FakeEmbeddings offline)
        indexed = await index_all_unindexed(session)
        await session.commit()
        counts["indexed"] = indexed

    return counts


def main() -> None:
    counts = asyncio.run(seed())
    print("✅ Seeded demo company 'Sunrise Builders':")
    for k, v in counts.items():
        print(f"   - {k}: {v}")
    print("\nLogin (phone + dev OTP 000000):")
    for _key, role, phone, name in PEOPLE:
        print(f"   - {role.value:18} {phone}  {name}")
    print("\nDemo highlights:")
    print("   - Site B attendance (22) is below baseline (40) -> labor-shortfall risk.")
    print("   - ACC invoice bills 120 bags vs 100 delivered -> reconcile 'needs approval' (~₹12k).")
    print(
        "   - One homeowner decision is overdue -> POST /api/v1/admin/run-sla-sweep escalates it."
    )
    print(
        "   - Building Plan Approval expires in 15 days -> /api/v1/admin/run-permit-sweep flags it."
    )
    print('   - Events are indexed -> try POST /api/v1/search {"q": "cement"}.')


if __name__ == "__main__":
    main()
