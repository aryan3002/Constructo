"""Assemble a DPR *draft* for one site+date from that day's ``site_events``.

Mirrors :func:`app.brief.generate.build_brief`: deterministically assemble the
structured payload first, then render a prose summary through the injectable
:class:`LLMClient` with a deterministic ``_fallback_summary`` so it degrades
gracefully without a model (or when the model returns an unexpected shape).

Discipline (the C4 hard rules):
  - **Evidence-anchored.** Every section lists the ``site_event`` ids it came
    from; the assembled draft carries the union as ``evidence_event_ids``.
  - **Honest on a thin day.** An empty day yields a minimal honest draft
    (empty sections, "No site activity recorded.") — never invented fiction.
  - **Network-free in tests** via ``FakeLLMClient``.
  - This function only *drafts*. It never sends — sending is a separate,
    human-committed action (CA1).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.events import EventType, SiteEvent
from app.extraction.llm import LLMClient, get_llm_client
from app.models import SiteEventModel

_SYSTEM_PROMPT = (
    "You write the evening Daily Progress Report (DPR) summary for a "
    "construction Project Manager on an Indian site. You are given the day's "
    "already-structured site events as JSON (labour, materials, work done, "
    "blockers). Write a tight 2-4 sentence prose summary a PM can review and "
    "send. Use simple Hindi/English (Hinglish) the way site teams speak. NEVER "
    "invent any number, material, or fact beyond the JSON provided — if the day "
    "is thin, say so plainly. Return strict JSON {\"summary\": \"<text>\"}."
)

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
}


@dataclass
class DraftedDpr:
    """The assembled DPR draft (pure data — not yet persisted)."""

    site_id: UUID
    report_date: date
    sections: dict
    evidence_event_ids: list[str] = field(default_factory=list)


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


def _num(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _labor_section(events: list[SiteEvent]) -> dict:
    """Headcount from the day's attendance events (sum of confirmed counts)."""
    rows: list[dict] = []
    total = 0
    counted = False
    for e in events:
        if e.event_type is not EventType.attendance:
            continue
        hc = _num((e.fields or {}).get("headcount"))
        rows.append(
            {
                "summary": e.summary,
                "headcount": int(hc) if hc is not None else None,
                "needs_clarification": e.needs_clarification,
                "event_id": str(e.id),
            }
        )
        if hc is not None:
            total += int(hc)
            counted = True
    return {"headcount": total if counted else None, "entries": rows}


def _materials_section(events: list[SiteEvent]) -> dict:
    """Materials in from challans/GRN (material_delivery + invoice_received)."""
    rows: list[dict] = []
    for e in events:
        if e.event_type not in (
            EventType.material_delivery,
            EventType.invoice_received,
        ):
            continue
        f = e.fields or {}
        rows.append(
            {
                "summary": e.summary,
                "material": f.get("material"),
                "quantity": _num(f.get("quantity")),
                "unit": f.get("unit"),
                "vendor": f.get("vendor"),
                "needs_clarification": e.needs_clarification,
                "event_id": str(e.id),
            }
        )
    return {"deliveries": rows}


def _work_done_section(events: list[SiteEvent]) -> dict:
    """Milestones / progress touched today."""
    rows: list[dict] = []
    for e in events:
        if e.event_type is not EventType.progress_update:
            continue
        rows.append({"summary": e.summary, "event_id": str(e.id)})
    return {"items": rows}


def _blockers_section(events: list[SiteEvent]) -> dict:
    """Issues raised today — the things that need the owner/PM."""
    rows: list[dict] = []
    for e in events:
        if e.event_type is not EventType.issue:
            continue
        f = e.fields or {}
        rows.append(
            {
                "summary": e.summary,
                "description": f.get("description") or e.summary,
                "severity": f.get("severity"),
                "event_id": str(e.id),
            }
        )
    return {"items": rows}


def _next_section(blockers: dict, materials: dict) -> dict:
    """Deterministic 'what's next' — derived only from today's facts, no fiction.

    Surfaces open blockers as follow-ups and flags any unconfirmed material
    line. Never invents a forward plan the events don't support.
    """
    items: list[str] = []
    for b in blockers["items"]:
        items.append(f"Follow up: {b['description']}")
    for d in materials["deliveries"]:
        if d["needs_clarification"]:
            items.append(f"Confirm delivery: {d['summary']}")
    return {"items": items}


async def draft_dpr(
    session: AsyncSession,
    site_id: UUID,
    report_date: date,
    *,
    llm: LLMClient | None = None,
) -> DraftedDpr:
    """Assemble (do NOT persist) a DPR draft for one site+date.

    Args:
        session: active async DB session.
        site_id: the site whose day is summarized.
        report_date: the calendar day to report on.
        llm: optional injected :class:`LLMClient` (a Fake in tests). Defaults to
            :func:`app.extraction.llm.get_llm_client`.

    Returns a :class:`DraftedDpr` with structured ``sections`` (labor /
    materials / work_done / blockers / next / summary) and the union of all
    cited ``evidence_event_ids``. An empty day yields honest empty sections and
    a deterministic "no activity" summary — never invented content.
    """
    llm = llm or get_llm_client()

    rows = (
        (
            await session.execute(
                select(SiteEventModel).where(
                    SiteEventModel.site_id == site_id,
                    SiteEventModel.occurred_on == report_date,
                )
            )
        )
        .scalars()
        .all()
    )
    events = [_to_contract(r) for r in rows]
    # Stable order so the draft (and its summary) are deterministic.
    events.sort(key=lambda e: (e.created_at, str(e.id)))

    labor = _labor_section(events)
    materials = _materials_section(events)
    work_done = _work_done_section(events)
    blockers = _blockers_section(events)
    nxt = _next_section(blockers, materials)

    sections: dict = {
        "labor": labor,
        "materials": materials,
        "work_done": work_done,
        "blockers": blockers,
        "next": nxt,
    }

    summary = await _render_summary(llm, site_id, report_date, sections, bool(events))
    sections["summary"] = summary

    # Evidence = every event the draft cited, in stable order.
    evidence = [str(e.id) for e in events]

    return DraftedDpr(
        site_id=site_id,
        report_date=report_date,
        sections=sections,
        evidence_event_ids=evidence,
    )


async def _render_summary(
    llm: LLMClient,
    site_id: UUID,
    report_date: date,
    sections: dict,
    has_events: bool,
) -> str:
    if not has_events:
        # Honest minimal draft for a thin/empty day — never call the model to
        # invent a forward narrative from nothing.
        return _fallback_summary(sections, has_events=False)

    payload = {
        "site_id": str(site_id),
        "report_date": report_date.isoformat(),
        "sections": sections,
    }
    user = json.dumps(payload, ensure_ascii=False)
    result = await llm.complete(_SYSTEM_PROMPT, user, _RESPONSE_SCHEMA)
    text = result.get("summary") if isinstance(result, dict) else None
    if isinstance(text, str) and text.strip():
        return text
    return _fallback_summary(sections, has_events=True)


def _fallback_summary(sections: dict, *, has_events: bool) -> str:
    """Deterministic prose, mirroring ``build_brief._fallback_text``.

    Used both when no model is configured and when the model returns an
    unexpected shape. Reports only what the structured sections actually hold.
    """
    if not has_events:
        return "No site activity recorded."

    parts: list[str] = []
    hc = sections["labor"]["headcount"]
    if hc is not None:
        parts.append(f"{hc} on site")
    deliveries = sections["materials"]["deliveries"]
    if deliveries:
        parts.append(
            f"{len(deliveries)} material "
            f"{'delivery' if len(deliveries) == 1 else 'deliveries'}"
        )
    work = sections["work_done"]["items"]
    if work:
        parts.append(
            f"{len(work)} progress {'update' if len(work) == 1 else 'updates'}"
        )
    blockers = sections["blockers"]["items"]
    if blockers:
        parts.append(
            f"{len(blockers)} {'blocker' if len(blockers) == 1 else 'blockers'}"
        )
    if not parts:
        return "Activity recorded; no labour, material, progress, or blockers captured."
    return "Today: " + ", ".join(parts) + "."
