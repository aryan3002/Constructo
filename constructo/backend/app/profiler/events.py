"""Design-loop notifications. ONE entry point; copy + targeting per kind.

Homeowner direction rides notify_site_homeowners (bell inbox + cadence-gated
push). Designer direction pushes to every architect user of the profile's
company. Never raises out of notify_design_event's internals after the kind
check — a notification failure must not break the domain write.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profiler import ProfilerProfile
from app.models.user import User, UserRole
from app.push.sender import notify_site_homeowners, push_tokens_for_user, send_expo_push

logger = logging.getLogger(__name__)

# kind -> (homeowner_copy | None, designer_copy | None, deep_link)
# copy is (title, body-template); {area}/{note}/{version} fill from kwargs.
DESIGN_EVENT_KINDS: dict[str, tuple[tuple[str, str] | None, tuple[str, str] | None, str]] = {
    "profile_started": (
        ("Design profile started", "Start adding rooms you love"),
        None,
        "/design/profiler",
    ),
    "themes_ready": (
        ("Design ideas ready", "New theme suggestions for {area}"),
        ("Themes proposed", "{area}: new AI themes await review"),
        "/design/profiler",
    ),
    "clarifications_asked": (
        ("A few questions about your style", "Answering sharpens your {area} brief"),
        None,
        "/design/profiler",
    ),
    "clarification_answered": (
        None,
        ("Homeowner answered", "New clarification answers on a brief"),
        "/architect/brief",
    ),
    "conflict_detected": (
        ("Your styles differ on {area}", "See both sides and settle it together"),
        ("Taste conflict flagged", "{area} has diverging preferences"),
        "/design/profiler",
    ),
    "conflict_resolved": (
        None,
        ("Conflict settled", "{note}"),
        "/architect/brief",
    ),
    "brief_ready": (
        ("Your design brief v{version} is ready", "Review it and send it to your designer"),
        ("Brief v{version} generated", "A homeowner brief was generated"),
        "/design/brief",
    ),
    "brief_sent_to_designer": (
        None,
        ("New brief for review", "A homeowner sent you their design brief"),
        "/architect/brief",
    ),
    "changes_requested": (
        ("Your designer asked for changes", "{note}"),
        None,
        "/design/brief",
    ),
    "designer_signed_off": (
        ("Your designer signed off", "Brief v{version} — your approval unlocks pricing"),
        None,
        "/design/brief",
    ),
    "brief_approved": (
        None,
        ("Brief approved", "Materialize it into material selections"),
        "/designer?tab=intake",
    ),
    "brief_locked": (
        ("Locked in", "Your contractor received the final brief"),
        None,
        "/design/brief",
    ),
    "specs_materialized": (
        ("Your brief became material choices", "{note}"),
        ("Specs created from brief", "{note}"),
        "/design",
    ),
}


async def notify_design_event(
    session: AsyncSession, profile: ProfilerProfile, kind: str, *,
    note: str | None = None, area_label: str | None = None, version: int | None = None,
) -> None:
    if kind not in DESIGN_EVENT_KINDS:
        raise ValueError(f"unknown design event kind: {kind}")
    home_copy, designer_copy, link = DESIGN_EVENT_KINDS[kind]
    fills = {"area": area_label or "your home", "note": note or "", "version": version or 1}
    data = {"type": "design", "kind": kind, "profile_id": str(profile.id),
            "site_id": str(profile.site_id), "url": link}
    try:
        if home_copy:
            title, body = (s.format(**fills) for s in home_copy)
            await notify_site_homeowners(session, profile.site_id, title, body,
                                         category="design", spike=False, data=data)
        if designer_copy:
            title, body = (s.format(**fills) for s in designer_copy)
            architect_ids = (await session.execute(
                select(User.id).where(User.company_id == profile.company_id,
                                      User.role == UserRole.architect)
            )).scalars().all()
            tokens: list[str] = []
            for uid in architect_ids:
                tokens.extend(await push_tokens_for_user(session, uid))
            if tokens:
                await send_expo_push([
                    {"to": t, "title": title, "body": body,
                     "data": {**data, "audience": "designer"}} for t in tokens
                ])
    except Exception:  # notification is best-effort, always
        logger.exception("design event %s notify failed for profile %s", kind, profile.id)
