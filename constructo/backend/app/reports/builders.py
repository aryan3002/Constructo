"""Deterministic report builders — Task 3 of W5 Slice 1.

THE CARDINAL RULE: these builders never recompute domain numbers.
They READ what existing code already computed and reshape it for rendering.

Reuse points:
  - DPR sections: app.dpr.draft.draft_dpr + select(Dpr) for stored rows
  - Dashboard site cards: app.dashboard.aggregate.build_site_card
  - Financials: app.payments.router._site_received + _financials_out
    (those helpers are module-private so we replicate the same minimal query;
    noted as a concern in the module docstring below).
  - Company letterhead: session.get(Company, company_id)

CONCERN: _site_received and _financials_out in app/payments/router.py are
module-private (leading-underscore). We replicate the exact same 2-query
pattern (select SiteFinancials + select Payment for inflow) rather than
importing private symbols across modules. The logic is intentionally identical
to the router path so a future refactor that moves them to a shared service
layer can replace both call sites at once.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dashboard.aggregate import build_site_card
from app.dpr.draft import draft_dpr
from app.extraction.llm import FakeLLMClient
from app.models import (
    Company,
    Dpr,
    Payment,
    PaymentDirection,
    PaymentStatus,
    Site,
    SiteBaseline,
    SiteEventModel,
    SiteFinancials,
)
from app.storage import get_storage

# ---------------------------------------------------------------------------
# internal helpers (replicate the private payment router helpers)
# ---------------------------------------------------------------------------

def _dec_str(value: Decimal | None) -> str | None:
    """Convert a Decimal to its string representation, or None."""
    if value is None:
        return None
    return str(value)


def _dec_str_required(value: Decimal) -> str:
    """Convert a Decimal to its string representation."""
    return str(value)


async def _load_financials_str(
    session: AsyncSession, company_id: UUID, site_id: UUID
) -> dict:
    """Load financial figures for a site and return them as tracking-only strings.

    Mirrors the logic in app/payments/router.py::get_financials:
      - SiteFinancials row for quotation/billed/currency
      - Payment inflow sum for received (disputed rows excluded)
      - outstanding = billed - received

    Numbers become strings so the render layer never treats them as amounts.
    """
    fin = (
        await session.execute(
            select(SiteFinancials).where(SiteFinancials.site_id == site_id)
        )
    ).scalar_one_or_none()

    # Replicate _site_received: inflow = sum of homeowner->contractor, non-disputed
    payment_rows = list(
        (
            await session.execute(
                select(Payment).where(
                    Payment.company_id == company_id,
                    Payment.site_id == site_id,
                )
            )
        )
        .scalars()
        .all()
    )
    received = Decimal("0")
    for p in payment_rows:
        if p.status == PaymentStatus.disputed:
            continue
        if p.direction == PaymentDirection.homeowner_to_contractor:
            received += p.amount

    billed = fin.billed_amount if fin else None
    quotation = fin.quotation_amount if fin else None
    outstanding = (billed if billed is not None else Decimal("0")) - received
    currency = fin.currency if fin else "INR"

    return {
        "quotation": _dec_str(quotation),
        "billed": _dec_str(billed),
        "received": _dec_str_required(received),
        "outstanding": _dec_str_required(outstanding),
        "currency": currency,
    }


async def _load_company_dict(session: AsyncSession, company_id: UUID) -> dict:
    company = await session.get(Company, company_id)
    if company is None:
        return {"name": "", "gstin": None, "address": None, "logo_url": None}
    return {
        "name": company.name,
        "gstin": company.gstin,
        "address": company.address,
        "logo_url": get_storage().url_for(company.logo_key),
    }


# ---------------------------------------------------------------------------
# build_dpr_pack
# ---------------------------------------------------------------------------

async def build_dpr_pack(
    session: AsyncSession,
    site_id: UUID,
    on_date: str,
) -> dict:
    """Assemble the DPR-pack report dict for one site+date.

    Reads: stored Dpr row if it exists, else falls back to draft_dpr() (same
    event source, no new computation).  Company letterhead from Company row.

    Returns::

        {
            "company": {name, gstin, address},
            "site":    {name, id},
            "date":    on_date,
            "status":  "draft" | "sent",
            "sections": { labor, materials, work_done, blockers, next, summary },
        }
    """
    report_date = date.fromisoformat(on_date)

    # Load site
    site = await session.get(Site, site_id)
    if site is None:
        raise ValueError(f"Site {site_id} not found")

    # Load company for letterhead
    company_dict = await _load_company_dict(session, site.company_id)

    # Try stored DPR first; fall back to draft_dpr so we always return something
    dpr_row = (
        await session.execute(
            select(Dpr).where(
                Dpr.site_id == site_id,
                Dpr.report_date == report_date,
            )
        )
    ).scalar_one_or_none()

    if dpr_row is not None:
        sections = dict(dpr_row.sections or {})
        status = (
            dpr_row.status.value
            if hasattr(dpr_row.status, "value")
            else str(dpr_row.status)
        )
    else:
        # No stored DPR — build an on-the-fly draft (FakeLLMClient gives
        # deterministic fallback summary, no network calls in this code path).
        drafted = await draft_dpr(
            session, site_id, report_date, llm=FakeLLMClient(canned={})
        )
        sections = drafted.sections
        status = "draft"

    return {
        "company": company_dict,
        "site": {"name": site.name, "id": str(site.id)},
        "date": on_date,
        "status": status,
        "sections": sections,
    }


# ---------------------------------------------------------------------------
# build_progress
# ---------------------------------------------------------------------------

async def build_progress(
    session: AsyncSession,
    company_id: UUID,
    site_id: UUID | None,
    date_from: str,
    date_to: str,
) -> dict:
    """Assemble the progress-report dict for a company (optionally one site).

    Reads:
      - sites from the DB (company-scoped, filtered to site_id if given)
      - dashboard site cards via build_site_card (reuses the aggregate module)
      - financials via the replicated _load_financials_str helper

    Per-site shape::

        {
            "name": str,
            "status": str,         # ok | info | warn | risk
            "stage": dict,         # progress pulse facts (may be empty)
            "expected_headcount": int | None,
            "risks": [{kind, severity, message}],
            "money": {quotation, billed, received, outstanding, currency}  # all strings
        }

    Numbers are NEVER recomputed here; they come from build_site_card and
    the financials helper (which themselves read from the DB unchanged).
    """
    # Load company
    company_dict = await _load_company_dict(session, company_id)

    # Load sites
    stmt = select(Site).where(Site.company_id == company_id)
    if site_id is not None:
        stmt = stmt.where(Site.id == site_id)
    sites = list((await session.execute(stmt)).scalars().all())

    # For dashboard site cards we need events + baselines.
    # We load events for the date_to day (progress snapshot at that date).
    as_of = date.fromisoformat(date_to)
    site_ids = [s.id for s in sites]

    # Load events for the snapshot date
    events_by_site: dict[UUID, list[SiteEventModel]] = {}
    if site_ids:
        event_rows = list(
            (
                await session.execute(
                    select(SiteEventModel).where(
                        SiteEventModel.site_id.in_(site_ids),
                        SiteEventModel.occurred_on == as_of,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in event_rows:
            events_by_site.setdefault(row.site_id, []).append(row)

    # Load baselines
    baselines_by_site: dict[UUID, SiteBaseline] = {}
    if site_ids:
        baseline_rows = list(
            (
                await session.execute(
                    select(SiteBaseline).where(SiteBaseline.site_id.in_(site_ids))
                )
            )
            .scalars()
            .all()
        )
        baselines_by_site = {b.site_id: b for b in baseline_rows}

    # Build per-site entries — reuse build_site_card for all dashboard/risk data
    site_entries: list[dict] = []
    for site in sites:
        card = build_site_card(
            site,
            events_by_site.get(site.id, []),
            baselines_by_site.get(site.id),
        )

        # Extract progress pulse facts from the dashboard "progress" tile.
        # The facts dict contains: {"progress_updates": int, "issues": int}.
        # stage_index / stage_total / variance_days are forward-compat fields
        # that no part of the system emits yet (SiteBaseline has no stage
        # columns); the template guards them with `if s.stage.stage_index is
        # defined` so they light up automatically once baseline gains those
        # fields without any change here.
        progress_pulse = next(
            (t for t in card.get("pulse", []) if t["kind"] == "progress"),
            None,
        )
        stage_facts = progress_pulse.get("facts", {}) if progress_pulse else {}

        # Load financials as strings (tracking-only)
        money = await _load_financials_str(session, company_id, site.id)

        # Flatten risks to the shape the template needs
        risks = [
            {
                "kind": r["kind"],
                "severity": r["severity"],
                "message": r["message"],
            }
            for r in card.get("top_risks", [])
        ]

        site_entries.append(
            {
                "name": site.name,
                "status": card["status"],
                "stage": stage_facts,
                "expected_headcount": card.get("expected_headcount"),
                "risks": risks,
                "money": money,
            }
        )

    return {
        "company": company_dict,
        "range": {"from": date_from, "to": date_to},
        "sites": site_entries,
    }
