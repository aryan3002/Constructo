"""Pure aggregation for the Owner Home screen.

Side-effect-free functions over already-loaded ORM rows so they are trivially
unit-testable without a DB or network. The router (``router.py``) is the only
place that touches the session; everything here takes plain
``list[SiteEventModel]`` / ``SiteBaseline`` and returns JSON-able dicts.

Design intent (matches the product brief):
- exceptions-first: surface the worst risks per site, never an activity dump;
- never invent data: every risk carries ``evidence_event_ids`` that exist;
- the labor-shortfall risk is wired to ``SiteBaseline.expected_daily_headcount``
  so it actually fires;
- a 2x2 pulse grid (cash / labor / material / progress) gives an at-a-glance
  read, each tile tappable to its evidence.
"""
from __future__ import annotations

from uuid import UUID

from app.brief.risk import detect_risks, rank_risks
from app.contracts.events import EventType, SiteEvent
from app.models import Site, SiteBaseline, SiteEventModel

# At most this many risks per site card (exceptions-first; matches the brief).
MAX_TOP_RISKS = 3

# Pulse tiles, in fixed display order (2x2 grid, row-major).
PULSE_KINDS = ("cash", "labor", "material", "progress")

# Severity -> the kit's status spine (mirrors web `severityToStatus`).
_SEVERITY_STATUS = {"high": "risk", "medium": "warn", "low": "info"}


def _to_contract(row: SiteEventModel) -> SiteEvent:
    return SiteEvent(
        id=row.id,
        site_id=row.site_id,
        event_type=EventType(row.event_type),
        occurred_on=row.occurred_on,
        summary=row.summary,
        fields=row.fields or {},
        confidence=row.confidence,
        needs_clarification=row.needs_clarification,
        source_message_ids=list(row.source_message_ids or []),
        version=row.version,
        supersedes_event_id=row.supersedes_event_id,
        created_at=row.created_at,
    )


def _jsonable_risk(risk: dict) -> dict:
    severity = risk["severity"]
    return {
        "site_id": str(risk["site_id"]),
        "kind": risk["kind"],
        "severity": severity,
        "status": _SEVERITY_STATUS.get(severity, "info"),
        "message": risk["message"],
        "evidence_event_ids": [str(eid) for eid in risk["evidence_event_ids"]],
    }


def _count(events: list[SiteEvent], *types: EventType) -> int:
    wanted = set(types)
    return sum(1 for e in events if e.event_type in wanted)


def _worst_status(risks: list[dict]) -> str:
    """Worst status across a site's risks; ``ok`` when there are none."""
    rank = {"risk": 0, "warn": 1, "info": 2, "ok": 3}
    worst = "ok"
    for r in risks:
        s = r["status"]
        if rank.get(s, 3) < rank[worst]:
            worst = s
    return worst


def _headcount(event: SiteEvent) -> int | None:
    value = (event.fields or {}).get("headcount")
    if isinstance(value, bool):  # bool is an int subclass; treat as missing
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _attendance_total(events: list[SiteEvent]) -> int | None:
    total: int | None = None
    for e in events:
        if e.event_type is not EventType.attendance:
            continue
        hc = _headcount(e)
        if hc is None:
            continue
        total = hc if total is None else total + hc
    return total


def _pulse_tiles(events: list[SiteEvent], risks: list[dict]) -> list[dict]:
    """The 2x2 at-a-glance grid for one site.

    Each tile reports a status (kit spine), a short value line, and the event
    ids that back it so the UI can deep-link a tile straight to its evidence.
    Tile status is driven by the matching risk kinds (so the grid agrees with
    the risk list) and falls back to ``ok``/``info`` from raw activity.
    """
    by_kind: dict[str, list[dict]] = {}
    for r in risks:
        by_kind.setdefault(r["kind"], []).append(r)

    def status_for(*kinds: str, default: str) -> str:
        matched = [r for k in kinds for r in by_kind.get(k, [])]
        return _worst_status(matched) if matched else default

    def evidence_for(*kinds: str) -> list[str]:
        ids: list[str] = []
        for k in kinds:
            for r in by_kind.get(k, []):
                ids.extend(r["evidence_event_ids"])
        return ids

    invoices = _count(events, EventType.invoice_received)
    payments = _count(events, EventType.payment_request)
    deliveries = _count(events, EventType.material_delivery)
    progress = _count(events, EventType.progress_update)
    issues = _count(events, EventType.issue)
    attendance_total = _attendance_total(events)

    cash_open = payments + len(by_kind.get("unverified_invoice", []))

    tiles = [
        {
            "kind": "cash",
            "status": status_for("unverified_invoice", "pending_approval", default="ok"),
            "value": cash_open,
            "evidence_event_ids": evidence_for("unverified_invoice", "pending_approval"),
            "facts": {"invoices": invoices, "payment_requests": payments},
        },
        {
            "kind": "labor",
            "status": status_for("labor_shortfall", default="ok"),
            "value": attendance_total,
            "evidence_event_ids": evidence_for("labor_shortfall"),
            "facts": {"attendance": attendance_total},
        },
        {
            "kind": "material",
            "status": status_for("unverified_invoice", default="ok"),
            "value": deliveries,
            "evidence_event_ids": evidence_for("unverified_invoice"),
            "facts": {"deliveries": deliveries, "invoices": invoices},
        },
        {
            "kind": "progress",
            "status": status_for("data_quality", default="info" if progress or issues else "ok"),
            "value": progress,
            "evidence_event_ids": evidence_for("data_quality"),
            "facts": {"progress_updates": progress, "issues": issues},
        },
    ]
    return tiles


def build_site_card(
    site: Site,
    event_rows: list[SiteEventModel],
    baseline: SiteBaseline | None,
    *,
    prev_event_rows: list[SiteEventModel] | None = None,
    max_risks: int = MAX_TOP_RISKS,
) -> dict:
    """Aggregate one site into a command-card payload.

    Wires ``baseline.expected_daily_headcount`` into risk detection so the
    labor-shortfall risk fires against the per-site baseline.
    """
    events = [_to_contract(r) for r in event_rows]
    prev_events = (
        [_to_contract(r) for r in prev_event_rows] if prev_event_rows else None
    )
    expected = baseline.expected_daily_headcount if baseline else None

    risks = detect_risks(
        events,
        site_id=site.id,
        expected_headcount=expected,
        prev_events=prev_events,
    )
    ranked = [_jsonable_risk(r) for r in rank_risks(risks, max_risks)]
    overflow = max(len(risks) - len(ranked), 0)

    return {
        "site_id": str(site.id),
        "name": site.name,
        "status": _worst_status(ranked),
        "expected_headcount": expected,
        "top_risks": ranked,
        "risk_overflow": overflow,
        "counts": {
            "attendance": _count(events, EventType.attendance),
            "deliveries": _count(events, EventType.material_delivery),
            "issues": _count(events, EventType.issue),
            "total": len(events),
        },
        "pulse": _pulse_tiles(events, ranked),
    }


def build_home(
    sites: list[Site],
    events_by_site: dict[UUID, list[SiteEventModel]],
    baselines_by_site: dict[UUID, SiteBaseline],
    *,
    prev_events_by_site: dict[UUID, list[SiteEventModel]] | None = None,
) -> dict:
    """Assemble the whole Owner Home payload.

    Returns a dict with the headline counts, the cold-start checklist (when the
    company is not set up yet), and the exceptions-first list of site cards
    (sites with more/severe risks first, then by name).
    """
    prev_events_by_site = prev_events_by_site or {}
    cards: list[dict] = []
    for site in sites:
        card = build_site_card(
            site,
            events_by_site.get(site.id, []),
            baselines_by_site.get(site.id),
            prev_event_rows=prev_events_by_site.get(site.id),
        )
        cards.append(card)

    # exceptions-first ordering: worst status, then most risks, then name.
    status_rank = {"risk": 0, "warn": 1, "info": 2, "ok": 3}
    cards.sort(
        key=lambda c: (status_rank.get(c["status"], 3), -len(c["top_risks"]), c["name"])
    )

    total_risks = sum(len(c["top_risks"]) + c["risk_overflow"] for c in cards)
    sites_needing_attention = sum(1 for c in cards if c["top_risks"])

    checklist = _setup_checklist(sites, events_by_site, baselines_by_site)

    return {
        "needs_attention_count": total_risks,
        "sites_total": len(sites),
        "sites_needing_attention": sites_needing_attention,
        "cold_start": checklist is not None,
        "setup_checklist": checklist or [],
        "sites": cards,
    }


def _setup_checklist(
    sites: list[Site],
    events_by_site: dict[UUID, list[SiteEventModel]],
    baselines_by_site: dict[UUID, SiteBaseline],
) -> list[dict] | None:
    """A guided setup checklist for cold-start, or ``None`` once warmed up.

    Cold-start = the owner has no sites, OR has sites but no events have flowed
    in, OR no baselines are configured (so labor-shortfall can't fire). We show
    the checklist (not a blank grid) until there is at least one site with both
    a baseline and some events.
    """
    has_sites = len(sites) > 0
    any_events = any(events_by_site.get(s.id) for s in sites)
    any_baseline = any(
        (baselines_by_site.get(s.id) is not None)
        and (baselines_by_site[s.id].expected_daily_headcount is not None)
        for s in sites
    )

    if has_sites and any_events and any_baseline:
        return None

    return [
        {
            "key": "add_site",
            "done": has_sites,
            "title_key": "owner.setup.add_site",
        },
        {
            "key": "connect_whatsapp",
            "done": any_events,
            "title_key": "owner.setup.connect_whatsapp",
        },
        {
            "key": "set_baseline",
            "done": any_baseline,
            "title_key": "owner.setup.set_baseline",
        },
    ]
