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
from app.common.language import language_instruction
from app.common.site_events import latest_event_clause
from app.config import settings
from app.contracts.events import EventType, SiteEvent
from app.extraction.llm import LLMClient, get_llm_client
from app.models import (
    OwnerBrief,
    Site,
    SiteBaseline,
    SiteEventModel,
    SiteFinding,
    User,
    UserRole,
)

MAX_TOP_RISKS = 3
# Proactive Site Health findings surfaced per site in the brief (top by severity).
MAX_TOP_FINDINGS = 3
_FINDING_SEV_RANK = {"critical": 3, "high": 2, "medium": 1, "low": 0}

_SYSTEM_PROMPT_BASE = (
    "You write a daily WhatsApp morning brief for the owner of an Indian "
    "construction company. Lead with exceptions and risks, NOT an activity dump. "
    "Keep it under a 2-minute read. Be concise: per-site, surface the top risks "
    "first, then any Site Health 'findings' (proactive checks — schedule drift, "
    "work inconsistency, quality), then a one-line activity summary. Never invent "
    'data beyond the JSON provided. Return strict JSON of the form {"text": "<the brief>"}.'
)


def _system_prompt(language: str | None) -> str:
    """The brief system prompt + an explicit output-language directive (the
    recipient's account language), so an English owner stops getting a Hindi brief."""
    return f"{_SYSTEM_PROMPT_BASE} {language_instruction(language)}"

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


def _jsonable_risk(
    risk: dict, events_by_id: dict[UUID, SiteEvent] | None = None
) -> dict:
    lookup = events_by_id or {}
    eids = risk["evidence_event_ids"]
    evidence: list[dict] = []
    for eid in eids:
        ev = lookup.get(eid)
        evidence.append(
            {
                "id": str(eid),
                "summary": ev.summary if ev is not None else None,
                "event_type": ev.event_type.value if ev is not None else None,
                "occurred_on": ev.occurred_on.isoformat() if ev is not None else None,
            }
        )
    return {
        "site_id": str(risk["site_id"]),
        "kind": risk["kind"],
        "severity": risk["severity"],
        "message": risk["message"],
        "evidence_event_ids": [str(eid) for eid in eids],
        # Resolved proof rows so the brief shows real evidence ("100 bori cement
        # aaya ACC se") instead of a raw event UUID.
        "evidence": evidence,
    }


async def build_brief(
    session: AsyncSession,
    company_id: UUID,
    brief_date: date,
    *,
    llm: LLMClient | None = None,
    language: str | None = None,
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
    # Default the output language to the company owner's account language (an
    # explicit arg from the POST /briefs/run caller wins). Keeps an English
    # owner from receiving a Hindi brief.
    if language is None:
        language = await _owner_language(session, company_id)

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
                        latest_event_clause(),
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

    # Proactive Site Health findings (persisted by the nightly engine). Only OPEN
    # ones reach the brief — acknowledged findings stay on the dashboard but are
    # hidden here so the brief never re-nags. A site with open findings is
    # surfaced even when it had no events on the brief day (silent drift).
    findings_by_site: dict[UUID, list[dict]] = defaultdict(list)
    if site_ids:
        frows = (
            (
                await session.execute(
                    select(SiteFinding).where(
                        SiteFinding.site_id.in_(site_ids),
                        SiteFinding.status == "open",
                    )
                )
            )
            .scalars()
            .all()
        )
        grouped: dict[UUID, list[SiteFinding]] = defaultdict(list)
        for f in frows:
            grouped[f.site_id].append(f)
        for sid, fs in grouped.items():
            fs.sort(key=lambda f: _FINDING_SEV_RANK.get(f.severity, 0), reverse=True)
            findings_by_site[sid] = [
                {
                    "finding_type": f.finding_type,
                    "severity": f.severity,
                    "headline": f.headline,
                    "phase": f.phase,
                }
                for f in fs[:MAX_TOP_FINDINGS]
            ]

    site_payloads: list[dict] = []
    for site_id in set(events_by_site) | set(findings_by_site):
        events = events_by_site.get(site_id, [])
        if events:
            risks = detect_risks(
                events,
                site_id=site_id,
                expected_headcount=baseline_by_site.get(site_id),
                history_events=history_by_site.get(site_id),
            )
            events_by_id = {
                e.id: e for e in (events + (history_by_site.get(site_id) or []))
            }
            top = [_jsonable_risk(r, events_by_id) for r in rank_risks(risks, MAX_TOP_RISKS)]
        else:
            top = []
        site = site_by_id[site_id]
        site_payloads.append(
            {
                "site_id": str(site_id),
                "name": site.name,
                "top_risks": top,
                "counts": _counts(events),
                "findings": findings_by_site.get(site_id, []),
            }
        )

    # stable order: sites with the most risks + health findings first, then by name
    site_payloads.sort(
        key=lambda s: (-(len(s["top_risks"]) + len(s["findings"])), s["name"])
    )

    payload: dict = {"brief_date": brief_date.isoformat(), "sites": site_payloads}

    text = await _render_text(llm, payload, language)

    # Idempotent per (company, day): replace any existing brief(s) for this date
    # rather than inserting a duplicate. Without this, re-running (a re-import, a
    # manual /briefs/run, or a nightly re-run) piles up rows that `/briefs`
    # returns side-by-side — stale next to fresh. Reuse the existing row's id +
    # sent_at when present (so a delivered brief stays "delivered"); delete any
    # extra duplicates that earlier runs may already have created.
    existing = (
        (
            await session.execute(
                select(OwnerBrief)
                .where(
                    OwnerBrief.company_id == company_id,
                    OwnerBrief.brief_date == brief_date,
                )
                .order_by(OwnerBrief.id)
            )
        )
        .scalars()
        .all()
    )
    if existing:
        brief = existing[0]
        brief.payload = {**payload, "text": text}
        for dup in existing[1:]:  # collapse any pre-existing duplicates
            await session.delete(dup)
    else:
        brief = OwnerBrief(
            company_id=company_id,
            brief_date=brief_date,
            payload={**payload, "text": text},
        )
        session.add(brief)
    await session.commit()
    await session.refresh(brief)

    return {"payload": payload, "text": text, "brief_id": brief.id}


async def _owner_language(session: AsyncSession, company_id: UUID) -> str:
    """The company owner's account language (default 'en') — the brief's reader."""
    owner = (
        await session.execute(
            select(User)
            .where(User.company_id == company_id, User.role == UserRole.owner)
            .order_by(User.id)
        )
    ).scalars().first()
    return owner.language if owner and owner.language else "en"


async def _render_text(llm: LLMClient, payload: dict, language: str | None = "en") -> str:
    user = json.dumps(payload, ensure_ascii=False)
    result = await llm.complete(_system_prompt(language), user, _RESPONSE_SCHEMA)
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
        elif not s.get("findings"):
            lines.append("  No risks.")
        for f in s.get("findings", []):
            lines.append(f"  ◆ Site Health [{f['severity']}] {f['headline']}")
        c = s["counts"]
        lines.append(
            f"  Activity: {c['attendance']} attendance, "
            f"{c['deliveries']} deliveries, {c['issues']} issues."
        )
    return "\n".join(lines)
