"""Derive site-quality :class:`Audit` rows from clustered site-condition signal.

Enrichment over the real Tripathi import (see ``scripts.import_whatsapp_export``):
the real ``issue`` and ``progress_update`` ``site_events`` are the on-site
condition record — cracks, seepage, "plaster done", "slab cast". This pass
groups that signal into a small number of time-windowed audits (one per active
month-window) and, for each, asks the smart-tier LLM to organise the real
observations into inspection sections + actionable findings.

Determinism Doctrine: the LLM only proposes the section/finding *structure and
prose* grounded in the supplied real summaries — every numeric score (per
section and the overall audit) is computed in pure Python from the item
pass/obs/fail counts, never by the model. The same scoring helpers the live
audit router uses are reused here.

GROUNDED, NOT FABRICATED: the model is given only the real event summaries from
that window and told to ground sections/findings in them. A window the model
returns nothing usable for creates no audit; a site with no issue/progress
signal yields zero audits (asserted by the test).

Idempotent by construction: each audit + its sections/findings use deterministic
``uuid5`` ids derived from the site + the window key (+ a stable slug), so
re-running upserts the same rows and never duplicates.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_audits
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.audit.router import _section_counts, _section_score
from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    Audit,
    AuditFinding,
    AuditSection,
    AuditStatus,
    FindingSeverity,
    FindingStatus,
    SiteEventModel,
)

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# The on-site condition signal an audit is built from.
_AUDIT_EVENT_TYPES = ("issue", "progress_update")

# Valid inspection-item statuses + finding severities (anything else is dropped /
# defaulted so a stray LLM value can never poison the deterministic score).
_ITEM_STATUSES = {"ok", "obs", "fail"}
_SEVERITIES = {s.value for s in FindingSeverity}

_SYSTEM = (
    "You are a site-quality auditor reviewing a window of a residential "
    "construction project. You are given the REAL site observations from that "
    "window (issues raised + progress updates) as a list. Organise them into 1-3 "
    "inspection SECTIONS (e.g. structure, plaster & finishing, waterproofing), "
    "each with inspection ITEMS marked status ok|obs|fail, and list the concrete "
    "FINDINGS that need fixing with a severity (critical|major|minor), the room "
    "if known, and a one-line note. Ground EVERYTHING in the supplied "
    "observations — do NOT invent issues that are not present. Return JSON only."
)

_SCHEMA = {
    "title": "short title for this audit window",
    "sections": [
        {
            "name": "section name",
            "items": [{"label": "what was inspected", "status": "ok | obs | fail"}],
        }
    ],
    "findings": [
        {
            "title": "short finding title",
            "severity": "critical | major | minor",
            "room": "room name or null",
            "note": "one-line fix note or null",
        }
    ],
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _slug(text: str) -> str:
    """Stable lowercase slug (idempotency key material)."""
    keep = [c.lower() if c.isalnum() else " " for c in (text or "")]
    return "-".join("".join(keep).split())[:120]


def _window_key(d: date) -> str:
    """The time-window an event falls into: its calendar month (YYYY-MM)."""
    return f"{d.year:04d}-{d.month:02d}"


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update by primary-key id (idempotent re-runs)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


def _format_events(events: list[SiteEventModel]) -> str:
    lines = [
        f"- {e.event_type} ({e.occurred_on}): {(e.summary or '').strip()[:180]}"
        for e in events
    ]
    return "Site observations in this window:\n" + "\n".join(lines)


def _clean_items(raw_items) -> list[dict]:
    """Keep only well-formed {label, status in ok/obs/fail} items."""
    items: list[dict] = []
    for it in raw_items or []:
        if not isinstance(it, dict):
            continue
        label = (it.get("label") or "").strip()
        status = (it.get("status") or "").strip().lower()
        if not label or status not in _ITEM_STATUSES:
            continue
        items.append({"label": label[:200], "status": status})
    return items


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Cluster the real issue/progress signal into audits and upsert them.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_decisions``); defaults to the real ``SessionLocal``.
    Returns ``{"audits", "sections", "findings"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("smart")
    audits = sections = findings = 0

    async with session_factory() as s:
        rows = (
            await s.execute(
                select(SiteEventModel)
                .where(
                    SiteEventModel.site_id == site_id,
                    SiteEventModel.event_type.in_(list(_AUDIT_EVENT_TYPES)),
                )
                .order_by(SiteEventModel.occurred_on, SiteEventModel.created_at)
            )
        ).scalars().all()

        if not rows:
            return {"audits": 0, "sections": 0, "findings": 0}

        # Group the condition signal into time windows (calendar months), oldest
        # first — each becomes one audit.
        clusters: dict[str, list[SiteEventModel]] = {}
        for ev in rows:
            clusters.setdefault(_window_key(ev.occurred_on), []).append(ev)

        for window in sorted(clusters):
            cluster = clusters[window]
            out = await llm.complete(_SYSTEM, _format_events(cluster), _SCHEMA) or {}

            raw_sections = [
                sec for sec in (out.get("sections") or [])
                if isinstance(sec, dict) and _clean_items(sec.get("items"))
            ]
            raw_findings = [
                f for f in (out.get("findings") or [])
                if isinstance(f, dict) and (f.get("title") or "").strip()
            ]
            # Nothing usable for this window → no audit (never an empty shell).
            if not raw_sections and not raw_findings:
                continue

            audit_id = _id("audit", window)
            # Compute every section's deterministic counts/score up front so the
            # overall audit score is known before any row is written.
            built_sections: list[dict] = []
            section_scores: list[int] = []
            for pos, sec in enumerate(raw_sections):
                items = _clean_items(sec.get("items"))
                p, o, f = _section_counts(items)
                score = _section_score(p, o, f)
                if score is not None:
                    section_scores.append(score)
                name = (sec.get("name") or "Inspection").strip()[:200]
                built_sections.append(
                    {
                        "id": _id("audit-section", window, _slug(name) or str(pos)),
                        "name": name, "position": pos, "items": items,
                        "pass_count": p, "obs_count": o, "fail_count": f, "score": score,
                    }
                )

            # DETERMINISTIC overall: round(mean of section scores). None if no
            # scored section (e.g. an audit that is findings-only).
            overall = (
                round(sum(section_scores) / len(section_scores))
                if section_scores
                else None
            )

            # Parent first (+ flush) so the section/finding FKs resolve.
            await _upsert(
                s,
                Audit,
                audit_id,
                company_id=company_id,
                site_id=site_id,
                status=AuditStatus.completed,
                score=overall,
            )
            await s.flush()
            audits += 1

            for sec in built_sections:
                await _upsert(
                    s, AuditSection, sec["id"],
                    audit_id=audit_id, name=sec["name"], position=sec["position"],
                    items=sec["items"], pass_count=sec["pass_count"],
                    obs_count=sec["obs_count"], fail_count=sec["fail_count"],
                    score=sec["score"],
                )
                sections += 1

            for f in raw_findings:
                title = (f.get("title") or "").strip()
                sev_raw = (f.get("severity") or "").strip().lower()
                severity = (
                    FindingSeverity(sev_raw) if sev_raw in _SEVERITIES
                    else FindingSeverity.minor
                )
                note = (f.get("note") or "").strip() or None
                room = (f.get("room") or "").strip() or None
                await _upsert(
                    s,
                    AuditFinding,
                    _id("audit-finding", window, _slug(title)),
                    audit_id=audit_id,
                    company_id=company_id,
                    site_id=site_id,
                    title=title[:200],
                    severity=severity,
                    room=room,
                    status=FindingStatus.open,
                    note=note,
                )
                findings += 1

        await s.commit()

    return {"audits": audits, "sections": sections, "findings": findings}


def main() -> None:
    # Pull real Azure creds into os.environ for the smart client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched audits:", counts)


if __name__ == "__main__":
    main()
