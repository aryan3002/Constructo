"""Pure aggregation for the Owner activity-first Command Center.

Side-effect-free: takes already-loaded ORM rows across homeowner-feed /
decision / finding / design-brief source tables, maps each to a uniform ActivityItem, merges
them into ONE time-ordered feed (occurred_at DESC, id tiebreak), applies the
keyset cursor, and threads the router's already-accurate summary counts
through into the response. The router (``router.py``) is the only place that
touches the session — it owns the un-capped COUNT queries the summary is
built from (a capped/paged row list is not a safe basis for a headline
count); everything here is trivially unit testable without a DB (mirrors
``app/dashboard/aggregate.py``).
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from app.models import (
    Change,
    Decision,
    HomeownerRequest,
    Milestone,
    PublishedPhoto,
    Site,
    SiteFinding,
    Update,
    WeeklySummary,
)
from app.models.profiler import ProfilerBrief, ProfilerBriefApproval, ProfilerProfile

# --- kind enum (contract) ---------------------------------------------------
KIND_PHOTO = "photo_shared"
KIND_UPDATE = "update_posted"
KIND_MILESTONE = "milestone_reached"
KIND_WEEKLY = "weekly_summary"
KIND_SCOPE = "scope_change"
KIND_REQUEST = "homeowner_request"
KIND_DECISION = "decision_made"
KIND_FINDING = "site_health_flag"
KIND_DESIGN = "design_update"

# --- link.type enum (contract) ----------------------------------------------
LINK_FEED_PHOTO = "feed_photo"
LINK_UPDATE = "update"
LINK_MILESTONE = "milestone"
LINK_REQUEST = "request"
LINK_DECISION = "decision"
LINK_FINDING = "finding"
LINK_DESIGN_BRIEF = "design_brief"

# Design brief approval action -> owner-feed title (per contract).
_DESIGN_TITLES = {
    "send_to_architect": "Design brief sent to designer",
    "request_changes": "Designer asked for brief changes",
    "architect_sign_off": "Designer signed off the brief",
    "approve": "Design brief approved",
    "contractor_received": "Design brief locked",
}

# Decision kinds that surface as owner activity (per contract).
_DECISION_KINDS = {"approval", "hold_payment"}
# Request/decision states that still "need a decision" from the owner.
_OPEN_REQUEST_STATUSES = {"sent", "seen", "in_progress"}
_OPEN_DECISION_STATES = {"pending", "acknowledged", "escalated"}


def _as_utc(value: dt.datetime | dt.date) -> dt.datetime:
    """Normalize a date/datetime to a tz-aware UTC datetime.

    ``date``-typed columns (milestone.completed_on, finding.detected_on,
    weekly.week_start) become midnight UTC so ordering/cursor is uniform.
    """
    if isinstance(value, dt.datetime):
        return value if value.tzinfo else value.replace(tzinfo=dt.UTC)
    return dt.datetime(value.year, value.month, value.day, tzinfo=dt.UTC)


def _item(
    *,
    kind: str,
    row_id: UUID,
    site: Site,
    title: str,
    subtitle: str | None,
    occurred_at: dt.datetime,
    actor: str | None,
    link_type: str,
    link_id: UUID,
    severity: str,
    scroll_message_id: str | None = None,
) -> dict:
    link: dict = {"type": link_type, "id": str(link_id)}
    if scroll_message_id is not None:
        # Only present when there is a real scroll target (feed_photo). Kept off
        # the other links so the aggregate dicts stay minimal; the Pydantic
        # schema normalizes the field to null in the serialized API response.
        link["scroll_message_id"] = scroll_message_id
    return {
        "id": f"{kind}:{row_id}",
        "kind": kind,
        "site_id": str(site.id),
        "site_name": site.name,
        "title": title,
        "subtitle": subtitle,
        "occurred_at": _as_utc(occurred_at).isoformat(),
        "actor": actor,
        "link": link,
        "severity": severity,
    }


def _finding_severity(sev: str | None) -> str:
    return "warning" if (sev or "").lower() in {"high", "critical"} else "info"


def _map_photo(p: PublishedPhoto, site: Site) -> dict:
    return _item(kind=KIND_PHOTO, row_id=p.id, site=site,
                 title=p.caption or "New photo", subtitle=None,
                 occurred_at=p.published_at, actor=None,
                 link_type=LINK_FEED_PHOTO, link_id=p.id, severity="success",
                 scroll_message_id=(str(p.source_chat_message_id)
                                    if p.source_chat_message_id else None))


def _map_update(u: Update, site: Site) -> dict:
    sev = "warning" if str(u.type) == "delay" else "info"
    return _item(kind=KIND_UPDATE, row_id=u.id, site=site,
                 title=u.title, subtitle=u.body, occurred_at=u.published_at,
                 actor=None, link_type=LINK_UPDATE, link_id=u.id, severity=sev)


def _map_milestone(m: Milestone, site: Site) -> dict:
    return _item(kind=KIND_MILESTONE, row_id=m.id, site=site,
                 title=m.name, subtitle=None, occurred_at=m.completed_on,
                 actor=None, link_type=LINK_MILESTONE, link_id=m.id,
                 severity="success")


def _map_weekly(w: WeeklySummary, site: Site) -> dict:
    return _item(kind=KIND_WEEKLY, row_id=w.id, site=site,
                 title="Weekly summary", subtitle=w.text, occurred_at=w.week_start,
                 actor=None, link_type=LINK_UPDATE, link_id=w.id, severity="info")


def _map_change(c: Change, site: Site) -> dict:
    # R7 (controller decision): link deep-links to the project timeline via the
    # site (not the change row / a decision), matching how other updates link.
    return _item(kind=KIND_SCOPE, row_id=c.id, site=site,
                 title=c.description, subtitle=None, occurred_at=c.created_at,
                 actor=None, link_type=LINK_UPDATE, link_id=c.site_id,
                 severity="warning")


def _request_overdue(r: HomeownerRequest, now: dt.datetime) -> bool:
    due = r.sla_due_at
    if due is None:
        return False
    if due.tzinfo is None:
        due = due.replace(tzinfo=dt.UTC)
    return str(r.status) in _OPEN_REQUEST_STATUSES and due < now


def _map_request(r: HomeownerRequest, site: Site, now: dt.datetime) -> dict:
    sev = "warning" if _request_overdue(r, now) else "info"
    return _item(kind=KIND_REQUEST, row_id=r.id, site=site,
                 title=r.title, subtitle=(r.detail or None), occurred_at=r.created_at,
                 actor=None, link_type=LINK_REQUEST, link_id=r.id, severity=sev)


def _map_decision(d: Decision, site: Site) -> dict:
    # Decision.detail is always a present attribute (nullable in value, not in
    # existence) — the old hasattr(d, "detail") guard was always True and dead.
    return _item(kind=KIND_DECISION, row_id=d.id, site=site,
                 title=d.title, subtitle=d.detail,
                 occurred_at=d.created_at, actor=None,
                 link_type=LINK_DECISION, link_id=d.id, severity="info")


def _map_finding(f: SiteFinding, site: Site) -> dict:
    # Deep-link via the site, not the finding row (mirrors _map_change): the
    # web route is /health/:siteId (SiteHealth calls getSiteHealth(siteId)) —
    # a finding id there 403/404s. link_id must be f.site_id.
    return _item(kind=KIND_FINDING, row_id=f.id, site=site,
                 title=f.headline, subtitle=None, occurred_at=f.detected_on,
                 actor=None, link_type=LINK_FINDING, link_id=f.site_id,
                 severity=_finding_severity(f.severity))


def _map_design_approval(
    approval: ProfilerBriefApproval, profile: ProfilerProfile, site: Site,
) -> dict:
    # Profiler tables carry no site_id of their own — the caller resolves
    # approval -> brief -> profile and passes the profile + its site along so
    # this stays a pure mapper (mirrors every other _map_* here). The link id
    # is the SITE id (not the approval/brief id) for future site-scoped
    # routing on the web (see task brief); the web route does not consume it
    # for routing yet.
    return _item(kind=KIND_DESIGN, row_id=approval.id, site=site,
                 title=_DESIGN_TITLES[str(approval.action)],
                 subtitle=approval.note,
                 occurred_at=approval.created_at, actor=approval.actor_role,
                 link_type=LINK_DESIGN_BRIEF, link_id=profile.site_id,
                 severity="info")


def _map_design_brief(
    brief: ProfilerBrief, profile: ProfilerProfile, site: Site,
) -> dict:
    return _item(kind=KIND_DESIGN, row_id=brief.id, site=site,
                 title=f"Design brief v{brief.version} ready", subtitle=None,
                 occurred_at=brief.created_at, actor=None,
                 link_type=LINK_DESIGN_BRIEF, link_id=profile.site_id,
                 severity="info")


def _item_sort_key(item: dict) -> tuple[str, str]:
    # occurred_at is a fixed-width iso8601 string -> lexicographic == chronological.
    return (item["occurred_at"], item["id"])


def build_activity(
    *,
    sites: list[Site],
    photos: list[PublishedPhoto],
    updates: list[Update],
    milestones: list[Milestone],
    weekly_summaries: list[WeeklySummary],
    changes: list[Change],
    requests: list[HomeownerRequest],
    decisions: list[Decision],
    findings: list[SiteFinding],
    now: dt.datetime,
    limit: int,
    cursor: tuple[str, str] | None,
    updates_today: int,
    needs_decision_count: int,
    sites_total: int,
    design_approvals: list[tuple[ProfilerBriefApproval, ProfilerProfile]] | None = None,
    design_briefs: list[tuple[ProfilerBrief, ProfilerProfile]] | None = None,
) -> dict:
    """Union → sort → keyset-trim. All rows must already be in scope.

    ``cursor`` is the ``(occurred_at_iso, id)`` of the last item of the previous
    page; only strictly-older items (by the DESC sort key) are returned.

    The per-source row lists passed in here (``photos``, ``updates``, ...) are
    the PAGE's over-fetched-but-still-capped rows (``page_size + 1`` per
    source in the router) — fine for building ``items``, but NOT a safe basis
    for the headline ``summary`` counts, which must reflect the owner's TRUE
    in-scope totals regardless of the page size. So ``updates_today``,
    ``needs_decision_count`` and ``sites_total`` are dedicated, already-accurate
    inputs computed by the router from un-capped COUNT queries (or, for
    ``sites_total``, the already-un-capped visible-sites list) — this function
    only threads them through into the returned ``summary``, it does not
    derive them from the (possibly-capped) rows above.

    ``design_approvals``/``design_briefs`` are keyword-only with a ``None``
    default (kept optional so existing callers/tests that predate the design
    source keep compiling unchanged) — each entry is a ``(row, profile)`` pair
    since the profiler tables carry no ``site_id`` of their own; the caller
    resolves the join to the owning ``ProfilerProfile`` (for its ``site_id``)
    before calling in.
    """
    sites_by_id: dict[UUID, Site] = {s.id: s for s in sites}

    items: list[dict] = []
    for p in photos:
        s = sites_by_id.get(p.site_id)
        if s is not None:
            items.append(_map_photo(p, s))
    for u in updates:
        s = sites_by_id.get(u.site_id)
        if s is not None:
            items.append(_map_update(u, s))
    for m in milestones:
        s = sites_by_id.get(m.site_id)
        if s is not None and str(m.status) == "done" and m.completed_on is not None:
            items.append(_map_milestone(m, s))
    for w in weekly_summaries:
        s = sites_by_id.get(w.site_id)
        if s is not None:
            items.append(_map_weekly(w, s))
    for c in changes:
        s = sites_by_id.get(c.site_id)
        if s is not None:
            items.append(_map_change(c, s))
    for r in requests:
        s = sites_by_id.get(r.site_id)
        if s is not None:
            items.append(_map_request(r, s, now))
    for d in decisions:
        s = sites_by_id.get(d.site_id)
        if s is not None and str(d.kind) in _DECISION_KINDS:
            items.append(_map_decision(d, s))
    for f in findings:
        s = sites_by_id.get(f.site_id)
        if s is not None and str(f.status) == "open":
            items.append(_map_finding(f, s))
    for approval, profile in (design_approvals or []):
        s = sites_by_id.get(profile.site_id)
        if s is not None:
            items.append(_map_design_approval(approval, profile, s))
    for brief, profile in (design_briefs or []):
        s = sites_by_id.get(profile.site_id)
        if s is not None:
            items.append(_map_design_brief(brief, profile, s))

    # occurred_at DESC, then id DESC as tiebreak (deterministic).
    items.sort(key=_item_sort_key, reverse=True)

    # Pass the router's already-accurate, un-capped counts straight through —
    # see the docstring above for why these must NOT be derived from `items`
    # (or from the `requests`/`decisions` row lists) here.
    summary = {
        "updates_today": updates_today,
        "needs_decision_count": needs_decision_count,
        "sites_total": sites_total,
    }

    # Keyset: drop everything at-or-newer than the cursor (DESC), then take limit.
    if cursor is not None:
        items = [it for it in items if _item_sort_key(it) < tuple(cursor)]

    next_cursor: tuple[str, str] | None = None
    if len(items) > limit:
        items = items[:limit]
        last = items[-1]
        next_cursor = (last["occurred_at"], last["id"])

    return {"items": items, "summary": summary, "next_cursor": next_cursor}
