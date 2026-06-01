"""Build the Owner Morning Brief for a company on a given day.

Gathers each site's :class:`SiteEventModel` rows for the brief date, converts
them to :class:`SiteEvent` contract objects, runs risk detection, assembles an
exceptions-first payload, renders a concise WhatsApp-ready text via the
(injectable) LLM, and persists an :class:`OwnerBrief` row.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.brief.risk import detect_risks, rank_risks
from app.config import settings
from app.contracts.events import EventType, SiteEvent
from app.extraction.llm import LLMClient, get_llm_client
from app.models import OwnerBrief, Site, SiteBaseline, SiteEventModel

MAX_TOP_RISKS = 3

_SYSTEM_PROMPT = (
    "You write a daily WhatsApp morning brief for the owner of an Indian "
    "construction company. Lead with exceptions and risks, NOT an activity dump. "
    "Keep it under a 2-minute read. Use simple Hindi/English (Hinglish) the way "
    "site owners speak. Be concise: per-site, surface the top risks first, then a "
    "one-line activity summary. Never invent data beyond the JSON provided. "
    'Return strict JSON of the form {"text": "<the brief>"}.'
)

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}


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


def _counts(events: list[SiteEvent]) -> dict[str, int]:
    attendance = sum(1 for e in events if e.event_type is EventType.attendance)
    deliveries = sum(1 for e in events if e.event_type is EventType.material_delivery)
    issues = sum(1 for e in events if e.event_type is EventType.issue)
    return {"attendance": attendance, "deliveries": deliveries, "issues": issues}


def _jsonable_risk(risk: dict) -> dict:
    return {
        "site_id": str(risk["site_id"]),
        "kind": risk["kind"],
        "severity": risk["severity"],
        "message": risk["message"],
        "evidence_event_ids": [str(eid) for eid in risk["evidence_event_ids"]],
    }


async def build_brief(
    session: AsyncSession,
    company_id: UUID,
    brief_date: date,
    *,
    llm: LLMClient | None = None,
) -> dict:
    """Build, render, and persist the owner brief for one company/day.

    Args:
        session: active async DB session.
        company_id: the company whose sites are aggregated.
        brief_date: the day whose events are summarized.
        llm: optional injected :class:`LLMClient` (a Fake in tests). Defaults to
            :func:`app.extraction.llm.get_llm_client`.

    Returns ``{"payload": dict, "text": str, "brief_id": UUID}``.
    """
    llm = llm or get_llm_client()

    # company sites
    sites = (
        (await session.execute(select(Site).where(Site.company_id == company_id)))
        .scalars()
        .all()
    )
    site_by_id = {s.id: s for s in sites}
    site_ids = list(site_by_id.keys())

    # Trailing window for auto-learning an expected headcount when a site has no
    # explicit baseline. We load today's events plus this prior window in one
    # query and split them below.
    history_start = brief_date - timedelta(days=settings.brief_baseline_history_days)

    events_by_site: dict[UUID, list[SiteEvent]] = defaultdict(list)
    history_by_site: dict[UUID, list[SiteEvent]] = defaultdict(list)
    if site_ids:
        rows = (
            (
                await session.execute(
                    select(SiteEventModel).where(
                        SiteEventModel.site_id.in_(site_ids),
                        SiteEventModel.occurred_on >= history_start,
                        SiteEventModel.occurred_on <= brief_date,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            contract = _to_contract(row)
            if row.occurred_on == brief_date:
                events_by_site[row.site_id].append(contract)
            else:
                history_by_site[row.site_id].append(contract)

    # Explicit per-site baselines (when set, they take precedence over learned).
    baseline_by_site: dict[UUID, int | None] = {}
    if site_ids:
        brows = (
            (
                await session.execute(
                    select(SiteBaseline).where(SiteBaseline.site_id.in_(site_ids))
                )
            )
            .scalars()
            .all()
        )
        baseline_by_site = {b.site_id: b.expected_daily_headcount for b in brows}

    site_payloads: list[dict] = []
    for site_id, events in events_by_site.items():
        if not events:
            continue
        risks = detect_risks(
            events,
            site_id=site_id,
            expected_headcount=baseline_by_site.get(site_id),
            history_events=history_by_site.get(site_id),
        )
        top = [_jsonable_risk(r) for r in rank_risks(risks, MAX_TOP_RISKS)]
        site = site_by_id[site_id]
        site_payloads.append(
            {
                "site_id": str(site_id),
                "name": site.name,
                "top_risks": top,
                "counts": _counts(events),
            }
        )

    # stable order: sites with more/severe risks first, then by name
    site_payloads.sort(key=lambda s: (-len(s["top_risks"]), s["name"]))

    payload: dict = {"brief_date": brief_date.isoformat(), "sites": site_payloads}

    text = await _render_text(llm, payload)

    brief = OwnerBrief(
        company_id=company_id,
        brief_date=brief_date,
        payload={**payload, "text": text},
    )
    session.add(brief)
    await session.commit()
    await session.refresh(brief)

    return {"payload": payload, "text": text, "brief_id": brief.id}


async def _render_text(llm: LLMClient, payload: dict) -> str:
    user = json.dumps(payload, ensure_ascii=False)
    result = await llm.complete(_SYSTEM_PROMPT, user, _RESPONSE_SCHEMA)
    text = result.get("text") if isinstance(result, dict) else None
    if isinstance(text, str) and text.strip():
        return text
    # Deterministic fallback if the LLM returns an unexpected shape.
    return _fallback_text(payload)


def _fallback_text(payload: dict) -> str:
    lines = [f"Morning brief — {payload['brief_date']}"]
    if not payload["sites"]:
        lines.append("No site activity recorded.")
        return "\n".join(lines)
    for s in payload["sites"]:
        lines.append(f"\n{s['name']}:")
        if s["top_risks"]:
            for r in s["top_risks"]:
                lines.append(f"  ⚠ [{r['severity']}] {r['message']}")
        else:
            lines.append("  No risks.")
        c = s["counts"]
        lines.append(
            f"  Activity: {c['attendance']} attendance, "
            f"{c['deliveries']} deliveries, {c['issues']} issues."
        )
    return "\n".join(lines)
