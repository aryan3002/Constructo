# Owner Activity-First Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Owner web front page (`/owner`) as an honest, activity-first Command Center — a real `GET /api/v1/activity` stream over genuine rows, an add-project affordance, and a clean Approvals/Requests split — replacing the dead WhatsApp-era pulse/ledger dashboard.

**Architecture:** Backend adds a read-only `GET /api/v1/activity` union aggregator (pure `build_activity()` over loaded rows, like `dashboard/aggregate.py`) plus an option-(a) de-pollution that stops creating shadow homeowner-request `Decision` rows and rewires the overdue nudge to a push. The web front page is recomposed from three real sources (`/activity`, `/sites`, `/approvals`) into `HonestHero + NeedsYou(cleaned) + ActivityStream + ProjectsStrip`, adds a `NewProjectModal` and a `RequestsView`, and audits the nav.

**Tech Stack:** FastAPI · SQLAlchemy (async) · Pydantic · pytest · ruff (backend). React · TypeScript · Vite · TanStack Query · Tailwind · Vitest/RTL (web).

## Global Constraints

- **Design spec is the source of truth:** `docs/superpowers/specs/2026-07-03-owner-activity-first-command-center-design.md`.
- **Branch:** `feat/owner-activity-first-command-center` (already checked out).
- **Backend verify (per task):** `cd constructo/backend && ruff check <path> && pytest <path> -v`. Backend must stay green with **0 regressions**.
- **Web verify (per task):** `cd constructo/web && npm run build` (this runs `tsc -b`, the CI/Vercel path — **NOT** `npm run lint`, which is `tsc --noEmit` and is looser) plus `npx vitest run <path>`.
- **No DB migration:** option (a) adds no enum value; `Site.type` is free-text. The only data change is the one-time cleanup script (Task B6).
- **Shared API contract (all tasks align):**
  - `GET /api/v1/activity?site_id={uuid?}&cursor={iso8601?}&limit=20` → `{ items: ActivityItem[], summary: { updates_today, needs_decision_count, sites_total }, next_cursor: string|null }`.
  - `ActivityItem = { id: "{kind}:{uuid}", kind, site_id, site_name, title, subtitle|null, occurred_at, actor|null, link: { type, id }, severity: "info"|"success"|"warning" }`.
  - `kind ∈ {photo_shared, update_posted, milestone_reached, weekly_summary, scope_change, homeowner_request, decision_made, site_health_flag}`.
  - `link.type` → web route: `feed_photo`→feed/photo · `update`/`milestone`→project timeline · `request`→Requests/chat · `decision`→decision detail · `finding`→Site Health.
- **Project-type select (Task D3):** reuse `OwnerFirstRun.tsx` `SITE_TYPES` verbatim — `residential / commercial / villa / interior / infra`, lowercase values, Title-Case labels via `auth.onboard.site.type.*`, default `residential`.
- **De-pollution = option (a):** stop creating the homeowner-request `Decision`; rewire the overdue nudge to a push (reuse `_alert_site_leads`). Leave `quiet.py` `[homeowner-quiet-nudge]` generic decisions untouched.
- **Copy rules (CDS):** sentence case; empty states are invitations, not apologies; no fabricated `0`/`₹0`.
- **Discipline:** DRY · YAGNI · TDD (failing test first) · frequent commits (one per task).

## Task ordering & cross-slice dependencies

Recommended execution order and the seams to respect:

1. **Slice A** (backend `/activity`) — independent. Land first so the contract is real.
2. **Slice B** (backend de-pollution) — independent of A; can land in parallel.
3. **Slice D** (NewProjectModal + **ProjectsStrip**) — **before C6**, because `OwnerHome` (C6) imports `ProjectsStrip` (D4).
4. **Slice C** (activity client + OwnerHome) — C works against mocks without a live backend, but C6 consumes D4's `ProjectsStrip`.
5. **Slice E** (Requests + nav) — independent; land last so the nav audit sees the final route set.

**Deduplicated shared edits (do NOT double-apply):**
- `qk.activity` query key is added **once** — canonically in **Task C1**. Task D1's "add `qk.activity`" is redundant; D1 should only add `sitesApi.create` and may assume `qk.activity` exists (or add it defensively only if C1 has not run). Whichever task runs first adds it; the second checks for its presence.
- `activityApi` is defined once (Task C1); every other task imports it.

## Plan reconciliations (NORMATIVE — read first; these override any slice body on conflict)

The plan was drafted in 5 parallel slices then adversarially reviewed by 3 critics. Where a slice
body conflicts with a rule below, **this section wins.**

- **R1 — `ProjectsStrip` prop contract = `{ sites }` (Task D4 wins).** `ProjectsStrip` is
  `function ProjectsStrip({ sites }: { sites: Site[] })` and owns its own `NewProjectModal`. In
  **Task C6**, `OwnerHome` renders `<ProjectsStrip sites={sitesQ.data?.items ?? []} />` — do **not**
  pass `selectedSiteId`/`onSelectSite`. Delete those from the C6 import, the C6 placeholder type,
  and the C6 cross-slice note. Per-project filtering stays owned by `ActivityStream`'s own filter.
- **R2 — `qk.activity(siteId?: string)` positional (Task C1 wins).** Define once in C1:
  `activity: (siteId?: string) => ['activity', siteId ?? null] as const`. **Task D1** must NOT
  redefine it — assume it exists; rewrite D1's test to `qk.activity('s1') → ['activity','s1']` and
  `qk.activity() → ['activity', null]`. Also add `activitySummary: () => ['activity','summary'] as const`
  to the factory (C1) and use `qk.activitySummary()` for the OwnerHome hero-summary query in C6
  (no raw string tuple). `NewProjectModal` (D3) invalidating `qk.activity()` partial-matches the
  `['activity', …]` prefix and refreshes the summary too — intended.
- **R3 — Cold-start = "no projects yet" only (honest gate).** In **Task E5**, change the
  `_setup_checklist` completion gate in `app/dashboard/aggregate.py` from
  `if has_sites and any_events and any_baseline: return None` to **`if has_sites: return None`**, so a
  real project with no activity shows the command center (with honest empty states), never a
  checklist stuck on a dead labor baseline. Steps become `add_project` (done=`has_sites`),
  `invite_team` (done=`any_events`), `start_chat` (done=`any_events`); drop `connect_whatsapp` and
  `set_baseline`. **`/dashboard/home` is NOT retired** — keep it solely to serve `cold_start` +
  `setup_checklist`; hero COUNTS still come from `/activity`'s `summary`. C6 keeps gating on
  `!cold_start` (now correct: checklist only at zero projects).
- **R4 — E5 updates two EXISTING tests in the same commit (0-regression gate).** Verified present:
  `tests/test_dashboard_api.py:70-72` and `tests/test_dashboard_aggregate.py:142,152-154` assert the
  OLD keys `{add_site, connect_whatsapp, set_baseline}`. Rewrite both to
  `{add_project, invite_team, start_chat}` (`add_project` done = `has_sites`) and add a step running
  `pytest tests/test_dashboard_aggregate.py tests/test_dashboard_api.py -v` before committing.
- **R5 — Every i18n task adds BOTH `en.ts` and `hi.ts` keys.** `hi.ts` is
  `Record<TranslationKey, string>` (a FULL map, verified `hi.ts:5`) — a new `en` key with no matching
  `hi` key fails `tsc -b`. Ignore any slice note calling `hi` "Partial"/"optional". Tasks **C2, D2,
  E2, E4** must add each new key to `hi.ts` too (Hindi may reuse the English string as fallback).
- **R6 — One empty-state key per region (delete duplicates).** Canonical: activity-empty =
  `activity.empty.title` + `activity.empty.hint`; needs-you-empty = `owner.needs.empty_clean`;
  projects-empty = the `+ New project` tile IS the invitation (no separate copy). In **C2/C4**,
  ActivityStream renders `activity.empty.title`/`.hint` (drop flat `activity.empty`/`activity.empty_hint`).
  In **E2**, delete the unused `owner.needsyou.empty.*` and `owner.projects.empty.*` keys. Fix the
  honest-empty reference table to name only keys actually rendered.
- **R7 — `scope_change` link = `update` → project timeline (align to spec §4.1).** In **Task A1**
  `_map_change`, emit `link = { type: "update", id: <change.site_id> }` (the site id, NOT the change
  id) so it opens the project timeline like other updates. Fix the shared-contract line and the C
  mock fixture to `update`.
- **R8 — `sitesApi.create` returns a precise `SiteOut`.** In **Task D1**, type the create response as
  `{ id: string; company_id: string; name: string; type: string | null; location: string | null; status: string | null }`
  (matches `app/sites/schemas.py::SiteOut` — no `created_at`). Do not alias the fuller web `Site`.
- **R9 — `DecisionLog` is RETAINED (clean post-Slice-B).** In **C5/C6**, `NeedsYou` keeps rendering
  `<DecisionLog siteNames={siteNames} />` as the owner's decision history. Only `Portfolio` (pulse)
  and `ThisWeek` (ledger) are removed — do not delete `DecisionLog`.
- **R10 — B6 columns exist, no change.** `Decision.resolved_at` + `Decision.resolution_note` both
  exist (`app/models/decision.py:83-84`); B6's writes and the `resolved_at is not None` assertion are
  valid as written.
- **R11 — E4 nav-test check.** In **Task E4**, grep `AppShell.test.tsx` / `AppShell.neev.test.tsx` for
  owner-tab-count or specific-tab (e.g. Spec-desk) assertions and update them in the same task; keep
  them in the task's verify command.
- **R12 — Path citation.** Site-types source is `src/pages/auth/OwnerFirstRun.tsx` (`SITE_TYPES`
  L13-19, create call ~L89). Normalize any divergent citation.

---
# Slice A — Backend `GET /api/v1/activity` endpoint

Builds the activity-feed backend for the Owner activity-first Command Center: a pure
side-effect-free aggregator (`app/activity/aggregate.py`), Pydantic response shapes
(`app/activity/schemas.py`), and a company-scoped, keyset-paginated router
(`app/activity/router.py`) unioning 9 real source tables into one time-ordered feed.

## Shared contract this slice implements (do not diverge)

- **Endpoint:** `GET /api/v1/activity?site_id={uuid?}&cursor={iso8601?}&limit=20`
- **Response:** `{ "items": ActivityItem[], "summary": { "updates_today": int, "needs_decision_count": int, "sites_total": int }, "next_cursor": string|null }`
- **ActivityItem:** `{ id: "{kind}:{row_uuid}", kind, site_id, site_name, title, subtitle|null, occurred_at (iso8601), actor|null, link: {type, id}, severity: "info"|"success"|"warning" }`
- **kind enum:** `photo_shared | update_posted | milestone_reached | weekly_summary | scope_change | homeowner_request | decision_made | site_health_flag`
- **link.type enum:** `feed_photo | update | milestone | request | decision | finding`
- **Union sources** (all have `site_id` + a timestamp column):
  - `published_photos` → `published_at` → kind `photo_shared`, link `feed_photo`, severity `success`
  - `updates` → `published_at` → kind `update_posted`, link `update`, severity from update type (delay→`warning`, else `info`)
  - `milestones` (`status==done`) → `completed_on` → kind `milestone_reached`, link `milestone`, severity `success`
  - `weekly_summaries` → `week_start` → kind `weekly_summary`, link `update`, severity `info`
  - `changes` → `created_at` → kind `scope_change`, link `decision`, severity `warning`
  - `homeowner_requests` → `created_at` (severity `warning` if overdue else `info`) → kind `homeowner_request`, link `request`
  - `decisions` (`kind in {approval, hold_payment}`) → `created_at` → kind `decision_made`, link `decision`, severity `info`
  - `site_findings` (`status=="open"`) → `detected_on` → kind `site_health_flag`, link `finding`, severity from finding severity (high/critical→`warning`, else `info`)
- **summary:** `updates_today` = count of items whose `occurred_at` date == today (UTC); `needs_decision_count` = count of open `homeowner_requests` + open `decisions` (kind approval|hold_payment, state pending) in scope; `sites_total` = number of in-scope sites.
- **Keyset cursor:** ordered by `occurred_at DESC`, then `id` (string) DESC as tiebreak. Cursor encodes the last item's `(occurred_at_iso, id)`; the next page returns items strictly "after" (older-or-equal-ts-but-smaller-id). Cursor is opaque via `app.common.pagination.encode_cursor` / `decode_cursor` (base64) wrapping a `"{iso8601}|{id}"` payload.

## Grounding notes (verified against real source)

- Router-registration pattern (`app/main.py`): `from app.<mod>.router import router as <x>_router` at the import block (lines 18–59) + `app.include_router(<x>_router)` in the mount block (lines 111–154). Approvals is line 20 / 126; dashboard line 34 / 123.
- Auth + company scoping mirror `app/dashboard/router.py`: `user: User = Depends(get_current_user)`, `session: AsyncSession = Depends(get_session)`, then `visible = await visible_site_ids(session, user)` (from `app.auth.scoping`) → owner/pm/architect get all company sites, others get `[]` (cold/empty). `visible_site_ids` returns `list[UUID]`.
- Pure-aggregator style mirrors `app/dashboard/aggregate.py`: functions take already-loaded ORM rows and return JSON-able dicts; the router is the only place that touches the session.
- Pagination helpers exist: `app.common.pagination.encode_cursor(str|None)->str|None`, `decode_cursor(str|None)->str|None` (raises `ValueError` on tampered input), `DEFAULT_LIMIT=50`, `MAX_LIMIT=200`. This slice uses its own default `limit=20` per contract but clamps via `MAX_LIMIT`.
- Models (all exported from `app.models`): `PublishedPhoto` (`published_at`), `Update`/`UpdateType` (`published_at`, `type`, `title`, `body`), `Milestone`/`MilestoneStatus` (`completed_on`, `status`, `name`), `WeeklySummary` (`week_start`, `text`), `Change` (`created_at`, `description`), `HomeownerRequest`/`HomeownerRequestStatus` (`created_at`, `title`, `status`, `sla_due_at`), `Decision`/`DecisionKind`/`DecisionState` (`created_at`, `kind`, `title`, `state`), `SiteFinding` (`detected_on`, `status`, `headline`, `severity`), `Site` (`name`, `company_id`).
- `Milestone.completed_on`, `SiteFinding.detected_on`, `WeeklySummary.week_start` are **`date`** not `datetime`. The aggregator normalizes every timestamp to a timezone-aware UTC `datetime` (a bare `date` → midnight UTC) so ordering/cursor is uniform.
- Test fixtures (`tests/conftest.py`): `client` (AsyncClient with `get_session` overridden), `db_session`, `factory` (`.company()`, `.user(company, role)`, `.site(company)`). Auth header helper pattern from `tests/test_dashboard_api.py`: `create_access_token(str(user.id), user.role.value)`.

---

### Task A1: Pure activity aggregator — `build_activity` over loaded rows

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/activity/__init__.py` (empty)
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/activity/aggregate.py`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/test_activity_aggregate.py`

**Interfaces:**
- Consumes: ORM rows `PublishedPhoto, Update, Milestone, WeeklySummary, Change, HomeownerRequest, Decision, SiteFinding` (from `app.models`); `Site` for id→name map.
- Produces:
  - `def build_activity(*, sites: list[Site], photos, updates, milestones, weekly_summaries, changes, requests, decisions, findings, now: datetime, limit: int, cursor: tuple[str, str] | None) -> dict` returning `{"items": list[dict], "summary": dict, "next_cursor": tuple[str,str] | None}` where each item dict matches the ActivityItem contract (with `occurred_at` as iso8601 str) and `summary` = `{"updates_today", "needs_decision_count", "sites_total"}`.
  - `def _item_sort_key(item: dict) -> tuple[str, str]` → `(occurred_at_iso, id)` for DESC ordering.
  - Constants `KIND_*`, `LINK_*` mirroring the enums.

- [ ] **Step 1: Write the failing test** — create `tests/test_activity_aggregate.py`:
```python
"""Unit tests for the pure activity aggregation (no DB, no network)."""
from __future__ import annotations

import datetime as dt
from types import SimpleNamespace
from uuid import uuid4

from app.activity.aggregate import build_activity

NOW = dt.datetime(2026, 7, 3, 12, 0, 0, tzinfo=dt.UTC)
TODAY = NOW.date()
YESTERDAY = TODAY - dt.timedelta(days=1)


def _site(name="Tower B"):
    return SimpleNamespace(id=uuid4(), name=name)


def _photo(site_id, *, at):
    return SimpleNamespace(id=uuid4(), site_id=site_id, caption="Slab poured",
                           published_at=at)


def _update(site_id, *, at, type="progress", title="Wall done"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, type=type, title=title,
                           body=None, published_at=at)


def _milestone(site_id, *, on, status="done", name="Foundation"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, status=status, name=name,
                           completed_on=on)


def _weekly(site_id, *, week_start):
    return SimpleNamespace(id=uuid4(), site_id=site_id, week_start=week_start,
                           text="Week 3 summary")


def _change(site_id, *, at, description="Add powder room"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, description=description,
                           created_at=at)


def _request(site_id, *, at, status="sent", overdue=False, title="Photo of kitchen"):
    sla = NOW - dt.timedelta(hours=1) if overdue else NOW + dt.timedelta(days=2)
    return SimpleNamespace(id=uuid4(), site_id=site_id, title=title, status=status,
                           sla_due_at=sla, created_at=at)


def _decision(site_id, *, at, kind="approval", state="pending", title="Approve advance"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, kind=kind, state=state,
                           title=title, created_at=at)


def _finding(site_id, *, on, status="open", severity="high", headline="Schedule drift"):
    return SimpleNamespace(id=uuid4(), site_id=site_id, status=status,
                           severity=severity, headline=headline, detected_on=on)


def _empty(**over):
    base = dict(photos=[], updates=[], milestones=[], weekly_summaries=[],
                changes=[], requests=[], decisions=[], findings=[])
    base.update(over)
    return base


def test_maps_each_source_to_activity_item():
    site = _site()
    photo = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[photo]))
    assert len(res["items"]) == 1
    item = res["items"][0]
    assert item["id"] == f"photo_shared:{photo.id}"
    assert item["kind"] == "photo_shared"
    assert item["site_id"] == str(site.id)
    assert item["site_name"] == "Tower B"
    assert item["link"] == {"type": "feed_photo", "id": str(photo.id)}
    assert item["severity"] == "success"
    assert item["occurred_at"] == NOW.isoformat()


def test_orders_all_sources_by_occurred_at_desc_id_tiebreak():
    site = _site()
    older = _update(site.id, at=NOW - dt.timedelta(hours=2))
    newer = _photo(site.id, at=NOW)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[newer], updates=[older]))
    ids = [i["id"] for i in res["items"]]
    assert ids == [f"photo_shared:{newer.id}", f"update_posted:{older.id}"]


def test_date_sourced_rows_normalize_to_midnight_utc():
    site = _site()
    ms = _milestone(site.id, on=YESTERDAY)
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(milestones=[ms]))
    item = res["items"][0]
    assert item["kind"] == "milestone_reached"
    assert item["occurred_at"] == dt.datetime(
        YESTERDAY.year, YESTERDAY.month, YESTERDAY.day, tzinfo=dt.UTC
    ).isoformat()


def test_delay_update_is_warning_progress_is_info():
    site = _site()
    delay = _update(site.id, at=NOW, type="delay", title="Rain delay")
    prog = _update(site.id, at=NOW - dt.timedelta(minutes=1), type="progress")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(updates=[delay, prog]))
    by_id = {i["id"]: i for i in res["items"]}
    assert by_id[f"update_posted:{delay.id}"]["severity"] == "warning"
    assert by_id[f"update_posted:{prog.id}"]["severity"] == "info"


def test_overdue_request_is_warning_and_finding_severity_maps():
    site = _site()
    req = _request(site.id, at=NOW, overdue=True)
    finding = _finding(site.id, on=TODAY, severity="high")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(requests=[req], findings=[finding]))
    by_id = {i["id"]: i for i in res["items"]}
    assert by_id[f"homeowner_request:{req.id}"]["severity"] == "warning"
    assert by_id[f"homeowner_request:{req.id}"]["link"] == {"type": "request", "id": str(req.id)}
    assert by_id[f"site_health_flag:{finding.id}"]["severity"] == "warning"
    assert by_id[f"site_health_flag:{finding.id}"]["link"] == {"type": "finding", "id": str(finding.id)}


def test_summary_counts():
    site = _site()
    today_photo = _photo(site.id, at=NOW)
    old_photo = _photo(site.id, at=NOW - dt.timedelta(days=3))
    open_req = _request(site.id, at=NOW, status="sent")
    done_req = _request(site.id, at=NOW, status="done")
    pending_dec = _decision(site.id, at=NOW, state="pending")
    resolved_dec = _decision(site.id, at=NOW, state="resolved")
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[today_photo, old_photo],
                                  requests=[open_req, done_req],
                                  decisions=[pending_dec, resolved_dec]))
    summary = res["summary"]
    # both decisions are kind=approval so both surface as items; only pending counts as needs_decision
    assert summary["updates_today"] == sum(
        1 for i in res["items"]
        if dt.datetime.fromisoformat(i["occurred_at"]).date() == TODAY
    )
    assert summary["needs_decision_count"] == 2  # open_req + pending_dec
    assert summary["sites_total"] == 1


def test_keyset_trim_and_next_cursor():
    site = _site()
    items = [_photo(site.id, at=NOW - dt.timedelta(minutes=m)) for m in range(5)]
    res = build_activity(sites=[site], now=NOW, limit=2, cursor=None,
                         **_empty(photos=items))
    assert len(res["items"]) == 2
    last = res["items"][-1]
    assert res["next_cursor"] == (last["occurred_at"], last["id"])
    # Second page: pass the cursor, get the next 2 strictly-older items.
    page2 = build_activity(sites=[site], now=NOW, limit=2, cursor=res["next_cursor"],
                           **_empty(photos=items))
    assert len(page2["items"]) == 2
    assert all(
        (i["occurred_at"], i["id"]) < res["next_cursor"] for i in page2["items"]
    )
    assert res["items"][-1]["id"] not in {i["id"] for i in page2["items"]}


def test_last_page_returns_null_cursor():
    site = _site()
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[_photo(site.id, at=NOW)]))
    assert res["next_cursor"] is None
```

- [ ] **Step 2: Run test, verify it fails**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_activity_aggregate.py -v`
  Expected: `ModuleNotFoundError: No module named 'app.activity'` (or collection error) — all tests error/fail.

- [ ] **Step 3: Minimal implementation** — create `app/activity/__init__.py` (empty), then `app/activity/aggregate.py`:
```python
"""Pure aggregation for the Owner activity-first Command Center.

Side-effect-free: takes already-loaded ORM rows across nine homeowner-feed /
decision / finding source tables, maps each to a uniform ActivityItem, merges
them into ONE time-ordered feed (occurred_at DESC, id tiebreak), applies the
keyset cursor, and computes the headline summary. The router (``router.py``) is
the only place that touches the session; everything here is trivially unit
testable without a DB (mirrors ``app/dashboard/aggregate.py``).
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
    SiteFinding,
    Site,
    Update,
    WeeklySummary,
)

# --- kind enum (contract) ---------------------------------------------------
KIND_PHOTO = "photo_shared"
KIND_UPDATE = "update_posted"
KIND_MILESTONE = "milestone_reached"
KIND_WEEKLY = "weekly_summary"
KIND_SCOPE = "scope_change"
KIND_REQUEST = "homeowner_request"
KIND_DECISION = "decision_made"
KIND_FINDING = "site_health_flag"

# --- link.type enum (contract) ----------------------------------------------
LINK_FEED_PHOTO = "feed_photo"
LINK_UPDATE = "update"
LINK_MILESTONE = "milestone"
LINK_REQUEST = "request"
LINK_DECISION = "decision"
LINK_FINDING = "finding"

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
) -> dict:
    return {
        "id": f"{kind}:{row_id}",
        "kind": kind,
        "site_id": str(site.id),
        "site_name": site.name,
        "title": title,
        "subtitle": subtitle,
        "occurred_at": _as_utc(occurred_at).isoformat(),
        "actor": actor,
        "link": {"type": link_type, "id": str(link_id)},
        "severity": severity,
    }


def _finding_severity(sev: str | None) -> str:
    return "warning" if (sev or "").lower() in {"high", "critical"} else "info"


def _map_photo(p: PublishedPhoto, site: Site) -> dict:
    return _item(kind=KIND_PHOTO, row_id=p.id, site=site,
                 title=p.caption or "New photo", subtitle=None,
                 occurred_at=p.published_at, actor=None,
                 link_type=LINK_FEED_PHOTO, link_id=p.id, severity="success")


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
    return _item(kind=KIND_SCOPE, row_id=c.id, site=site,
                 title=c.description, subtitle=None, occurred_at=c.created_at,
                 actor=None, link_type=LINK_DECISION, link_id=c.id,
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
                 title=r.title, subtitle=None, occurred_at=r.created_at,
                 actor=None, link_type=LINK_REQUEST, link_id=r.id, severity=sev)


def _map_decision(d: Decision, site: Site) -> dict:
    return _item(kind=KIND_DECISION, row_id=d.id, site=site,
                 title=d.title, subtitle=d.detail if hasattr(d, "detail") else None,
                 occurred_at=d.created_at, actor=None,
                 link_type=LINK_DECISION, link_id=d.id, severity="info")


def _map_finding(f: SiteFinding, site: Site) -> dict:
    return _item(kind=KIND_FINDING, row_id=f.id, site=site,
                 title=f.headline, subtitle=None, occurred_at=f.detected_on,
                 actor=None, link_type=LINK_FINDING, link_id=f.id,
                 severity=_finding_severity(f.severity))


def _sort_key(item: dict) -> tuple[str, str]:
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
) -> dict:
    """Union → sort → keyset-trim → summarize. All rows must already be in scope.

    ``cursor`` is the ``(occurred_at_iso, id)`` of the last item of the previous
    page; only strictly-older items (by the DESC sort key) are returned.
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

    # occurred_at DESC, then id DESC as tiebreak (deterministic).
    items.sort(key=_sort_key, reverse=True)

    # Summary is computed over the FULL in-scope set (before keyset trim), so the
    # headline counts don't change as the owner pages.
    today = now.astimezone(dt.UTC).date()
    updates_today = sum(
        1
        for it in items
        if dt.datetime.fromisoformat(it["occurred_at"]).astimezone(dt.UTC).date() == today
    )
    needs_decision = sum(
        1 for r in requests
        if sites_by_id.get(r.site_id) is not None
        and str(r.status) in _OPEN_REQUEST_STATUSES
    ) + sum(
        1 for d in decisions
        if sites_by_id.get(d.site_id) is not None
        and str(d.kind) in _DECISION_KINDS
        and str(d.state) in _OPEN_DECISION_STATES
    )
    summary = {
        "updates_today": updates_today,
        "needs_decision_count": needs_decision,
        "sites_total": len(sites),
    }

    # Keyset: drop everything at-or-newer than the cursor (DESC), then take limit.
    if cursor is not None:
        items = [it for it in items if _sort_key(it) < tuple(cursor)]

    next_cursor: tuple[str, str] | None = None
    if len(items) > limit:
        items = items[:limit]
        last = items[-1]
        next_cursor = (last["occurred_at"], last["id"])

    return {"items": items, "summary": summary, "next_cursor": next_cursor}
```

- [ ] **Step 4: Run test, verify pass**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/activity/aggregate.py tests/test_activity_aggregate.py && pytest tests/test_activity_aggregate.py -v`
  Expected: ruff clean; 8 passed.

- [ ] **Step 5: Commit**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && git add app/activity/__init__.py app/activity/aggregate.py tests/test_activity_aggregate.py && git commit -m "feat(activity): pure activity-feed aggregator over 9 sources"` (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)

---

### Task A2: Pydantic response schemas

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/activity/schemas.py`
- Test: covered by the router API test in A4 (schemas are validated end-to-end through `response_model`); no standalone unit test file.

**Interfaces:**
- Consumes: item dict shape produced by `build_activity` (Task A1).
- Produces: `ActivityLinkOut`, `ActivityItemOut`, `ActivitySummaryOut`, `ActivityPageOut` (Pydantic `BaseModel`s) used as the router `response_model`.

- [ ] **Step 1: Write the failing test** — add a fast import/shape assertion to the aggregate test file so this task is independently verifiable (real, not a placeholder). Append to `tests/test_activity_aggregate.py`:
```python
def test_schemas_accept_aggregator_items():
    from types import SimpleNamespace as NS

    from app.activity.schemas import ActivityPageOut

    site = _site()
    res = build_activity(sites=[site], now=NOW, limit=20, cursor=None,
                         **_empty(photos=[_photo(site.id, at=NOW)]))
    # next_cursor tuple → encoded string is the router's job; here assert the
    # item/summary shapes validate.
    page = ActivityPageOut(items=res["items"], summary=res["summary"],
                           next_cursor=None)
    assert page.items[0].kind == "photo_shared"
    assert page.items[0].link.type == "feed_photo"
    assert page.summary.sites_total == 1
    _ = NS  # keep import local, no external dep
```

- [ ] **Step 2: Run test, verify it fails**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_activity_aggregate.py::test_schemas_accept_aggregator_items -v`
  Expected: `ModuleNotFoundError: No module named 'app.activity.schemas'`.

- [ ] **Step 3: Minimal implementation** — create `app/activity/schemas.py`:
```python
"""Pydantic response shapes for GET /api/v1/activity.

These mirror the shared ActivityItem contract exactly and are used as the
router's ``response_model`` so FastAPI serializes/validates the aggregator's
plain dicts.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

ActivityKind = Literal[
    "photo_shared",
    "update_posted",
    "milestone_reached",
    "weekly_summary",
    "scope_change",
    "homeowner_request",
    "decision_made",
    "site_health_flag",
]
LinkType = Literal[
    "feed_photo", "update", "milestone", "request", "decision", "finding"
]
Severity = Literal["info", "success", "warning"]


class ActivityLinkOut(BaseModel):
    type: LinkType
    id: str


class ActivityItemOut(BaseModel):
    id: str
    kind: ActivityKind
    site_id: str
    site_name: str
    title: str
    subtitle: str | None = None
    occurred_at: str  # iso8601
    actor: str | None = None
    link: ActivityLinkOut
    severity: Severity


class ActivitySummaryOut(BaseModel):
    updates_today: int
    needs_decision_count: int
    sites_total: int


class ActivityPageOut(BaseModel):
    items: list[ActivityItemOut]
    summary: ActivitySummaryOut
    next_cursor: str | None = None
```

- [ ] **Step 4: Run test, verify pass**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/activity/schemas.py && pytest tests/test_activity_aggregate.py::test_schemas_accept_aggregator_items -v`
  Expected: ruff clean; 1 passed.

- [ ] **Step 5: Commit**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && git add app/activity/schemas.py tests/test_activity_aggregate.py && git commit -m "feat(activity): pydantic response schemas for activity page"` (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)

---

### Task A3: Cursor codec (iso8601|id ↔ opaque string) helpers in the router module

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/activity/router.py` (cursor helpers portion only; the endpoint is added in A4 — but both land in one file, so this task adds ONLY the two pure helper functions + module skeleton so they can be unit-tested first)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/test_activity_cursor.py`

**Interfaces:**
- Consumes: `app.common.pagination.encode_cursor`, `decode_cursor` (base64 codec over a string).
- Produces:
  - `def encode_activity_cursor(cursor: tuple[str, str] | None) -> str | None` — packs `(occurred_at_iso, id)` into `"{iso}|{id}"` then base64.
  - `def decode_activity_cursor(raw: str | None) -> tuple[str, str] | None` — inverse; raises `AppError(400, "invalid_cursor", ...)` on tampered input.

- [ ] **Step 1: Write the failing test** — create `tests/test_activity_cursor.py`:
```python
"""Round-trip + tamper tests for the activity keyset cursor codec."""
from __future__ import annotations

import pytest

from app.activity.router import decode_activity_cursor, encode_activity_cursor
from app.common.errors import AppError


def test_none_roundtrips_to_none():
    assert encode_activity_cursor(None) is None
    assert decode_activity_cursor(None) is None


def test_roundtrip_preserves_tuple():
    cur = ("2026-07-03T12:00:00+00:00", "photo_shared:1a2b")
    token = encode_activity_cursor(cur)
    assert isinstance(token, str)
    assert decode_activity_cursor(token) == cur


def test_id_may_contain_no_delimiter_collision():
    # ids are "{kind}:{uuid}" which never contain '|', so split is unambiguous.
    cur = ("2026-07-03T00:00:00+00:00", "site_health_flag:deadbeef")
    assert decode_activity_cursor(encode_activity_cursor(cur)) == cur


def test_tampered_cursor_raises_apperror():
    with pytest.raises(AppError) as exc:
        decode_activity_cursor("!!!not-base64!!!")
    assert exc.value.status_code == 400
    assert exc.value.code == "invalid_cursor"


def test_missing_delimiter_raises_apperror():
    from app.common.pagination import encode_cursor

    bad = encode_cursor("no-pipe-here")  # valid base64, wrong payload shape
    with pytest.raises(AppError) as exc:
        decode_activity_cursor(bad)
    assert exc.value.status_code == 400
```

- [ ] **Step 2: Run test, verify it fails**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_activity_cursor.py -v`
  Expected: `ModuleNotFoundError: No module named 'app.activity.router'`.

- [ ] **Step 3: Minimal implementation** — create `app/activity/router.py` with just the codec + imports (endpoint added in A4). Verify `AppError` signature first: it is used as `AppError(400, "invalid_cursor", "msg")` and exposes `.status_code` + `.code` (mirror `app/approvals/router.py` usage `raise AppError(400, "invalid_cursor", "Malformed pagination cursor")`; `.code` attribute confirmed by `app.common.errors`). File content:
```python
"""GET /api/v1/activity — the Owner activity-first Command Center feed.

Company-scoped, keyset-paginated union over nine homeowner-feed / decision /
finding source tables. The session work (loading rows per source, ordered +
capped) lives here; the merge/sort/summary is the pure ``aggregate.build_activity``.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity.aggregate import build_activity
from app.activity.schemas import ActivityPageOut
from app.auth.deps import get_current_user
from app.auth.scoping import visible_site_ids
from app.common.errors import AppError
from app.common.pagination import MAX_LIMIT, decode_cursor, encode_cursor
from app.db import get_session
from app.models import (
    Change,
    Decision,
    HomeownerRequest,
    Milestone,
    PublishedPhoto,
    SiteFinding,
    Site,
    Update,
    User,
    WeeklySummary,
)

router = APIRouter(prefix="/api/v1", tags=["activity"])

DEFAULT_ACTIVITY_LIMIT = 20


def encode_activity_cursor(cursor: tuple[str, str] | None) -> str | None:
    """Pack ``(occurred_at_iso, id)`` into an opaque base64 token."""
    if cursor is None:
        return None
    occurred_at, item_id = cursor
    return encode_cursor(f"{occurred_at}|{item_id}")


def decode_activity_cursor(raw: str | None) -> tuple[str, str] | None:
    """Inverse of :func:`encode_activity_cursor`; 400 on tampered input."""
    if raw is None:
        return None
    try:
        payload = decode_cursor(raw)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc
    if payload is None or "|" not in payload:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor")
    occurred_at, item_id = payload.split("|", 1)
    return (occurred_at, item_id)
```

- [ ] **Step 4: Run test, verify pass**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/activity/router.py tests/test_activity_cursor.py && pytest tests/test_activity_cursor.py -v`
  Expected: ruff clean; 5 passed. (Ruff may flag unused imports that A4 will use — if so, temporarily this task's ruff run scopes to the two helper-relevant modules; the endpoint added in A4 consumes all imports. To keep A3 ruff-clean, add the endpoint stub in the SAME step: see note below.)

  NOTE to implementer: to avoid an unused-import failure in A3, include the endpoint from A4 in this file now OR add `# noqa` — cleanest is to merge A3+A4 into one commit if ruff complains. The endpoint (A4) uses every imported symbol, so land A4 immediately after.

- [ ] **Step 5: Commit**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && git add app/activity/router.py tests/test_activity_cursor.py && git commit -m "feat(activity): keyset cursor codec for activity feed"` (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)

---

### Task A4: The `GET /api/v1/activity` endpoint + register the router

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/activity/router.py` (add the endpoint function after the cursor codec from A3)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/main.py` (import at the block ~lines 18–59, mount at the block ~lines 111–154)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/test_activity_api.py`

**Interfaces:**
- Consumes: `build_activity` (A1), `ActivityPageOut` (A2), `encode_activity_cursor`/`decode_activity_cursor` (A3), `visible_site_ids` (from `app.auth.scoping`), `get_current_user`/`get_session`.
- Produces: `GET /api/v1/activity` returning `ActivityPageOut`; router mounted as `activity_router` in `app/main.py`.

- [ ] **Step 1: Write the failing test** — create `tests/test_activity_api.py`:
```python
"""API tests for GET /api/v1/activity (DB, no network)."""
from __future__ import annotations

import datetime as dt

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    Decision,
    DecisionKind,
    HomeownerRequest,
    PublishedPhoto,
    Site,
    Update,
    UserRole,
)

NOW = dt.datetime(2026, 7, 3, 12, 0, 0, tzinfo=dt.UTC)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def _site(db_session, company_id, name="Tower B"):
    site = Site(company_id=company_id, name=name)
    db_session.add(site)
    await db_session.flush()
    return site


async def _photo(db_session, site_id, *, at, caption="Slab poured"):
    p = PublishedPhoto(site_id=site_id, image_url="https://x/y.jpg",
                       caption=caption, published_at=at)
    db_session.add(p)
    await db_session.flush()
    return p


async def _update(db_session, site_id, *, at, type="progress", title="Wall done"):
    u = Update(site_id=site_id, type=type, title=title, published_at=at)
    db_session.add(u)
    await db_session.flush()
    return u


async def _request(db_session, site_id, *, at, status="sent"):
    r = HomeownerRequest(site_id=site_id, title="Photo of kitchen", status=status,
                         created_at=at)
    db_session.add(r)
    await db_session.flush()
    return r


async def _decision(db_session, company_id, site_id, *, at, state="pending"):
    d = Decision(company_id=company_id, site_id=site_id, kind=DecisionKind.approval,
                 title="Approve advance", created_at=at)
    db_session.add(d)
    await db_session.flush()
    d.created_at = at  # override server_default for deterministic ordering
    await db_session.flush()
    return d


async def test_activity_requires_auth(client):
    resp = await client.get("/api/v1/activity")
    assert resp.status_code == 401


async def test_activity_unions_and_orders_desc(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    older = await _update(db_session, site.id, at=NOW - dt.timedelta(hours=2))
    newer = await _photo(db_session, site.id, at=NOW)
    await db_session.commit()

    resp = await client.get("/api/v1/activity", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    ids = [i["id"] for i in body["items"]]
    assert ids[0] == f"photo_shared:{newer.id}"
    assert f"update_posted:{older.id}" in ids
    # newest first
    assert ids.index(f"photo_shared:{newer.id}") < ids.index(f"update_posted:{older.id}")


async def test_activity_summary_counts(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    await _photo(db_session, site.id, at=NOW)
    await _request(db_session, site.id, at=NOW, status="sent")
    await _decision(db_session, owner.company_id, site.id, at=NOW, state="pending")
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    s = body["summary"]
    assert s["sites_total"] == 1
    assert s["needs_decision_count"] == 2  # open request + pending decision
    assert s["updates_today"] >= 1


async def test_activity_site_id_filter(client, db_session, owner):
    a = await _site(db_session, owner.company_id, name="Site A")
    b = await _site(db_session, owner.company_id, name="Site B")
    await _photo(db_session, a.id, at=NOW)
    await _photo(db_session, b.id, at=NOW)
    await db_session.commit()

    body = (await client.get(f"/api/v1/activity?site_id={a.id}", headers=auth(owner))).json()
    site_ids = {i["site_id"] for i in body["items"]}
    assert site_ids == {str(a.id)}
    assert body["summary"]["sites_total"] == 1


async def test_activity_keyset_pagination_boundary(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    for m in range(5):
        await _photo(db_session, site.id, at=NOW - dt.timedelta(minutes=m),
                     caption=f"p{m}")
    await db_session.commit()

    page1 = (await client.get("/api/v1/activity?limit=2", headers=auth(owner))).json()
    assert len(page1["items"]) == 2
    assert page1["next_cursor"] is not None
    seen = [i["id"] for i in page1["items"]]

    page2 = (
        await client.get(
            f"/api/v1/activity?limit=2&cursor={page1['next_cursor']}",
            headers=auth(owner),
        )
    ).json()
    assert len(page2["items"]) == 2
    # No overlap across the boundary.
    assert not (set(seen) & {i["id"] for i in page2["items"]})
    # Strictly older than the last item of page1.
    last1 = page1["items"][-1]["occurred_at"]
    assert all(i["occurred_at"] <= last1 for i in page2["items"])


async def test_activity_bad_cursor_is_400(client, owner):
    resp = await client.get("/api/v1/activity?cursor=%21%21bad", headers=auth(owner))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_cursor"


async def test_activity_scopes_to_company(client, db_session, factory, owner):
    other = await factory.company(name="Other Co")
    other_site = await _site(db_session, other.id, name="Secret Site")
    await _photo(db_session, other_site.id, at=NOW, caption="secret")

    mine = await _site(db_session, owner.company_id, name="My Site")
    await _photo(db_session, mine.id, at=NOW, caption="mine")
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    names = {i["site_name"] for i in body["items"]}
    assert names == {"My Site"}
    assert body["summary"]["sites_total"] == 1
```

  NOTE: `resp.json()["error"]["code"]` assumes `AppError` renders as `{"error": {"code": ...}}`. Implementer: confirm the shape from `app/common/errors.py` `install_error_handlers` and adjust the assertion to the real envelope if it differs (e.g. `resp.json()["code"]`). The status code 400 is the load-bearing assertion.

- [ ] **Step 2: Run test, verify it fails**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_activity_api.py -v`
  Expected: all requests 404 (router not mounted) → assertions fail (e.g. `assert 404 == 200`).

- [ ] **Step 3: Minimal implementation** — append the endpoint to `app/activity/router.py` (after the cursor codec from A3):
```python
@router.get("/activity", response_model=ActivityPageOut)
async def get_activity(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(DEFAULT_ACTIVITY_LIMIT),
) -> ActivityPageOut:
    """The unified, time-ordered owner activity feed (keyset-paginated)."""
    page_size = DEFAULT_ACTIVITY_LIMIT if limit <= 0 else min(limit, MAX_LIMIT)
    decoded = decode_activity_cursor(cursor)

    visible = await visible_site_ids(session, user)
    if site_id is not None:
        # Narrow to the requested site, but only if it is in scope.
        visible = [sid for sid in visible if sid == site_id]
    if not visible:
        empty = build_activity(
            sites=[], photos=[], updates=[], milestones=[], weekly_summaries=[],
            changes=[], requests=[], decisions=[], findings=[],
            now=dt.datetime.now(dt.UTC), limit=page_size, cursor=decoded,
        )
        return ActivityPageOut(
            items=empty["items"], summary=empty["summary"],
            next_cursor=encode_activity_cursor(empty["next_cursor"]),
        )

    sites = list(
        (await session.execute(select(Site).where(Site.id.in_(visible)))).scalars().all()
    )

    # Per-source: newest first, capped at page_size+1 so the pure merge can
    # detect the "there is a next page" boundary even after cross-source merge.
    # We over-fetch (page_size + 1) per source; the aggregator applies the true
    # keyset trim across the merged set.
    cap = page_size + 1

    async def _load(model, order_col):
        stmt = select(model).where(model.site_id.in_(visible)).order_by(order_col.desc()).limit(cap)
        return list((await session.execute(stmt)).scalars().all())

    photos = await _load(PublishedPhoto, PublishedPhoto.published_at)
    updates = await _load(Update, Update.published_at)
    milestones = list(
        (
            await session.execute(
                select(Milestone)
                .where(Milestone.site_id.in_(visible), Milestone.status == "done")
                .order_by(Milestone.completed_on.desc())
                .limit(cap)
            )
        ).scalars().all()
    )
    weekly = await _load(WeeklySummary, WeeklySummary.week_start)
    changes = await _load(Change, Change.created_at)
    requests = await _load(HomeownerRequest, HomeownerRequest.created_at)
    decisions = list(
        (
            await session.execute(
                select(Decision)
                .where(
                    Decision.company_id == user.company_id,
                    Decision.site_id.in_(visible),
                    Decision.kind.in_(["approval", "hold_payment"]),
                )
                .order_by(Decision.created_at.desc())
                .limit(cap)
            )
        ).scalars().all()
    )
    findings = list(
        (
            await session.execute(
                select(SiteFinding)
                .where(SiteFinding.site_id.in_(visible), SiteFinding.status == "open")
                .order_by(SiteFinding.detected_on.desc())
                .limit(cap)
            )
        ).scalars().all()
    )

    result = build_activity(
        sites=sites, photos=photos, updates=updates, milestones=milestones,
        weekly_summaries=weekly, changes=changes, requests=requests,
        decisions=decisions, findings=findings,
        now=dt.datetime.now(dt.UTC), limit=page_size, cursor=decoded,
    )
    return ActivityPageOut(
        items=result["items"], summary=result["summary"],
        next_cursor=encode_activity_cursor(result["next_cursor"]),
    )
```
  Then register in `app/main.py`. Add to the import block (alphabetical, right after the `app.approvals` import at line 20):
```python
from app.activity.router import router as activity_router
```
  (Place it before `from app.admin.router import ...` at line 18 to keep the block sorted — `activity` < `admin`.) And add to the mount block (near line 123, alongside dashboard):
```python
app.include_router(activity_router)  # Owner activity-first command center feed
```

  NOTE on the keyset over-fetch: `cap = page_size + 1` per source guarantees at least `page_size + 1` merged candidates exist whenever a real next page exists across ANY single source, so `next_cursor` is correctly emitted. This matches the aggregator's `len(items) > limit` boundary check. For the multi-source deep-pagination edge (a later page whose items all come from a source that was truncated at `cap`), a follow-up can raise `cap` or switch to a UNION query; documented as a known bound, not a correctness bug for the first ~20-item pages the owner home shows.

- [ ] **Step 4: Run test, verify pass**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/activity/router.py app/main.py tests/test_activity_api.py && pytest tests/test_activity_api.py -v`
  Expected: ruff clean; 7 passed.

- [ ] **Step 5: Commit**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && git add app/activity/router.py app/main.py tests/test_activity_api.py && git commit -m "feat(activity): GET /api/v1/activity endpoint + register router"` (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)

---

### Task A5: Full-suite regression + ruff gate for the slice

**Files:**
- No new files. Verification-only task closing the slice.

**Interfaces:**
- Consumes: everything from A1–A4.
- Produces: green ruff + no regressions across the backend suite.

- [ ] **Step 1: Ruff the whole new package**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/activity tests/test_activity_aggregate.py tests/test_activity_cursor.py tests/test_activity_api.py`
  Expected: `All checks passed!`

- [ ] **Step 2: Run the slice tests together**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_activity_aggregate.py tests/test_activity_cursor.py tests/test_activity_api.py -v`
  Expected: all pass (9 aggregate + 5 cursor + 7 api = 21).

- [ ] **Step 3: Run the adjacent dashboard/approvals suites to confirm no cross-impact from the new mount**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/test_dashboard_api.py tests/test_dashboard_aggregate.py -v`
  Expected: all pass (no regressions from adding `activity_router` to `main.py`).

- [ ] **Step 4: Full backend suite (regression sweep)**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest -q`
  Expected: full suite green, 0 failures/0 errors (baseline was ~1367 passing per MEMORY; new tests add to it).

- [ ] **Step 5: Commit (only if any lint/format touch-ups were needed; otherwise skip)**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && git add -A && git commit -m "chore(activity): lint/format touch-ups after slice verification"` (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`) — skip if `git status` is clean.
# Slice B — Backend de-pollution + overdue-push rewire + one-time cleanup script

**Goal (Option (a) de-pollution):** STOP creating the homeowner-request shadow `Decision`
entirely (in both `surface_request_now` AND `run_request_nudge_sweep`), retire `_request_decision`,
and REWIRE the overdue sweep's escalation to a real push/notification to site leads — reusing the
exact mechanism `_alert_site_leads` already uses at request-creation
(`app.push.sender.notify_user`, targeting `User.role in {owner, pm}` for the site's company). The
one-nudge (`nudged_at`) contract and the returned-ids contract of `run_request_nudge_sweep` are
preserved. `app/homeowner/quiet.py` (`[homeowner-quiet-nudge]`) is left completely untouched.

**Grounding (real code read):**
- `app/homeowner/nudge.py` — `NUDGE_TAG`, `_request_decision`, `surface_request_now`,
  `run_request_nudge_sweep`, `_OPEN`, `_aware`. Currently both surface + sweep `session.add(_request_decision(...))`.
- `app/homeowner/router.py` L2246–2276 — `_alert_site_leads` uses `from app.push.sender import notify_user`,
  resolves `select(User.id).where(User.company_id == site.company_id, User.role.in_([UserRole.owner, UserRole.pm]))`,
  then `await notify_user(session, uid, title, body, data={...})`. This is the pattern to reuse.
- `app/push/sender.py` — `notify_user(session, user_id, title, body, *, data=None) -> list[str]` (best-effort, never raises).
- `app/bot/brief_delivery.py` L57 — `_open_decisions` selects ALL open decisions for a company (no NUDGE_TAG filter) → today a shadow nudge Decision leaks into the WhatsApp brief numbering. After Option (a) no such row exists.
- `app/notifications/feed.py` L76 — `build_feed` selects all `is_exception` decisions for a company (no NUDGE_TAG filter) → today the shadow nudge leaks into the contractor bell feed. After Option (a) it's gone.
- `app/homeowner/router.py` L2359 & L873 — `Decision.title.not_like(f"{NUDGE_TAG}%")` filters already hide the shadow row from the homeowner's asks; they become inert (harmless) once no such rows are created. Leave them in place (defensive; also filter any pre-existing rows until the cleanup script runs).
- `scripts/cleanup_meeting_action_items.py` — the dry-run/`--apply` idempotent one-off pattern (`run(session_factory=SessionLocal, *, apply=False)`, `main()` loads env via `scripts._bootstrap_env`, prints result).

**Verify commands (backend):**
`cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check <path> && pytest <path> -v`

---

### Task B1: Flip the overdue-sweep test to assert push-not-Decision

**Files:**
- Modify: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/homeowner/test_requests_decisions.py` — `test_request_nudge_sweep_fires_once` (L45–75)
- Test: same file (this task IS the test change)

**Interfaces:**
- Consumes: `run_request_nudge_sweep(session, *, now=None) -> list[UUID]` (unchanged signature), `app.push.sender` dry-run log (`sender.reset_dry_run_log()`, `sender.dry_run_log()`), `NUDGE_TAG` (still importable — the tag constant stays for the router filters + cleanup script).
- Produces: the flipped test contract that B4 must satisfy — overdue sweep raises NO `Decision`, and instead pushes to the site's owner/PM exactly once, with `nudged_at` stamped and ids returned.

Steps:

- [ ] **Step 1: Rewrite the test to assert push + no-Decision.** Replace the body of `test_request_nudge_sweep_fires_once` (currently asserting a tagged `Decision` was created) with a push-based assertion. Real code:
```python
async def test_request_nudge_sweep_fires_once(client, ctx, db_session):
    """De-pollution (Option a): the overdue sweep raises NO shadow Decision — it
    pushes the site leads instead — and still fires exactly once (nudged_at)."""
    from app.models import PushToken
    from app.push import sender

    sender.reset_dry_run_log()
    db_session.add(
        PushToken(user_id=ctx.owner.id, token="ExponentPushToken[nudge-lead]", platform="ios")
    )
    # An overdue, still-open request.
    req = HomeownerRequest(
        site_id=ctx.site.id,
        raised_by=ctx.homeowner.id,
        title="Overdue ask",
        status=HomeownerRequestStatus.sent,
        sla_due_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(req)
    await db_session.flush()

    now = datetime.now(UTC)
    first = await run_request_nudge_sweep(db_session, now=now)
    assert first == [req.id]
    await db_session.refresh(req)
    assert req.nudged_at is not None

    # (a) NO shadow Decision was created (Option a de-pollution).
    nudges = (
        await db_session.execute(
            select(Decision).where(
                Decision.company_id == ctx.company.id, Decision.title.like(f"{NUDGE_TAG}%")
            )
        )
    ).scalars().all()
    assert nudges == []

    # (b) The site lead (owner) got exactly one overdue push for this request.
    hits = [m for m in sender.dry_run_log() if m["to"] == "ExponentPushToken[nudge-lead]"]
    assert len(hits) == 1
    assert hits[0]["data"]["type"] == "homeowner_request"
    assert hits[0]["data"]["request_id"] == str(req.id)
    assert hits[0]["data"].get("overdue") is True

    # (c) One-nudge rule: a second sweep raises nothing new and pushes nothing new.
    sender.reset_dry_run_log()
    second = await run_request_nudge_sweep(db_session, now=now + timedelta(hours=1))
    assert second == []
    assert sender.dry_run_log() == []
```
- [ ] **Step 2: Run test, verify it fails.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/homeowner/test_requests_decisions.py::test_request_nudge_sweep_fires_once -v`
  Expected: FAIL — a tagged `Decision` is still created (`assert nudges == []` fails) and no push is in the dry-run log (`assert len(hits) == 1` fails).
- [ ] **Step 3: Minimal implementation.** None — this task is the test. (Implementation lands in B4.)
- [ ] **Step 4: Confirm fail is for the right reason.** Re-read the failure output; it must fail on the `nudges == []` / push assertions, not an import/setup error.
- [ ] **Step 5: Commit.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/tests/homeowner/test_requests_decisions.py && git commit -m "test(homeowner): overdue nudge sweep pushes site leads, raises no Decision"`

---

### Task B2: Flip the create-request "surfaces immediately" test to assert no-Decision anywhere

**Files:**
- Modify: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/homeowner/test_requests_decisions.py` — `test_create_request_surfaces_to_contractor_immediately` (L78–111)
- Test: same file

**Interfaces:**
- Consumes: `POST /api/v1/homeowner/requests`, `app.bot.brief_delivery._open_decisions(session, company_id) -> list[Decision]`, `app.notifications.feed.build_feed(session, *, company_id, recipient) -> list[FeedItem]`, `run_request_nudge_sweep`.
- Produces: the contract B3 must satisfy — a created request produces NO `Decision` visible in (i) the approvals inbox, (ii) `_open_decisions` (brief numbering source), or (iii) `build_feed` (contractor bell); the at-creation `_alert_site_leads` push is retained; the overdue sweep raises no duplicate.

Steps:

- [ ] **Step 1: Rewrite the test.** Replace the body of `test_create_request_surfaces_to_contractor_immediately`. It previously asserted the request appears in the approvals inbox (via the shadow Decision). Under Option (a) it must assert the OPPOSITE — no shadow Decision leaks into any decision surface — while the homeowner still doesn't see it and the sweep doesn't dupe. Real code:
```python
async def test_create_request_surfaces_to_contractor_immediately(client, ctx, db_session):
    """De-pollution (Option a): a fresh homeowner request reaches the team via a
    push (see test_create_request_alerts_site_leads), NOT via a shadow pending
    Decision. It must therefore be ABSENT from every decision surface — the
    approvals inbox, the brief's _open_decisions, and the contractor bell feed —
    and the later overdue sweep must not duplicate it."""
    from app.bot.brief_delivery import _open_decisions
    from app.notifications.feed import build_feed

    created = await client.post(
        "/api/v1/homeowner/requests",
        json={
            "title": "Photo request — Kitchen",
            "detail": "Please share a recent photo of the Kitchen.",
        },
        headers=auth(ctx.homeowner),
    )
    assert created.status_code == 201, created.text

    # (a) No shadow Decision exists at all for this request.
    rows = (
        await db_session.execute(
            select(Decision).where(Decision.title.like(f"{NUDGE_TAG}%"))
        )
    ).scalars().all()
    assert rows == [], [r.title for r in rows]

    # (b) The contractor approvals inbox does NOT show it.
    inbox = await client.get("/api/v1/approvals?state=pending", headers=auth(ctx.owner))
    assert inbox.status_code == 200, inbox.text
    assert not any(
        "Photo request — Kitchen" in it["title"] for it in inbox.json()["items"]
    ), inbox.text

    # (c) The brief's decision source (_open_decisions) does NOT include it.
    open_dec = await _open_decisions(db_session, ctx.company.id)
    assert all("Photo request — Kitchen" not in d.title for d in open_dec)

    # (d) The contractor bell feed (build_feed) does NOT include it.
    feed = await build_feed(db_session, company_id=ctx.company.id, recipient=ctx.owner)
    assert all("Photo request — Kitchen" not in it.title for it in feed)

    # (e) It does NOT leak onto the homeowner's own Home "Needs your input".
    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200, home.text
    assert all(
        "Photo request — Kitchen" not in a["title"] for a in home.json()["needs_attention"]
    ), home.json()["needs_attention"]

    # (f) The later overdue sweep raises no duplicate decision (there is none to raise).
    swept = await run_request_nudge_sweep(
        db_session, now=datetime.now(UTC) + timedelta(days=365)
    )
    # Already surfaced at creation (nudged_at stamped) → no re-nudge.
    assert swept == []
```
- [ ] **Step 2: Run test, verify it fails.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/homeowner/test_requests_decisions.py::test_create_request_surfaces_to_contractor_immediately -v`
  Expected: FAIL — `surface_request_now` still creates the shadow Decision, so `assert rows == []` (a) and the inbox/`_open_decisions`/`build_feed` absence assertions (b–d) fail.
- [ ] **Step 3: Minimal implementation.** None — implementation lands in B3.
- [ ] **Step 4: Confirm fail reason** is `rows == []` / surface assertions, not setup/import.
- [ ] **Step 5: Commit.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/tests/homeowner/test_requests_decisions.py && git commit -m "test(homeowner): created request raises no Decision on any contractor surface"`

---

### Task B3: Stop creating the shadow Decision at request creation (surface_request_now)

**Files:**
- Modify: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/homeowner/nudge.py` — `surface_request_now` (L63–76); remove the `session.add(_request_decision(...))` line only (keep `nudged_at` stamp + best-effort/return contract).
- Test: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/homeowner/test_requests_decisions.py::test_create_request_surfaces_to_contractor_immediately` (from B2) + `::test_create_request_alerts_site_leads` (existing, must stay green)

**Interfaces:**
- Consumes: `HomeownerRequest`, `Site`, `_aware`.
- Produces: `surface_request_now(session, req, *, now=None) -> bool` — unchanged signature; now stamps `nudged_at` and returns `True` when the site exists, WITHOUT adding any `Decision`. The at-creation push (`_alert_site_leads` in `router.py`) is unchanged and remains the team-facing signal.

Steps:

- [ ] **Step 1: Failing test already written** (B2). It fails because `surface_request_now` still adds a Decision.
- [ ] **Step 2: Confirm current failure.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/homeowner/test_requests_decisions.py::test_create_request_surfaces_to_contractor_immediately -v`
  Expected: FAIL on `assert rows == []`.
- [ ] **Step 3: Minimal implementation.** Edit `surface_request_now` to drop the Decision creation. Replace L63–76 with:
```python
async def surface_request_now(
    session: AsyncSession, req: HomeownerRequest, *, now: datetime | None = None
) -> bool:
    """Mark a freshly-created request as already surfaced so the overdue sweep
    never re-nudges it. The team-facing signal is the push fired by the router's
    ``_alert_site_leads`` at creation — we deliberately create NO shadow Decision
    (Option (a) de-pollution). Stamps ``nudged_at`` and returns ``False`` (never
    raises) if the site is missing. The caller owns the commit."""
    moment = _aware(now) if now is not None else datetime.now(UTC)
    site = await session.get(Site, req.site_id)
    if site is None:
        return False
    req.nudged_at = moment
    return True
```
  Note: `site` is still fetched to preserve the "missing site → False" best-effort contract the router + `test_create_and_track_request` rely on. `_request_decision` is now unused by `surface_request_now`; it is fully retired in B4.
- [ ] **Step 4: Run tests, verify pass.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/homeowner/nudge.py && pytest tests/homeowner/test_requests_decisions.py::test_create_request_surfaces_to_contractor_immediately tests/homeowner/test_requests_decisions.py::test_create_request_alerts_site_leads tests/homeowner/test_requests_decisions.py::test_create_and_track_request -v`
  Expected: 3 passed. (`test_create_request_alerts_site_leads` proves the at-creation push still fires; `test_create_and_track_request` proves creation still works.)
- [ ] **Step 5: Commit.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/app/homeowner/nudge.py && git commit -m "fix(homeowner): stop creating shadow Decision when surfacing a new request"`

---

### Task B4: Rewire run_request_nudge_sweep to push site leads (no Decision) + retire _request_decision

**Files:**
- Modify: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/homeowner/nudge.py` — delete `_request_decision` (L43–60) and its now-unused imports (`Decision`, `DecisionKind`, `DecisionState`); add a `_push_overdue_nudge` helper; rewire `run_request_nudge_sweep` (L79–108).
- Test: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/homeowner/test_requests_decisions.py::test_request_nudge_sweep_fires_once` (from B1)

**Interfaces:**
- Consumes: `app.push.sender.notify_user(session, user_id, title, body, *, data=None) -> list[str]`; `app.models.User`, `UserRole`, `Site`, `HomeownerRequest`; the site-lead resolution pattern from `router._alert_site_leads` (`User.company_id == site.company_id, User.role.in_([owner, pm])`).
- Produces: `run_request_nudge_sweep(session, *, now=None) -> list[UUID]` — unchanged signature; stamps `nudged_at` once per overdue request, pushes each site's owner/PM leads with `data={"type":"homeowner_request","request_id":..,"site_id":..,"overdue":True}`, creates NO Decision, and returns the nudged request ids. `NUDGE_TAG` constant is KEPT (router filters + cleanup script still reference it).

Steps:

- [ ] **Step 1: Failing test already written** (B1).
- [ ] **Step 2: Confirm current failure.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/homeowner/test_requests_decisions.py::test_request_nudge_sweep_fires_once -v`
  Expected: FAIL — shadow Decision still created; no push captured.
- [ ] **Step 3: Minimal implementation.**
  (3a) Trim imports at the top of `nudge.py`. Replace the `from app.models import (...)` block (L20–27) with only what's still used:
```python
from app.models import (
    HomeownerRequest,
    HomeownerRequestStatus,
    Site,
    User,
    UserRole,
)
```
  (3b) Delete `_request_decision` entirely (old L43–60).
  (3c) Add a push helper (mirrors `router._alert_site_leads`, kept local to nudge.py so the sweep is self-contained). Insert after `_aware`:
```python
async def _push_overdue_nudge(session: AsyncSession, req: HomeownerRequest, site: Site) -> None:
    """Push the site's leads (company owner/PM) that an open homeowner request is
    overdue — Option (a): a real notification, never a shadow Decision. Mirrors
    ``app.homeowner.router._alert_site_leads``; best-effort, never raises."""
    from app.push.sender import notify_user

    lead_ids = (
        await session.execute(
            select(User.id).where(
                User.company_id == site.company_id,
                User.role.in_([UserRole.owner, UserRole.pm]),
            )
        )
    ).scalars().all()
    for uid in lead_ids:
        await notify_user(
            session,
            uid,
            "Homeowner request overdue",
            f"Still open: {req.title}",
            data={
                "type": "homeowner_request",
                "request_id": str(req.id),
                "site_id": str(req.site_id),
                "overdue": True,
            },
        )
```
  (3d) Rewire `run_request_nudge_sweep` — replace the `session.add(_request_decision(...))` call with the push, keeping the `nudged_at` stamp, orphan-skip, ids list, and single commit. Replace old L94–108 with:
```python
    nudged: list[UUID] = []
    for req in (await session.execute(stmt)).scalars().all():
        due = _aware(req.sla_due_at) if req.sla_due_at else None
        if due is None or due > moment:
            continue
        site = await session.get(Site, req.site_id)
        if site is None:
            continue  # orphaned request; nothing to escalate to
        req.nudged_at = moment
        await _push_overdue_nudge(session, req, site)
        nudged.append(req.id)

    if nudged:
        await session.commit()
    return nudged
```
  (3e) Update the module docstring line that describes the nudge as "a contractor-facing `Decision`" (L4–6) to reflect the push:
```python
never nudges the same request twice (the "one-nudge" rule, anti-spam). The nudge
is a push notification to the site's leads (company owner/PM), NOT a shadow
Decision — see :func:`app.homeowner.router._alert_site_leads` for the identical
at-creation path.
```
- [ ] **Step 4: Run tests, verify pass.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/homeowner/nudge.py && pytest tests/homeowner/test_requests_decisions.py::test_request_nudge_sweep_fires_once tests/homeowner/test_e2e_h3.py -v`
  Expected: all passed. `test_e2e_h3.py::test_publisher_feed_push_decision_and_nudge_loop` asserts only `req.id in nudged` (returned-ids contract) — still true. `ruff` must be clean (no unused `Decision`/`DecisionKind`/`DecisionState` imports left).
- [ ] **Step 5: Commit.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/app/homeowner/nudge.py && git commit -m "feat(homeowner): overdue nudge sweep pushes site leads instead of a shadow Decision"`

---

### Task B5: Full-suite regression guard for the two affected modules

**Files:**
- Test only (no source change): `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/homeowner/` + brief/notifications tests that read decisions.

**Interfaces:**
- Consumes: the finished B3/B4 behaviour.
- Produces: green confirmation that de-pollution created no regressions in the brief numbering, bell feed, homeowner asks, or quiet-nudge paths.

Steps:

- [ ] **Step 1: Run the homeowner + brief + notifications suites.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/homeowner tests/bot/test_brief_delivery.py tests/notifications -v`
  Expected: all pass. Rationale: `_open_decisions` and `build_feed` are now free of the shadow row; the router `not_like(NUDGE_TAG)` filters are inert but harmless; `quiet.py` (`[homeowner-quiet-nudge]`) tests are untouched and still green.
- [ ] **Step 2: Grep-verify quiet.py was not touched.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git diff --name-only HEAD~3 -- backend/app/homeowner/quiet.py`
  Expected: EMPTY output (no changes to quiet.py).
- [ ] **Step 3: Confirm no lingering `_request_decision` references.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && grep -rn "_request_decision" app tests`
  Expected: EMPTY output.
- [ ] **Step 4: Ruff the whole homeowner package.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/homeowner`
  Expected: `All checks passed!`
- [ ] **Step 5: Commit (only if a test needed a touch-up; otherwise skip).**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/tests && git commit -m "test(homeowner): regression guard for request de-pollution"`

---

### Task B6: One-time cleanup script for existing shadow nudge Decisions

**Files:**
- Create: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/scripts/cleanup_request_nudge_decisions.py`
- Test: `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/scripts/test_cleanup_request_nudge_decisions.py` (new dir + `__init__.py` if absent — the repo has no `tests/scripts/` yet; create it)

**Interfaces:**
- Consumes: `app.db.SessionLocal`, `app.models.Decision`, `DecisionState`, `app.homeowner.nudge.NUDGE_TAG` (`"[homeowner-request-nudge]"`), `app.homeowner.quiet.QUIET_NUDGE_TAG` (`"[homeowner-quiet-nudge]"`), `scripts._bootstrap_env.load`.
- Produces: `run(session_factory=SessionLocal, *, apply=False) -> dict` — dry-run returns `{"would_resolve": int}`; `--apply` resolves the pre-existing `[homeowner-request-nudge]%` Decisions (state → `resolved`, `resolved_at` set) and returns `{"resolved": int}`. Idempotent; MUST NOT match `[homeowner-quiet-nudge]%`.

Steps:

- [ ] **Step 1: Write the failing test.** Create `tests/scripts/__init__.py` (empty) and `tests/scripts/test_cleanup_request_nudge_decisions.py`:
```python
"""cleanup_request_nudge_decisions: resolves legacy [homeowner-request-nudge]
shadow Decisions, never touches [homeowner-quiet-nudge]."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.homeowner.nudge import NUDGE_TAG
from app.homeowner.quiet import QUIET_NUDGE_TAG
from app.models import Decision, DecisionKind, DecisionState
from scripts.cleanup_request_nudge_decisions import run


async def test_cleanup_resolves_request_nudges_only(ctx, db_session):
    factory = lambda: _FixedSession(db_session)  # noqa: E731

    stale = Decision(
        company_id=ctx.company.id, site_id=ctx.site.id, kind=DecisionKind.generic,
        title=f"{NUDGE_TAG}[req-1] Overdue ask", detail="x", state=DecisionState.pending,
    )
    quiet = Decision(
        company_id=ctx.company.id, site_id=ctx.site.id, kind=DecisionKind.generic,
        title=f"{QUIET_NUDGE_TAG}[site-1] Quiet site — add a reason",
        detail="x", state=DecisionState.pending,
    )
    real = Decision(
        company_id=ctx.company.id, site_id=ctx.site.id, kind=DecisionKind.approval,
        title="Approve the invoice?", detail="x", state=DecisionState.pending,
    )
    db_session.add_all([stale, quiet, real])
    await db_session.flush()

    # Dry-run reports the count, writes nothing.
    dry = await run(session_factory=factory, apply=False)
    assert dry == {"would_resolve": 1}
    await db_session.refresh(stale)
    assert stale.state == DecisionState.pending

    # --apply resolves exactly the request-nudge; leaves quiet + real untouched.
    applied = await run(session_factory=factory, apply=True)
    assert applied == {"resolved": 1}
    await db_session.refresh(stale)
    await db_session.refresh(quiet)
    await db_session.refresh(real)
    assert stale.state == DecisionState.resolved
    assert stale.resolved_at is not None
    assert quiet.state == DecisionState.pending
    assert real.state == DecisionState.pending

    # Idempotent: a second apply finds nothing left to resolve.
    again = await run(session_factory=factory, apply=True)
    assert again == {"resolved": 0}


class _FixedSession:
    """Adapt the script's ``async with session_factory() as s`` to the test's
    shared ``db_session`` (never closes it; the fixture owns the transaction)."""

    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False
```
  Note: the `_FixedSession` adapter mirrors how existing script tests reuse the transactional `db_session` fixture (the script opens `async with session_factory() as s`). If the repo's `db_session` fixture forbids `commit()` inside the transaction, the script's `commit()` will still flush within the test's savepoint — confirm against `tests/conftest.py` when implementing and, if commit is trapped, have the test factory yield a nested-transaction session instead.
- [ ] **Step 2: Run test, verify it fails.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/scripts/test_cleanup_request_nudge_decisions.py -v`
  Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.cleanup_request_nudge_decisions'`.
- [ ] **Step 3: Minimal implementation.** Create `scripts/cleanup_request_nudge_decisions.py`:
```python
"""Resolve legacy homeowner-request shadow Decisions left by the pre-de-pollution
nudge path.

Before Option (a), every homeowner request raised a contractor-facing Decision
titled ``[homeowner-request-nudge][<req-id>] <title>`` (at creation and on the
overdue sweep). Those rows polluted the owner Brief numbering, the approvals
inbox, and the contractor bell feed. The live code no longer creates them; this
one-off clears the ones already in the DB.

It RESOLVES (state → resolved, reversible-ish audit trail kept) every open
Decision whose title starts with ``[homeowner-request-nudge]``. It NEVER touches
``[homeowner-quiet-nudge]`` rows (those are a live, generic quiet-period signal —
see app/homeowner/quiet.py) or any real construction decision.

Idempotent + scoped to the request-nudge tag only.

DRY-RUN by default — prints what it WOULD change. Pass --apply to write:
    DATABASE_URL=... uv run python -m scripts.cleanup_request_nudge_decisions --apply
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.homeowner.nudge import NUDGE_TAG
from app.homeowner.quiet import QUIET_NUDGE_TAG
from app.models import Decision, DecisionState

_OPEN = (DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated)


async def run(session_factory=SessionLocal, *, apply: bool = False) -> dict:
    async with session_factory() as s:
        stale = (
            await s.execute(
                select(Decision).where(
                    Decision.title.like(f"{NUDGE_TAG}%"),
                    # Belt-and-braces: never the quiet-period signal.
                    Decision.title.not_like(f"{QUIET_NUDGE_TAG}%"),
                    Decision.state.in_(_OPEN),
                )
            )
        ).scalars().all()

        print(f"[homeowner-request-nudge] decisions to resolve: {len(stale)}")
        for d in stale[:8]:
            print(f"    - {d.title[:80]}")

        if not apply:
            print("\n(dry-run — re-run with --apply to write)")
            return {"would_resolve": len(stale)}

        from datetime import UTC, datetime

        now = datetime.now(UTC)
        for d in stale:
            d.state = DecisionState.resolved
            d.resolved_at = now
            if not d.resolution_note:
                d.resolution_note = (
                    "Auto-cleared: legacy homeowner-request nudge (now a push, not a decision)."
                )
        await s.commit()
        return {"resolved": len(stale)}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    apply = "--apply" in sys.argv
    print("Request-nudge decision cleanup:", asyncio.run(run(apply=apply)))


if __name__ == "__main__":
    main()
```
  Note: `NUDGE_TAG` (`[homeowner-request-nudge]`) and `QUIET_NUDGE_TAG` (`[homeowner-quiet-nudge]`) share no common prefix, so the `like(NUDGE_TAG%)` already excludes quiet rows; the extra `not_like(QUIET_NUDGE_TAG%)` is defensive and documents intent. Confirm `Decision` has a `resolved_at` column (used identically by `cleanup_meeting_action_items.py` L111) — if not, drop that line.
- [ ] **Step 4: Run test, verify pass.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check scripts/cleanup_request_nudge_decisions.py tests/scripts && pytest tests/scripts/test_cleanup_request_nudge_decisions.py -v`
  Expected: 1 passed, ruff clean.
- [ ] **Step 5: Commit.**
  `cd /Users/aryantripathi/Developer/contructionAI/constructo && git add backend/scripts/cleanup_request_nudge_decisions.py backend/tests/scripts && git commit -m "chore(scripts): one-time cleanup of legacy homeowner-request nudge Decisions"`

---

## Ordering & contracts summary

1. **B1, B2** (tests, red) → **B3** (surface_request_now stops adding Decision) → **B4** (sweep pushes + retire `_request_decision`) → **B5** (regression guard) → **B6** (cleanup script + test).
2. **Preserved contracts:** `surface_request_now(...) -> bool`, `run_request_nudge_sweep(...) -> list[UUID]` signatures unchanged; `nudged_at` one-nudge rule intact; returned-ids contract intact (`test_e2e_h3` still green).
3. **Untouched:** `app/homeowner/quiet.py` (`[homeowner-quiet-nudge]`), scheduler wiring (`_run_request_nudge_sweep_job` still calls the same callable), the router `Decision.title.not_like(NUDGE_TAG%)` filters (inert but retained as defense-in-depth until B6 clears legacy rows).
4. **Reused mechanism (cited):** `app.push.sender.notify_user` targeting `User.role in {owner, pm}` for `site.company_id` — the exact `_alert_site_leads` pattern (`app/homeowner/router.py` L2246–2276).
# Slice D — Frontend NewProjectModal + ProjectsStrip + sites create

Task PREFIX **D**. All paths absolute. Web repo root: `/Users/aryantripathi/Developer/contructionAI/constructo/web`.
Verify commands (web): `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run build` (tsc -b — the CI/Vercel path) plus `npx vitest run <path>`.

## Grounding notes (real code read)

- **Sites API today** is split: `api.listSites()`/`api.getSite(id)` live on the `api` object in `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/client.ts:103-119` and return `Paginated<Site>` / `Site`. The **create** call today lives on `authApi.createSite({name,type})` at `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/auth.ts:392-401` — it POSTs `/api/v1/sites` via the auth module's internal `call()` and returns `{ id, name }` (a thin shape, NOT a full `Site`). OwnerFirstRun consumes exactly that: `await authApi.createSite({ name: siteName.trim(), type: siteType })` (`OwnerFirstRun.tsx:89`).
- **`Site` wire type** (`/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/types.ts:22-30`): `{ id, company_id, name, location, type, status: SiteStatus, created_at }`. `SiteStatus = 'active'|'paused'|'completed'|string` (types.ts:20). `Paginated<T> = { items: T[]; next_cursor: string|null }` (types.ts:4-7).
- **New sites module**: there is NO `api/sites.ts` today. Slice D creates `sitesApi.create(...)` in a new module `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/sites.ts`, mirroring the self-contained `request<T>` fetch helper from `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/groups.ts:15-85` (imports `API_BASE` from `./config`, `ApiError` from `./client`, `getToken` from `./auth`). This keeps the new create returning a full `SiteOut` (= `Site`) rather than the `authApi` thin `{id,name}`.
- **queryKeys** (`/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/queryKeys.ts:10-63`): `qk.sites() => ['sites']`, `qk.site(id)`, etc. There is **no `qk.activity`** yet. Slice C owns the activity hook/query; per SHARED CONTRACTS the activity query key must be `qk.activity(...)`. To avoid two slices both editing `queryKeys.ts`, **Slice D adds `qk.activity` in Task D1** (a `['activity']`-prefixed key) so both slices can invalidate/read it. Slice C consumes `qk.activity` as defined here.
- **Modal** (`/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/Modal.tsx:22-149`): `Modal({ open, onClose, title, children, footer })`, exported from `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/index.ts:58`. `Button` from `../../ui` (`ButtonProps` variants `primary`/`ghost`/`danger`, sizes; `disabled`, `block`). `StatusDot({ status, className })` from `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/StatusPill.tsx:103` (exported index.ts:12), `Status = 'ok'|'warn'|'info'|'risk'` etc. `Small`, `H2` from `../../ui` Typography.
- **Modal + mutation + invalidation pattern to mirror**: `NewGroupModal.tsx` (whole file) — self-contained field markup, `useToast()` for errors, `submitting` gate, `reset()` + `onClose()` on success. But NewGroupModal calls the api imperatively (not via `useMutation`). Slice D uses `useMutation` + `qc.invalidateQueries` (mirroring `useCreateGroup` in `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/hooks.ts:55-63`).
- **i18n**: `useT()` (`/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/index.tsx:124`) REQUIRES a `<LanguageProvider>` ancestor (throws otherwise, index.tsx:116-119). Tests must wrap in `LanguageProvider`. Keys are added to `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/en.ts` (then `hi.ts`). `TranslationKey` is the union of `en` keys. SITE_TYPES type labels already exist: `auth.onboard.site.type.{residential,commercial,villa,interior,infra}` (en.ts:130-134). `common.error` = 'Something went wrong' (en.ts:55).
- **SITE_TYPES const** to reuse verbatim: `['residential','commercial','villa','interior','infra'] as const` (`OwnerFirstRun.tsx:13-19`), default `'residential'`.
- **Sites.tsx** header is at `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/Sites.tsx:68-73`; it renders inside `<AppShell>` and already calls `useSites()`.

---

### Task D1: Add `qk.activity` key + `sitesApi.create` module

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/queryKeys.ts` (add one line inside the `qk` object, after line 18 `sites: () => ['sites'] as const,`)
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/sites.ts`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/sites.test.ts`

**Interfaces:**
- Consumes: `Site`, `Paginated<T>` from `./types`; `API_BASE` from `./config`; `ApiError`, `getToken` (fetch-helper trio, exactly as `groups.ts:15-17`).
- Produces: `qk.activity(opts?: { siteId?: string }) => readonly ['activity', string|null]`; `sitesApi.create(body: SiteCreateBody): Promise<SiteOut>`; types `SiteCreateBody = { name: string; type: string; location?: string }` and `type SiteOut = Site`.

- [ ] **Step 1: Write the failing test** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/sites.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sitesApi } from './sites'
import { qk } from './queryKeys'

const OK_SITE = {
  id: 's-new',
  company_id: 'co1',
  name: 'Green Acres Tower B',
  location: '',
  type: 'residential',
  status: 'active',
  created_at: '2026-07-03T00:00:00Z',
}

describe('qk.activity', () => {
  it('is prefixed with "activity" and folds site into the key', () => {
    expect(qk.activity()).toEqual(['activity', null])
    expect(qk.activity({ siteId: 's1' })).toEqual(['activity', 's1'])
  })
})

describe('sitesApi.create', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(OK_SITE), { status: 201 })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs /api/v1/sites with the create body and returns the SiteOut', async () => {
    const out = await sitesApi.create({ name: 'Green Acres Tower B', type: 'residential' })
    expect(out).toEqual(OK_SITE)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toMatch(/\/api\/v1\/sites$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Green Acres Tower B',
      type: 'residential',
    })
  })

  it('omits location when not provided and includes it (trimmed) when present', async () => {
    await sitesApi.create({ name: 'A', type: 'villa', location: '  Bandra  ' })
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({ name: 'A', type: 'villa', location: 'Bandra' })
  })

  it('throws ApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'nope' }), { status: 400 })),
    )
    await expect(sitesApi.create({ name: 'x', type: 'residential' })).rejects.toMatchObject({
      status: 400,
      message: 'nope',
    })
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/sites.test.ts`. Expect failure: `Failed to resolve import "./sites"` (module absent) and `qk.activity is not a function`.

- [ ] **Step 3: Minimal implementation**
  - In `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/queryKeys.ts`, add immediately after `sites: () => ['sites'] as const,` (line 18):
```ts
  /** Owner activity feed (Command Center). Optional site scope folds into the key
   *  so `qk.activity()` (all sites) and `qk.activity({siteId})` invalidate/read
   *  independently. Shared with Slice C's activity query. */
  activity: (opts?: { siteId?: string }) => ['activity', opts?.siteId ?? null] as const,
```
  - Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/sites.ts`:
```ts
/**
 * Sites API client (Owner Command Center). Self-contained `request<T>` fetch
 * helper mirroring `api/groups.ts` — imports API_BASE / ApiError / getToken by
 * reference so it never depends on the mock-aware `client.ts` `api` object.
 *
 * `create` POSTs /api/v1/sites and returns the full SiteOut (contrast with the
 * legacy `authApi.createSite` which returns only {id,name}). `Site.type` is
 * free-text on the backend — no enum migration; the modal just supplies one of
 * the SITE_TYPES values.
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'
import type { Site } from './types'

export type SiteOut = Site

export interface SiteCreateBody {
  name: string
  type: string
  location?: string
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const sitesApi = {
  /** Owner creates a site. `location` is optional; trimmed and omitted if blank. */
  create(body: SiteCreateBody): Promise<SiteOut> {
    const loc = body.location?.trim()
    const payload: SiteCreateBody = { name: body.name, type: body.type }
    if (loc) payload.location = loc
    return request<SiteOut>('/api/v1/sites', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/sites.test.ts && npm run build`. Expect all `sites.test.ts` specs green and tsc `-b` build clean (no new errors).

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/api/sites.ts src/api/sites.test.ts src/api/queryKeys.ts && git commit -m "feat(web): sitesApi.create + qk.activity key for Command Center"`

---

### Task D2: i18n keys for NewProject + ProjectsStrip

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/en.ts` (add a `projects.*` block after the `sites.*` block, i.e. after line 69 `'site.back': 'Back to sites',`)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/hi.ts` (mirror the same keys; Hindi values)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/i18n.newproject.test.tsx`

**Interfaces:**
- Consumes: `en`, `TranslationKey` from `./en`; `hi` from `./hi`.
- Produces: `TranslationKey`s used by D3/D4/D5: `projects.new.title`, `projects.new.name_label`, `projects.new.name_placeholder`, `projects.new.type_label`, `projects.new.location_label`, `projects.new.location_placeholder`, `projects.new.location_hint`, `projects.new.submit`, `projects.new.cancel`, `projects.new.name_required`, `projects.new.error`, `projects.new.cta`, `projects.strip.title`, `projects.strip.people`, `projects.strip.no_activity`.

- [ ] **Step 1: Write the failing test** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/i18n.newproject.test.tsx`:
```ts
import { describe, it, expect } from 'vitest'
import { en } from './en'
import { hi } from './hi'

const REQUIRED = [
  'projects.new.title',
  'projects.new.name_label',
  'projects.new.name_placeholder',
  'projects.new.type_label',
  'projects.new.location_label',
  'projects.new.location_placeholder',
  'projects.new.location_hint',
  'projects.new.submit',
  'projects.new.cancel',
  'projects.new.name_required',
  'projects.new.error',
  'projects.new.cta',
  'projects.strip.title',
  'projects.strip.people',
  'projects.strip.no_activity',
] as const

describe('projects i18n keys', () => {
  it('every projects key is present in en with a non-empty string', () => {
    for (const k of REQUIRED) {
      expect(en[k], `missing en[${k}]`).toBeTruthy()
    }
  })
  it('every projects key is present in hi (no English fallback gaps)', () => {
    for (const k of REQUIRED) {
      expect(hi[k], `missing hi[${k}]`).toBeTruthy()
    }
  })
  it('people copy interpolates {count}', () => {
    expect(en['projects.strip.people']).toContain('{count}')
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/i18n.newproject.test.tsx`. Expect: `missing en[projects.new.title]` assertion failures (keys absent).

- [ ] **Step 3: Minimal implementation** — in `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/en.ts` add after `'site.back': 'Back to sites',` (line 69):
```ts
  // Owner Command Center — New project + Projects strip
  'projects.new.title': 'New project',
  'projects.new.name_label': 'Project name',
  'projects.new.name_placeholder': 'e.g. Green Acres Tower B',
  'projects.new.type_label': 'Project type',
  'projects.new.location_label': 'Location',
  'projects.new.location_placeholder': 'e.g. Bandra West, Mumbai',
  'projects.new.location_hint': 'Optional — you can add this later.',
  'projects.new.submit': 'Create project',
  'projects.new.cancel': 'Cancel',
  'projects.new.name_required': 'Give the project a name to continue.',
  'projects.new.error': "Couldn't create the project. Please try again.",
  'projects.new.cta': 'New project',
  'projects.strip.title': 'Your projects',
  'projects.strip.people': '{count} people',
  'projects.strip.no_activity': 'No activity yet',
```
  In `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/hi.ts` add the same keys with Hindi values:
```ts
  'projects.new.title': 'नया प्रोजेक्ट',
  'projects.new.name_label': 'प्रोजेक्ट का नाम',
  'projects.new.name_placeholder': 'जैसे Green Acres Tower B',
  'projects.new.type_label': 'प्रोजेक्ट का प्रकार',
  'projects.new.location_label': 'स्थान',
  'projects.new.location_placeholder': 'जैसे बांद्रा वेस्ट, मुंबई',
  'projects.new.location_hint': 'वैकल्पिक — इसे बाद में जोड़ सकते हैं।',
  'projects.new.submit': 'प्रोजेक्ट बनाएं',
  'projects.new.cancel': 'रद्द करें',
  'projects.new.name_required': 'आगे बढ़ने के लिए प्रोजेक्ट का नाम दें।',
  'projects.new.error': 'प्रोजेक्ट नहीं बन सका। फिर से प्रयास करें।',
  'projects.new.cta': 'नया प्रोजेक्ट',
  'projects.strip.title': 'आपके प्रोजेक्ट',
  'projects.strip.people': '{count} लोग',
  'projects.strip.no_activity': 'अभी कोई गतिविधि नहीं',
```
  (Place the `hi.ts` block wherever the file groups keys; exact position is cosmetic — `hi` is `Partial<Record<TranslationKey,string>>`.)

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/i18n.newproject.test.tsx && npm run build`. Expect green + clean build (adding keys expands the `TranslationKey` union; verify no existing `t(...)` call breaks).

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/i18n/en.ts src/i18n/hi.ts src/i18n/i18n.newproject.test.tsx && git commit -m "i18n(web): projects.new + projects.strip keys (en+hi)"`

---

### Task D3: `NewProjectModal` component

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NewProjectModal.tsx`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NewProjectModal.test.tsx`

**Interfaces:**
- Consumes: `sitesApi.create` + `SiteOut` (Task D1); `qk.sites()`, `qk.activity()` (Task D1); `projects.new.*` keys (Task D2); `Modal` (ui), `Button` (ui), `useT` (i18n); `useMutation`/`useQueryClient` from `@tanstack/react-query`.
- Produces: `NewProjectModal({ open, onClose, onCreated? }: NewProjectModalProps)` where `NewProjectModalProps = { open: boolean; onClose: () => void; onCreated?: (site: SiteOut) => void }`. Consumed by D4 (ProjectsStrip) and D5 (Sites.tsx header).

- [ ] **Step 1: Write the failing test** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NewProjectModal.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { LanguageProvider } from '../../i18n'

vi.mock('../../api/sites', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/sites')>()
  return { ...original, sitesApi: { ...original.sitesApi, create: vi.fn() } }
})

import { sitesApi } from '../../api/sites'
import { qk } from '../../api/queryKeys'
import { NewProjectModal } from './NewProjectModal'

const mockCreate = sitesApi.create as ReturnType<typeof vi.fn>

const SITE = {
  id: 's9', company_id: 'co', name: 'Tower B', location: '', type: 'residential',
  status: 'active', created_at: '2026-07-03T00:00:00Z',
}

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>
    </QueryClientProvider>,
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => vi.clearAllMocks())

describe('NewProjectModal', () => {
  it('disables submit until a name is entered', () => {
    renderWithProviders(<NewProjectModal open onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled()
  })

  it('creates, invalidates sites + activity, calls onCreated, and closes', async () => {
    mockCreate.mockResolvedValue(SITE)
    const onClose = vi.fn()
    const onCreated = vi.fn()
    const { invalidateSpy } = renderWithProviders(
      <NewProjectModal open onClose={onClose} onCreated={onCreated} />,
    )

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: 'Tower B' } })
    fireEvent.change(screen.getByLabelText(/project type/i), { target: { value: 'villa' } })
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Bandra' } })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ name: 'Tower B', type: 'villa', location: 'Bandra' }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(SITE))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.sites() })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.activity() })
    expect(onClose).toHaveBeenCalled()
  })

  it('on error keeps the modal open and preserves the typed name', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    const onClose = vi.fn()
    renderWithProviders(<NewProjectModal open onClose={onClose} />)

    const nameInput = screen.getByLabelText(/project name/i) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Kept Name' } })
    fireEvent.click(screen.getByRole('button', { name: /create project/i }))

    await screen.findByRole('alert')
    expect(onClose).not.toHaveBeenCalled()
    expect(nameInput.value).toBe('Kept Name')
  })

  it('defaults the type select to residential', () => {
    renderWithProviders(<NewProjectModal open onClose={() => {}} />)
    expect((screen.getByLabelText(/project type/i) as HTMLSelectElement).value).toBe('residential')
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/NewProjectModal.test.tsx`. Expect: `Failed to resolve import './NewProjectModal'`.

- [ ] **Step 3: Minimal implementation** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NewProjectModal.tsx`:
```tsx
/**
 * NewProjectModal — the owner's "create a project (site)" form for the Command
 * Center. Reuses the shared `Modal` chrome, submits via `useMutation` →
 * `sitesApi.create`, and on success invalidates `qk.sites()` + `qk.activity()`
 * (so the projects strip and the activity feed both refresh) then closes.
 *
 * Honest validation: submit is disabled until a name is typed; on a failed
 * create we keep the modal open with the typed values and show a CDS error line.
 * Type select reuses OwnerFirstRun's SITE_TYPES verbatim (labels via
 * auth.onboard.site.type.*, default residential). Location is optional.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { useT, type TranslationKey } from '../../i18n'
import { sitesApi, type SiteOut } from '../../api/sites'
import { qk } from '../../api/queryKeys'

// Reused verbatim from pages/auth/OwnerFirstRun.tsx (SITE_TYPES).
const SITE_TYPES = ['residential', 'commercial', 'villa', 'interior', 'infra'] as const

export interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreated?: (site: SiteOut) => void
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const t = useT()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('residential')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (body: { name: string; type: string; location?: string }) => sitesApi.create(body),
    onSuccess: (site) => {
      qc.invalidateQueries({ queryKey: qk.sites() })
      qc.invalidateQueries({ queryKey: qk.activity() })
      onCreated?.(site)
      reset()
      onClose()
    },
    onError: () => {
      // Keep the modal open + inputs intact; surface a CDS error line.
      setError(t('projects.new.error'))
    },
  })

  function reset() {
    setName('')
    setType('residential')
    setLocation('')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('projects.new.name_required'))
      return
    }
    if (mutation.isPending) return
    setError(null)
    const loc = location.trim()
    mutation.mutate({ name: trimmed, type, ...(loc ? { location: loc } : {}) })
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <Button variant="ghost" type="button" onClick={handleClose}>
        {t('projects.new.cancel')}
      </Button>
      <Button
        variant="primary"
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim() || mutation.isPending}
        aria-busy={mutation.isPending || undefined}
      >
        {t('projects.new.submit')}
      </Button>
    </div>
  )

  return (
    <Modal open={open} onClose={handleClose} title={t('projects.new.title')} footer={footer}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        noValidate
      >
        {/* Name (required) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-name"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.name_label')}
          </label>
          <input
            id="new-project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projects.new.name_placeholder')}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text placeholder:text-text-mute focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Type (default residential) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-type"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.type_label')}
          </label>
          <select
            id="new-project-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {SITE_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`auth.onboard.site.type.${tp}` as TranslationKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Location (optional) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-project-location"
            className="font-body text-small font-medium text-text"
          >
            {t('projects.new.location_label')}
          </label>
          <input
            id="new-project-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('projects.new.location_placeholder')}
            className="rounded-control border border-line bg-card px-3 py-2 font-body text-body text-text placeholder:text-text-mute focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="font-body text-micro text-text-mute">{t('projects.new.location_hint')}</p>
        </div>

        {error && (
          <p role="alert" className="font-body text-small font-medium text-risk">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/NewProjectModal.test.tsx && npm run build`. Expect all 4 specs green + clean build. (If `text-text`/`text-risk`/`border-line`/`bg-card` are missing Tailwind utilities, they are the same tokens used in `Sites.tsx` and `OwnerFirstRun.tsx`, so they resolve.)

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/owner/NewProjectModal.tsx src/features/owner/NewProjectModal.test.tsx && git commit -m "feat(web): NewProjectModal — owner creates a project + invalidates activity"`

---

### Task D4: `ProjectsStrip` component (+ New project tile)

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ProjectsStrip.tsx`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ProjectsStrip.test.tsx`

**Interfaces:**
- Consumes: `Site` from `../../api/types`; `NewProjectModal` (Task D3); `StatusDot`, `Status` from ui (`StatusPill`); `Small`, `H2` from ui Typography; `useT` (i18n); `Link` from `react-router-dom`.
- Produces: `ProjectsStrip({ sites }: ProjectsStripProps)` where `ProjectsStripProps = { sites: Site[] }`. Consumed by OwnerHome (Slice C) which passes `sites` from `useSites().data.items`.
- Note: `Site` (types.ts:22-30) has NO `last_activity_at` or people-count field. Per the slice brief ("last-activity if available else omit, people count if available"), ProjectsStrip renders those ONLY when present on an optionally-widened row. Define a local `ProjectRow = Site & { last_activity_at?: string | null; people_count?: number | null }` and read the optional fields defensively so the component works today (fields absent → omitted) and stays forward-compatible if Slice C enriches sites.

- [ ] **Step 1: Write the failing test** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ProjectsStrip.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { type ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import { ProjectsStrip } from './ProjectsStrip'
import type { Site } from '../../api/types'

const SITES: Site[] = [
  { id: 's1', company_id: 'c', name: 'Tower B', location: 'Bandra', type: 'residential', status: 'active', created_at: '2026-07-01T00:00:00Z' },
  { id: 's2', company_id: 'c', name: 'Villa 12', location: 'Alibaug', type: 'villa', status: 'paused', created_at: '2026-06-01T00:00:00Z' },
]

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ProjectsStrip', () => {
  it('renders a card per site with name + location, each linking to its detail', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    expect(screen.getByText('Tower B')).toBeInTheDocument()
    expect(screen.getByText('Villa 12')).toBeInTheDocument()
    expect(screen.getByText('Bandra')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tower B/ })).toHaveAttribute('href', '/sites/s1')
  })

  it('shows a status dot per project (accessible label)', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    // StatusDot renders role="img" with an aria-label from STATUS_META
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2)
  })

  it('renders people count only when present on the row', () => {
    const withPeople = [{ ...SITES[0], people_count: 4 }] as Site[]
    renderWithProviders(<ProjectsStrip sites={withPeople} />)
    expect(screen.getByText('4 people')).toBeInTheDocument()
  })

  it('the "+ New project" tile opens NewProjectModal', () => {
    renderWithProviders(<ProjectsStrip sites={SITES} />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    // Modal title = "New project"; the dialog is now in the tree
    expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/ProjectsStrip.test.tsx`. Expect: `Failed to resolve import './ProjectsStrip'`.

- [ ] **Step 3: Minimal implementation** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ProjectsStrip.tsx`:
```tsx
/**
 * ProjectsStrip — the Command Center's horizontal row of project cards. Each card
 * shows the project name, a status dot (status spine), location, and — only when
 * the row carries them — a last-activity relative time and a people count. A
 * trailing "+ New project" tile opens NewProjectModal.
 *
 * Props: { sites }. OwnerHome (Slice C) feeds `useSites().data.items`. `Site`
 * has no activity/people fields today, so those render defensively from an
 * optionally-widened `ProjectRow` and are omitted when absent.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { StatusDot, type Status } from '../../ui/StatusPill'
import { Small, H2 } from '../../ui/Typography'
import type { Site } from '../../api/types'
import { NewProjectModal } from './NewProjectModal'

const STATUS_TO_SPINE: Record<string, Status> = {
  active: 'ok',
  paused: 'warn',
  completed: 'info',
}

type ProjectRow = Site & {
  last_activity_at?: string | null
  people_count?: number | null
}

export interface ProjectsStripProps {
  sites: Site[]
}

/** Compact relative time ("2h", "3d") — omitted upstream when no timestamp. */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(diff / 60000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export function ProjectsStrip({ sites }: ProjectsStripProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const rows = sites as ProjectRow[]

  return (
    <section aria-label={t('projects.strip.title')}>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {rows.map((site) => (
          <li key={site.id} className="shrink-0 w-56">
            <Link
              to={`/sites/${site.id}`}
              className="block min-h-tap rounded-card border border-line bg-card p-4 shadow-card cstk-animate transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={STATUS_TO_SPINE[site.status] ?? 'info'} />
                <H2 as="h3" className="!text-h2 truncate">
                  {site.name}
                </H2>
              </div>
              {site.location && <Small className="mt-1 block truncate">{site.location}</Small>}
              {site.last_activity_at ? (
                <Small className="mt-0.5 block !text-text-mute">{relTime(site.last_activity_at)}</Small>
              ) : (
                <Small className="mt-0.5 block !text-text-mute">
                  {t('projects.strip.no_activity')}
                </Small>
              )}
              {typeof site.people_count === 'number' && (
                <Small className="mt-0.5 block !text-text-mute">
                  {t('projects.strip.people', { count: site.people_count })}
                </Small>
              )}
            </Link>
          </li>
        ))}

        {/* + New project tile */}
        <li className="shrink-0 w-56">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-tap h-full w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line bg-card p-4 text-text-mute cstk-animate transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden className="text-h1 leading-none">
              +
            </span>
            <span className="font-body text-small font-medium">{t('projects.new.cta')}</span>
          </button>
        </li>
      </ul>

      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/ProjectsStrip.test.tsx && npm run build`. Expect 4 specs green + clean build. (The Modal renders via `createPortal` to `document.body`; testing-library's `screen` queries the whole document so `getByRole('dialog')` finds it.)

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/owner/ProjectsStrip.tsx src/features/owner/ProjectsStrip.test.tsx && git commit -m "feat(web): ProjectsStrip — project cards + New project tile"`

---

### Task D5: "+ New project" affordance in Sites.tsx header

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/Sites.tsx` (imports at top lines 1-18; header block lines 68-73; add local `useState` + modal render)
- Test: extend `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/Sites.newproject.test.tsx` (new file — avoids touching any existing Sites test)

**Interfaces:**
- Consumes: `NewProjectModal` (Task D3), `Button` (ui), `useT` (i18n), `useState` (react). No new produced interface.

- [ ] **Step 1: Write the failing test** — `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/Sites.newproject.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { type ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../i18n'

vi.mock('../api/hooks', () => ({
  useSites: () => ({ data: { items: [], next_cursor: null }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../auth/useCan', () => ({ useMeRole: () => 'owner' }))

import { Sites } from './Sites'

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LanguageProvider defaultLanguage="en">{ui}</LanguageProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Sites header — New project', () => {
  it('renders a New project button that opens the modal', async () => {
    renderWithProviders(<Sites />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /new project/i })).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/pages/Sites.newproject.test.tsx`. Expect: `Unable to find an accessible element with the role "button" and name /new project/i` (no button yet).

- [ ] **Step 3: Minimal implementation** — edit `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/Sites.tsx`:
  - Change the react import (line 1) from `import { useMemo, useState } from 'react'` — `useState` is already imported, keep as-is.
  - Add to the ui import block (lines 8-18), add `Button` to the destructured list: `Button,`.
  - Add after the existing ui imports (after line 18):
```tsx
import { NewProjectModal } from '../features/owner/NewProjectModal'
```
  - Add a modal-open state next to `selectedSiteId` (after line 42):
```tsx
  const [newOpen, setNewOpen] = useState(false)
```
  - Replace the header block (lines 68-73) with:
```tsx
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Display as="h1" className="!text-h1">
            {t('sites.title')}
          </Display>
          <Small className="mt-1 block">{t('sites.subtitle')}</Small>
        </div>
        <Button variant="primary" type="button" onClick={() => setNewOpen(true)}>
          {t('projects.new.cta')}
        </Button>
      </header>

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} />
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/pages/Sites.newproject.test.tsx && npm run build`. Expect the spec green + clean build. Also re-run any existing Sites test to confirm no regression: `npx vitest run src/pages` (all green).

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/pages/Sites.tsx src/pages/Sites.newproject.test.tsx && git commit -m "feat(web): New project button in Sites header"`
# Slice C — Frontend activity client + new OwnerHome

Builds the web-facing half of the Owner activity-first Command Center: a typed
`activityApi` client (with USE_MOCKS fixtures), a pure `HonestHero`, an infinite
`ActivityStream`, a cleaned `NeedsYou` driven off real pending decisions, and a
reworked `OwnerHome` that composes them (plus `<ProjectsStrip>` from slice D).

**Grounding facts (verified against the real tree):**
- Web verify command = `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run build` (tsc -b, the CI/Vercel path) + `npx vitest run <path>`.
- `USE_MOCKS`/`API_BASE` from `src/api/config.ts`; `ApiError` from `src/api/client.ts`; `getToken` from `src/api/auth.ts`. The per-file `request<T>()` helper in `dashboard.ts`/`approvals.ts` is copied verbatim into new API modules (the shared `client.ts` request is not exported — each API file declares its own).
- `qk` factory lives in `src/api/queryKeys.ts` (const object, keys are `as const` tuples).
- `approvalsApi.list(state?)` → `Promise<Paginated<Decision>>`; `Decision.kind ∈ {approval, homeowner_question, hold_payment, generic}`, `Decision.state ∈ {pending, acknowledged, resolved, rejected, escalated}`.
- `useDecide(date)` → `{ decide, isPending }`; `decide(input: DecideInput, cb?)`. `DecideInput = { siteId, siteName, riskKey, action, title, evidenceEventIds }`. It optimistically mutates `qk.home(date)` AND `qk.decisions()` caches. `ACTION_KIND = { approve:'approval', hold:'hold_payment', assign:'generic' }`.
- `useCan('approve_money')` → boolean (owner-only capability; defined in `src/auth/permissions.ts`).
- UI kit exports (from `src/ui/index.ts`): `Display, H1, H2, Body, Small, Micro, Mono`, `StatusPill, StatusDot, severityToStatus`, `type Status`, `BriefCommandCard`, `AppShell`, `type SiteSummary`, `type Status`. Icons via `import { CheckIcon, PauseIcon, UserPlusIcon, PhotoIcon, MessageIcon, CheckCircleIcon, WarnTriangleIcon, InfoSquareIcon, ChevronDownIcon, ChartBarIcon, ShieldIcon, BuildingIcon } from '../../ui/icons'`.
- `severityToStatus(sev)` maps high→risk / med→warn / low→info. For ActivityItem `severity ∈ {info,success,warning}` we need our own tiny map (below) since the union differs.
- Shared state components: `Spinner`, `ErrorState`, `EmptyState` from `src/components/states.tsx`.
- Routing: react-router-dom v6, `<Route>` in `src/App.tsx`. Live owner-reachable routes today: `/owner`, `/approvals`, `/sites`, `/sites/:id`, `/chat`, `/health/:siteId`, `/reports`, `/permits`, `/search`. **There is NO `/feed/photo`, no `/decision/:id`, no project-timeline, no `/requests` route yet.** `linkFor` therefore maps to the CLOSEST existing live route and is written so slice-D/other slices can retarget it in one place. Concretely (verified against `App.tsx`):
  - `feed_photo` → `/chat` (photos surface in chat today; feed/photo has no web route)
  - `update` / `milestone` → `/sites/${link.id}` (project detail = the timeline surrogate)
  - `request` → `/chat`
  - `decision` → `/approvals`
  - `finding` → `/health/${link.id}`
  These are the honest current targets; a `// TODO(slice-D/nav)` marks each so the nav-verification slice can retarget without touching call sites.
- Tests use `@testing-library/react` + `QueryClientProvider` + `LanguageProvider` (pattern from `src/features/admin/Billing.test.tsx`) and `MemoryRouter` when a component renders `<Link>`/`useNavigate` (pattern from `src/ui/NeevSidebar.test.tsx`).
- i18n: `useT()` → `t(key, vars?)`; `TranslationKey = keyof typeof en` (`src/i18n/en.ts`, 1193 lines). New keys appended to BOTH `en.ts` and `hi.ts`. Site-type labels already exist: `auth.onboard.site.type.{residential,commercial,villa,interior,infra}`.

**Dependency on slice D:** `OwnerHome` imports `<ProjectsStrip>` from `../../features/owner/ProjectsStrip` (built in slice D). This slice references it with the exact prop contract `ProjectsStrip({ selectedSiteId, onSelectSite })` and — to keep this slice independently buildable/testable — Task C6 lands OwnerHome with a **thin local placeholder** `ProjectsStrip` file ONLY IF slice D has not landed yet; the checkbox step notes the swap. If slices are executed in order (D before C6), skip the placeholder and import the real one. Either way the import path and props are fixed here.

---

### Task C1: `activityApi` client + types + `qk.activity`

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/activity.ts`
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/queryKeys.ts` (add `activity` key after the `home` key, ~line 27)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/activity.test.ts`

**Interfaces:**
- Consumes: `USE_MOCKS`, `API_BASE` (`./config`); `ApiError` (`./client`); `getToken` (`./auth`).
- Produces:
  - `type ActivityKind = 'photo_shared' | 'update_posted' | 'milestone_reached' | 'weekly_summary' | 'scope_change' | 'homeowner_request' | 'decision_made' | 'site_health_flag'`
  - `type ActivitySeverity = 'info' | 'success' | 'warning'`
  - `type ActivityLinkType = 'feed_photo' | 'update' | 'milestone' | 'request' | 'decision' | 'finding'`
  - `interface ActivityLink { type: ActivityLinkType; id: string }`
  - `interface ActivityItem { id: string; kind: ActivityKind; site_id: string; site_name: string; title: string; subtitle: string | null; occurred_at: string; actor: string | null; link: ActivityLink; severity: ActivitySeverity }`
  - `interface ActivitySummary { updates_today: number; needs_decision_count: number; sites_total: number }`
  - `interface ActivityPage { items: ActivityItem[]; summary: ActivitySummary; next_cursor: string | null }`
  - `activityApi.page(opts?: { siteId?: string; cursor?: string; limit?: number }): Promise<ActivityPage>`
  - `qk.activity(siteId?: string): readonly ['activity', string | null]`

- [ ] **Step 1: Write the failing test** — create `src/api/activity.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Force the mock branch on for this suite (config reads import.meta.env at module load).
vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config')
  return { ...actual, USE_MOCKS: true, API_BASE: 'http://test.local' }
})

const { activityApi } = await import('./activity')
const { qk } = await import('./queryKeys')

describe('activityApi (mock branch)', () => {
  it('page() returns a summary + a first page of items with the shared shape', async () => {
    const page = await activityApi.page({ limit: 20 })
    expect(page.summary).toEqual(
      expect.objectContaining({
        updates_today: expect.any(Number),
        needs_decision_count: expect.any(Number),
        sites_total: expect.any(Number),
      }),
    )
    expect(page.items.length).toBeGreaterThan(0)
    const item = page.items[0]
    expect(item.id).toMatch(/^[a-z_]+:/) // "{kind}:{uuid}"
    expect(item).toEqual(
      expect.objectContaining({
        kind: expect.any(String),
        site_id: expect.any(String),
        site_name: expect.any(String),
        title: expect.any(String),
        occurred_at: expect.any(String),
        link: expect.objectContaining({ type: expect.any(String), id: expect.any(String) }),
        severity: expect.stringMatching(/^(info|success|warning)$/),
      }),
    )
  })

  it('page() paginates: passing the returned cursor yields a different (or empty) page and eventually a null cursor', async () => {
    const first = await activityApi.page({ limit: 3 })
    expect(first.items).toHaveLength(3)
    expect(first.next_cursor).not.toBeNull()
    const second = await activityApi.page({ cursor: first.next_cursor!, limit: 3 })
    const firstIds = new Set(first.items.map((i) => i.id))
    for (const i of second.items) expect(firstIds.has(i.id)).toBe(false)
    // Walk to the end — the last page must report a null cursor.
    let cursor = second.next_cursor
    let guard = 0
    while (cursor && guard++ < 20) {
      const p = await activityApi.page({ cursor, limit: 3 })
      cursor = p.next_cursor
    }
    expect(cursor).toBeNull()
  })

  it('page({ siteId }) returns only items for that site', async () => {
    const all = await activityApi.page({ limit: 50 })
    const site = all.items[0].site_id
    const filtered = await activityApi.page({ siteId: site, limit: 50 })
    expect(filtered.items.length).toBeGreaterThan(0)
    for (const i of filtered.items) expect(i.site_id).toBe(site)
  })

  it('qk.activity is stable and namespaced', () => {
    expect(qk.activity()).toEqual(['activity', null])
    expect(qk.activity('s1')).toEqual(['activity', 's1'])
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/activity.test.ts`. Expected: fails to resolve `./activity` (module not found) / `qk.activity is not a function`.

- [ ] **Step 3: Minimal implementation** — add `qk.activity` to `src/api/queryKeys.ts` right after the `home` key (line 27):
```ts
  /** Owner activity stream page (keyed by optional site filter). */
  activity: (siteId?: string) => ['activity', siteId ?? null] as const,
```
Then create `src/api/activity.ts` (request helper copied verbatim from `dashboard.ts` lines 114–133; mock fixtures mirror `dashboard.ts`'s `mockHome`/`mockDelay` style):
```ts
// Owner activity stream API surface (activity-first Command Center).
//
// Read-only union feed: GET /api/v1/activity?site_id&cursor&limit → one page of
// ActivityItem rows + the hero summary counts + a keyset next_cursor. Self-
// contained (reuses API_BASE / ApiError / getToken by import only, like the
// sibling dashboard.ts / approvals.ts modules).
import { API_BASE, USE_MOCKS } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---- wire types (snake_case, mirror the backend) --------------------------

export type ActivityKind =
  | 'photo_shared'
  | 'update_posted'
  | 'milestone_reached'
  | 'weekly_summary'
  | 'scope_change'
  | 'homeowner_request'
  | 'decision_made'
  | 'site_health_flag'

export type ActivitySeverity = 'info' | 'success' | 'warning'

export type ActivityLinkType =
  | 'feed_photo'
  | 'update'
  | 'milestone'
  | 'request'
  | 'decision'
  | 'finding'

export interface ActivityLink {
  type: ActivityLinkType
  id: string
}

export interface ActivityItem {
  /** "{kind}:{row_uuid}" — stable, cross-source unique. */
  id: string
  kind: ActivityKind
  site_id: string
  site_name: string
  title: string
  subtitle: string | null
  occurred_at: string
  actor: string | null
  link: ActivityLink
  severity: ActivitySeverity
}

export interface ActivitySummary {
  updates_today: number
  needs_decision_count: number
  sites_total: number
}

export interface ActivityPage {
  items: ActivityItem[]
  summary: ActivitySummary
  next_cursor: string | null
}

// ---- request helper (mirrors client.ts; uses the shared primitives) -------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev — only when VITE_USE_MOCKS=true) ------
//
// Lets the activity-first OwnerHome render its whole stream without a backend
// (the union query otherwise needs Postgres). Ordered newest-first; the mock
// page() slices by an occurred_at keyset cursor exactly like the real endpoint.
const MOCK_SITES: Record<string, string> = {
  'site-tower-b': 'Tower B',
  'site-villa-a': 'Villa A',
  'site-plaza': 'City Plaza',
}

const mockItems: ActivityItem[] = [
  {
    id: 'photo_shared:11111111-0000-0000-0000-000000000001',
    kind: 'photo_shared',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'New site photo shared',
    subtitle: 'Slab shuttering, east face',
    occurred_at: '2026-07-03T09:40:00Z',
    actor: 'Suresh (supervisor)',
    link: { type: 'feed_photo', id: '11111111-0000-0000-0000-000000000001' },
    severity: 'success',
  },
  {
    id: 'homeowner_request:22222222-0000-0000-0000-000000000002',
    kind: 'homeowner_request',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Homeowner asked for a photo of the kitchen',
    subtitle: 'Overdue — 4 days',
    occurred_at: '2026-07-03T08:10:00Z',
    actor: 'Homeowner',
    link: { type: 'request', id: '22222222-0000-0000-0000-000000000002' },
    severity: 'warning',
  },
  {
    id: 'update_posted:33333333-0000-0000-0000-000000000003',
    kind: 'update_posted',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'Daily update published',
    subtitle: '9 workers · 2 deliveries',
    occurred_at: '2026-07-03T07:05:00Z',
    actor: 'Anita (PM)',
    link: { type: 'update', id: 'site-tower-b' },
    severity: 'info',
  },
  {
    id: 'milestone_reached:44444444-0000-0000-0000-000000000004',
    kind: 'milestone_reached',
    site_id: 'site-plaza',
    site_name: 'City Plaza',
    title: 'Milestone reached: Ground floor slab',
    subtitle: null,
    occurred_at: '2026-07-02T16:20:00Z',
    actor: null,
    link: { type: 'milestone', id: 'site-plaza' },
    severity: 'success',
  },
  {
    id: 'decision_made:55555555-0000-0000-0000-000000000005',
    kind: 'decision_made',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Approved: extra 50 bags cement (₹17,500)',
    subtitle: null,
    occurred_at: '2026-07-02T11:00:00Z',
    actor: 'You',
    link: { type: 'decision', id: '55555555-0000-0000-0000-000000000005' },
    severity: 'info',
  },
  {
    id: 'site_health_flag:66666666-0000-0000-0000-000000000006',
    kind: 'site_health_flag',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'Site Health flag: schedule drift',
    subtitle: 'Slab pour 3 days behind baseline',
    occurred_at: '2026-07-02T06:00:00Z',
    actor: null,
    link: { type: 'finding', id: 'site-tower-b' },
    severity: 'warning',
  },
  {
    id: 'weekly_summary:77777777-0000-0000-0000-000000000007',
    kind: 'weekly_summary',
    site_id: 'site-plaza',
    site_name: 'City Plaza',
    title: 'Weekly summary ready',
    subtitle: 'Week of 23 Jun',
    occurred_at: '2026-06-30T04:00:00Z',
    actor: null,
    link: { type: 'update', id: 'site-plaza' },
    severity: 'info',
  },
  {
    id: 'scope_change:88888888-0000-0000-0000-000000000008',
    kind: 'scope_change',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Scope change logged: added powder room',
    subtitle: null,
    occurred_at: '2026-06-29T13:30:00Z',
    actor: 'Architect',
    link: { type: 'update', id: 'site-villa-a' },
    severity: 'info',
  },
]

const mockSummary: ActivitySummary = {
  updates_today: 3,
  needs_decision_count: 1,
  sites_total: Object.keys(MOCK_SITES).length,
}

const mockDelay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

/** Mock keyset page: rows strictly older than `cursor` (an occurred_at iso). */
function mockPage(opts: { siteId?: string; cursor?: string; limit?: number }): ActivityPage {
  const limit = opts.limit ?? 20
  let rows = [...mockItems].sort(
    (a, b) => b.occurred_at.localeCompare(a.occurred_at),
  )
  if (opts.siteId) rows = rows.filter((r) => r.site_id === opts.siteId)
  if (opts.cursor) rows = rows.filter((r) => r.occurred_at < opts.cursor!)
  const pageRows = rows.slice(0, limit)
  const next =
    rows.length > limit ? pageRows[pageRows.length - 1].occurred_at : null
  return { items: pageRows, summary: mockSummary, next_cursor: next }
}

// ---- public surface -------------------------------------------------------

export const activityApi = {
  async page(
    opts: { siteId?: string; cursor?: string; limit?: number } = {},
  ): Promise<ActivityPage> {
    if (USE_MOCKS) {
      await mockDelay()
      return mockPage(opts)
    }
    const params = new URLSearchParams()
    if (opts.siteId) params.set('site_id', opts.siteId)
    if (opts.cursor) params.set('cursor', opts.cursor)
    params.set('limit', String(opts.limit ?? 20))
    return request<ActivityPage>(`/api/v1/activity?${params.toString()}`)
  },
}
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/activity.test.ts`. Expected: `4 passed`. Then `npm run build` → clean tsc -b.

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/api/activity.ts src/api/activity.test.ts src/api/queryKeys.ts && git commit -m "feat(web): typed activity API client + qk.activity for the owner stream"`

---

### Task C2: i18n keys for HonestHero / ActivityStream / cleaned NeedsYou

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/en.ts` (append inside the `en` object, before the closing `}` at ~line 1191; the `export type TranslationKey` on line 1193 stays last)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/hi.ts` (append the same keys with Hindi values)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/activityKeys.test.ts`

**Interfaces:**
- Consumes: `en` (`./en`), `hi` (`./hi`).
- Produces (new `TranslationKey`s used by C3/C4/C5/C6): `owner.hero.eyebrow`, `owner.hero.all_quiet`, `owner.hero.all_quiet_never`, `owner.hero.one_update`, `owner.hero.many_updates`, `owner.hero.and_one_decision`, `owner.hero.and_many_decisions`, `activity.title`, `activity.loading`, `activity.error`, `activity.empty`, `activity.empty_hint`, `activity.load_more`, `activity.loading_more`, `activity.filter_all`, `activity.reply`, `activity.rel.just_now`, `activity.rel.mins_ago`, `activity.rel.hrs_ago`, `activity.rel.days_ago`, `owner.needs.empty_clean`.

- [ ] **Step 1: Write the failing test** — create `src/i18n/activityKeys.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { hi } from './hi'

const REQUIRED = [
  'owner.hero.eyebrow',
  'owner.hero.all_quiet',
  'owner.hero.all_quiet_never',
  'owner.hero.one_update',
  'owner.hero.many_updates',
  'owner.hero.and_one_decision',
  'owner.hero.and_many_decisions',
  'activity.title',
  'activity.loading',
  'activity.error',
  'activity.empty',
  'activity.empty_hint',
  'activity.load_more',
  'activity.loading_more',
  'activity.filter_all',
  'activity.reply',
  'activity.rel.just_now',
  'activity.rel.mins_ago',
  'activity.rel.hrs_ago',
  'activity.rel.days_ago',
  'owner.needs.empty_clean',
] as const

describe('activity i18n keys', () => {
  it.each(REQUIRED)('en + hi both define %s', (key) => {
    expect(en).toHaveProperty(key)
    expect((en as Record<string, string>)[key].length).toBeGreaterThan(0)
    expect(hi).toHaveProperty(key)
    expect((hi as Record<string, string>)[key].length).toBeGreaterThan(0)
  })
})
```
> Note: confirm `en`/`hi` are named exports of `en.ts`/`hi.ts`. `en.ts` line 1193 is `export type TranslationKey = keyof typeof en`, so `en` is a named export; `hi.ts` mirrors it. If `hi` is a default export, adjust the import to `import hi from './hi'` — verify with `grep -n "export" src/i18n/hi.ts | head`.

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/activityKeys.test.ts`. Expected: every case fails on `toHaveProperty`.

- [ ] **Step 3: Minimal implementation** — append to the `en` object in `src/i18n/en.ts` (place near the other `owner.*` keys, e.g. after `'owner.log.days_ago'`):
```ts
  // ---- activity-first OwnerHome (hero + stream) ----
  'owner.hero.eyebrow': 'Owner · {date}',
  'owner.hero.all_quiet': 'All quiet — last update {rel}',
  'owner.hero.all_quiet_never': 'All quiet — no activity yet',
  'owner.hero.one_update': '1 update today',
  'owner.hero.many_updates': '{count} updates today',
  'owner.hero.and_one_decision': ' · 1 needs you',
  'owner.hero.and_many_decisions': ' · {count} need you',
  'activity.title': 'Latest',
  'activity.loading': 'Loading activity…',
  'activity.error': 'Could not load activity.',
  'activity.empty': 'No activity yet',
  'activity.empty_hint': 'Photos, updates and decisions will appear here as work happens.',
  'activity.load_more': 'Load more',
  'activity.loading_more': 'Loading…',
  'activity.filter_all': 'All projects',
  'activity.reply': 'Reply',
  'activity.rel.just_now': 'just now',
  'activity.rel.mins_ago': '{n}m ago',
  'activity.rel.hrs_ago': '{n}h ago',
  'activity.rel.days_ago': '{n}d ago',
  'owner.needs.empty_clean': 'Nothing needs a decision right now.',
```
Append to `hi` in `src/i18n/hi.ts` (Hindi values):
```ts
  // ---- activity-first OwnerHome (hero + stream) ----
  'owner.hero.eyebrow': 'मालिक · {date}',
  'owner.hero.all_quiet': 'सब शांत — पिछला अपडेट {rel}',
  'owner.hero.all_quiet_never': 'सब शांत — अभी कोई गतिविधि नहीं',
  'owner.hero.one_update': 'आज 1 अपडेट',
  'owner.hero.many_updates': 'आज {count} अपडेट',
  'owner.hero.and_one_decision': ' · 1 पर आपका निर्णय चाहिए',
  'owner.hero.and_many_decisions': ' · {count} पर आपका निर्णय चाहिए',
  'activity.title': 'ताज़ा',
  'activity.loading': 'गतिविधि लोड हो रही है…',
  'activity.error': 'गतिविधि लोड नहीं हो सकी।',
  'activity.empty': 'अभी कोई गतिविधि नहीं',
  'activity.empty_hint': 'काम होते ही फ़ोटो, अपडेट और निर्णय यहाँ दिखेंगे।',
  'activity.load_more': 'और देखें',
  'activity.loading_more': 'लोड हो रहा है…',
  'activity.filter_all': 'सभी प्रोजेक्ट',
  'activity.reply': 'जवाब दें',
  'activity.rel.just_now': 'अभी',
  'activity.rel.mins_ago': '{n} मिनट पहले',
  'activity.rel.hrs_ago': '{n} घंटे पहले',
  'activity.rel.days_ago': '{n} दिन पहले',
  'owner.needs.empty_clean': 'अभी किसी निर्णय की ज़रूरत नहीं है।',
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/activityKeys.test.ts`. Expected: `21 passed`. Then `npm run build` (the i18n test file `i18n.test.tsx` also enforces en/hi key parity — build + that test must stay green).

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/i18n/en.ts src/i18n/hi.ts src/i18n/activityKeys.test.ts && git commit -m "i18n(web): hero + activity-stream + cleaned needs-you keys (en/hi)"`

---

### Task C3: `HonestHero` — pure headline from summary counts

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/HonestHero.tsx`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/HonestHero.test.tsx`

**Interfaces:**
- Consumes: `ActivitySummary` (`../../api/activity`); `useT` (`../../i18n`); `Display, Small` (`../../ui`); `useSkin` (`../../ui/ThemeModeProvider`); `formatDate` (`../../lib/format`).
- Produces:
  - `export function buildHeroHeadline(summary: ActivitySummary | undefined, lastActivityAt: string | null, t: TFunction): string` (pure, unit-tested directly)
  - `export function HonestHero({ summary, lastActivityAt, date }: { summary?: ActivitySummary; lastActivityAt: string | null; date: string }): JSX.Element`

Headline logic (pure, honest — no fake numbers):
- `updates_today === 0` → `t('owner.hero.all_quiet', { rel })` where `rel = relativeActivity(lastActivityAt)`; if `lastActivityAt == null` → `t('owner.hero.all_quiet_never')`.
- `updates_today === 1` → `t('owner.hero.one_update')`; `> 1` → `t('owner.hero.many_updates', { count })`.
- Then append decision clause: `needs_decision_count === 1` → `+ t('owner.hero.and_one_decision')`; `> 1` → `+ t('owner.hero.and_many_decisions', { count })`; `0` → nothing.

- [ ] **Step 1: Write the failing test** — create `src/features/owner/HonestHero.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '../../i18n'
import { ThemeModeProvider } from '../../ui/ThemeModeProvider'
import { buildHeroHeadline, HonestHero } from './HonestHero'
import type { ActivitySummary } from '../../api/activity'

// A minimal English `t` for the pure-function tests (matches en.ts wording).
const t = ((key: string, vars?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'owner.hero.all_quiet': `All quiet — last update ${vars?.rel}`,
    'owner.hero.all_quiet_never': 'All quiet — no activity yet',
    'owner.hero.one_update': '1 update today',
    'owner.hero.many_updates': `${vars?.count} updates today`,
    'owner.hero.and_one_decision': ' · 1 needs you',
    'owner.hero.and_many_decisions': ` · ${vars?.count} need you`,
    'activity.rel.just_now': 'just now',
    'activity.rel.mins_ago': `${vars?.n}m ago`,
    'activity.rel.hrs_ago': `${vars?.n}h ago`,
    'activity.rel.days_ago': `${vars?.n}d ago`,
  }
  return map[key] ?? key
}) as never

const sum = (o: Partial<ActivitySummary>): ActivitySummary => ({
  updates_today: 0,
  needs_decision_count: 0,
  sites_total: 3,
  ...o,
})

describe('buildHeroHeadline', () => {
  it('0 updates → all-quiet with the last-activity relative time', () => {
    const iso = new Date(Date.now() - 2 * 3600_000).toISOString()
    expect(buildHeroHeadline(sum({ updates_today: 0 }), iso, t)).toBe(
      'All quiet — last update 2h ago',
    )
  })
  it('0 updates + never → all-quiet-never', () => {
    expect(buildHeroHeadline(sum({ updates_today: 0 }), null, t)).toBe(
      'All quiet — no activity yet',
    )
  })
  it('1 update, 0 decisions → singular, no decision clause', () => {
    expect(buildHeroHeadline(sum({ updates_today: 1 }), '2026-07-03T00:00:00Z', t)).toBe(
      '1 update today',
    )
  })
  it('3 updates + 1 decision → plural updates + singular decision clause', () => {
    expect(
      buildHeroHeadline(sum({ updates_today: 3, needs_decision_count: 1 }), '2026-07-03T00:00:00Z', t),
    ).toBe('3 updates today · 1 needs you')
  })
  it('5 updates + 2 decisions → both plural', () => {
    expect(
      buildHeroHeadline(sum({ updates_today: 5, needs_decision_count: 2 }), '2026-07-03T00:00:00Z', t),
    ).toBe('5 updates today · 2 need you')
  })
  it('undefined summary → all-quiet-never (no crash)', () => {
    expect(buildHeroHeadline(undefined, null, t)).toBe('All quiet — no activity yet')
  })
})

describe('<HonestHero>', () => {
  it('renders the eyebrow + the computed headline', () => {
    render(
      <ThemeModeProvider>
        <LanguageProvider defaultLanguage="en">
          <HonestHero
            summary={sum({ updates_today: 3, needs_decision_count: 1 })}
            lastActivityAt="2026-07-03T00:00:00Z"
            date="2026-07-03"
          />
        </LanguageProvider>
      </ThemeModeProvider>,
    )
    expect(screen.getByText(/3 updates today · 1 needs you/)).toBeInTheDocument()
    expect(screen.getByText(/Owner ·/)).toBeInTheDocument()
  })
})
```
> Note: confirm `ThemeModeProvider` is exported from `src/ui/ThemeModeProvider.tsx` (OwnerHome imports `useSkin` from it). If `<HonestHero>` renders without needing skin context in tests, you may drop the provider; keep it to exercise the neev/default branch.

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/HonestHero.test.tsx`. Expected: cannot resolve `./HonestHero`.

- [ ] **Step 3: Minimal implementation** — create `src/features/owner/HonestHero.tsx`:
```tsx
// HonestHero — the activity-first OwnerHome headline. A PURE function of the
// activity summary counts + the newest activity timestamp: no fabricated
// numbers, no spinners. Mirrors the two skins the old OwnerHome header used
// (Neev editorial serif vs default Blueprint).
import { useT, type TFunction } from '../../i18n'
import { formatDate } from '../../lib/format'
import { Display, Small } from '../../ui'
import { useSkin } from '../../ui/ThemeModeProvider'
import type { ActivitySummary } from '../../api/activity'

/** Compact relative time for the all-quiet clause ("2h ago" / "just now"). */
function relativeActivity(iso: string | null, t: TFunction): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('activity.rel.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('activity.rel.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('activity.rel.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('activity.rel.days_ago', { n: days })
}

/** Pure headline builder — unit tested directly (no React). */
export function buildHeroHeadline(
  summary: ActivitySummary | undefined,
  lastActivityAt: string | null,
  t: TFunction,
): string {
  const updates = summary?.updates_today ?? 0
  const decisions = summary?.needs_decision_count ?? 0

  if (updates === 0) {
    return lastActivityAt
      ? t('owner.hero.all_quiet', { rel: relativeActivity(lastActivityAt, t) })
      : t('owner.hero.all_quiet_never')
  }

  const head =
    updates === 1
      ? t('owner.hero.one_update')
      : t('owner.hero.many_updates', { count: updates })

  const tail =
    decisions === 1
      ? t('owner.hero.and_one_decision')
      : decisions > 1
        ? t('owner.hero.and_many_decisions', { count: decisions })
        : ''

  return `${head}${tail}`
}

export function HonestHero({
  summary,
  lastActivityAt,
  date,
}: {
  summary?: ActivitySummary
  lastActivityAt: string | null
  date: string
}) {
  const t = useT()
  const neev = useSkin() === 'neev'
  const headline = buildHeroHeadline(summary, lastActivityAt, t)
  const eyebrow = t('owner.hero.eyebrow', { date: formatDate(date) })

  if (neev) {
    return (
      <header>
        <p className="font-body text-micro font-semibold uppercase tracking-[0.14em] text-[var(--celebrate-text)]">
          {eyebrow}
        </p>
        <Display className="mt-2 !text-[2.1rem] !leading-[1.1]">{headline}</Display>
      </header>
    )
  }
  return (
    <header>
      <Small className="!text-text-mute">{eyebrow}</Small>
      <Display className="mt-1">{headline}</Display>
    </header>
  )
}
```
> Note: verify `TFunction` is exported from `src/i18n` (used by DecisionLog via `ReturnType<typeof useT>`; if `TFunction` is not exported, use `type TFunction = ReturnType<typeof useT>` locally, and in the test type `t` accordingly). Verify `formatDate` is exported from `src/lib/format` (OwnerHome imports it there).

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/HonestHero.test.tsx`. Expected: `7 passed`. Then `npm run build`.

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/owner/HonestHero.tsx src/features/owner/HonestHero.test.tsx && git commit -m "feat(web): HonestHero — pure activity-summary headline for OwnerHome"`

---

### Task C4: `ActivityStream` — infinite list + `linkFor` route map + 4 states + filter

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ActivityStream.tsx`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ActivityStream.test.tsx`

**Interfaces:**
- Consumes: `useInfiniteQuery` (`@tanstack/react-query`); `activityApi`, `type ActivityItem`, `type ActivityPage`, `type ActivityLink`, `type ActivitySeverity` (`../../api/activity`); `qk` (`../../api/queryKeys`); `useT` (`../../i18n`); `Spinner, ErrorState, EmptyState` (`../../components/states`); `StatusDot, Body, Small, Mono, type Status` (`../../ui`); `PhotoIcon, MessageIcon, CheckCircleIcon, WarnTriangleIcon, InfoSquareIcon, ChartBarIcon, ShieldIcon, BuildingIcon` (`../../ui/icons`); `Link` (`react-router-dom`).
- Produces:
  - `export function linkFor(link: ActivityLink): string` (pure route map, unit-tested)
  - `export function ActivityStream({ selectedSiteId, onReply }: { selectedSiteId: string | null; onReply?: (item: ActivityItem) => void }): JSX.Element`

`linkFor` (grounded in `App.tsx` live routes; each with a retarget TODO):
```
feed_photo → '/chat'                    // TODO(nav): no /feed/photo web route yet
update     → `/sites/${link.id}`        // project timeline surrogate = site detail
milestone  → `/sites/${link.id}`
request    → '/chat'                    // TODO(nav): dedicated /requests lands in a later slice
decision   → '/approvals'              // TODO(nav): no /decision/:id route yet
finding    → `/health/${link.id}`
```
Severity→(icon, Status) map: `success`→(CheckCircleIcon, 'ok'), `warning`→(WarnTriangleIcon, 'warn'), `info`→(InfoSquareIcon, 'info'). Kind may refine the icon (photo_shared→PhotoIcon, homeowner_request→MessageIcon) but severity drives the tint/StatusDot.

- [ ] **Step 1: Write the failing test** — create `src/features/owner/ActivityStream.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import type { ActivityItem, ActivityPage } from '../../api/activity'

const page = vi.fn()
vi.mock('../../api/activity', async () => {
  const actual = await vi.importActual<typeof import('../../api/activity')>('../../api/activity')
  return { ...actual, activityApi: { page: (...a: unknown[]) => page(...a) } }
})

const { ActivityStream, linkFor } = await import('./ActivityStream')

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'photo_shared:1',
    kind: 'photo_shared',
    site_id: 'site-a',
    site_name: 'Tower B',
    title: 'New site photo shared',
    subtitle: 'east face',
    occurred_at: new Date().toISOString(),
    actor: 'Suresh',
    link: { type: 'feed_photo', id: 'p1' },
    severity: 'success',
    ...over,
  }
}
function pageOf(items: ActivityItem[], next: string | null): ActivityPage {
  return { items, summary: { updates_today: 1, needs_decision_count: 0, sites_total: 2 }, next_cursor: next }
}

function renderStream(selectedSiteId: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider defaultLanguage="en">
          <ActivityStream selectedSiteId={selectedSiteId} />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('linkFor', () => {
  it('maps every link type to a live route', () => {
    expect(linkFor({ type: 'feed_photo', id: 'p1' })).toBe('/chat')
    expect(linkFor({ type: 'update', id: 'site-a' })).toBe('/sites/site-a')
    expect(linkFor({ type: 'milestone', id: 'site-a' })).toBe('/sites/site-a')
    expect(linkFor({ type: 'request', id: 'r1' })).toBe('/chat')
    expect(linkFor({ type: 'decision', id: 'd1' })).toBe('/approvals')
    expect(linkFor({ type: 'finding', id: 'site-a' })).toBe('/health/site-a')
  })
})

describe('<ActivityStream>', () => {
  beforeEach(() => page.mockReset())

  it('renders populated rows with title, site and a link to linkFor', async () => {
    page.mockResolvedValueOnce(pageOf([item()], null))
    renderStream()
    expect(await screen.findByText('New site photo shared')).toBeInTheDocument()
    expect(screen.getByText(/Tower B/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /New site photo shared/i })
    expect(link).toHaveAttribute('href', '/chat')
  })

  it('shows the honest empty state when the first page is empty', async () => {
    page.mockResolvedValueOnce(pageOf([], null))
    renderStream()
    expect(await screen.findByText(/No activity yet/i)).toBeInTheDocument()
  })

  it('shows an inline error + retry when the query rejects', async () => {
    page.mockRejectedValueOnce(new Error('boom'))
    renderStream()
    expect(await screen.findByText(/Could not load activity/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('loads the next page when Load more is clicked', async () => {
    page
      .mockResolvedValueOnce(pageOf([item({ id: 'photo_shared:1', title: 'First' })], '2026-07-03T00:00:00Z'))
      .mockResolvedValueOnce(pageOf([item({ id: 'update_posted:2', title: 'Second', kind: 'update_posted', link: { type: 'update', id: 'site-a' } })], null))
    renderStream()
    expect(await screen.findByText('First')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(page).toHaveBeenCalledTimes(2)
    // second call carried the cursor
    expect(page).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: '2026-07-03T00:00:00Z' }))
  })

  it('passes the site filter through to activityApi.page', async () => {
    page.mockResolvedValueOnce(pageOf([item()], null))
    renderStream('site-a')
    await waitFor(() => expect(page).toHaveBeenCalled())
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-a' }))
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/ActivityStream.test.tsx`. Expected: cannot resolve `./ActivityStream`.

- [ ] **Step 3: Minimal implementation** — create `src/features/owner/ActivityStream.tsx`:
```tsx
// ActivityStream — the primary surface of the activity-first OwnerHome. An
// infinite, keyset-paged list of the union feed (GET /activity). Each row is a
// severity-tinted status dot + kind icon, the title, `site · relative-time`, and
// a trailing chevron; the whole row deep-links via linkFor(item.link). Four
// states (loading / empty / error+retry / populated) + an optional per-project
// filter fed by `selectedSiteId`. Non-blocking by design (OwnerHome still shows
// hero + needs-you if this errors).
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  activityApi,
  type ActivityItem,
  type ActivityLink,
  type ActivityPage,
  type ActivitySeverity,
} from '../../api/activity'
import { qk } from '../../api/queryKeys'
import { useT, type TFunction } from '../../i18n'
import { ErrorState, Spinner, EmptyState } from '../../components/states'
import { Body, Mono, Small, StatusDot, type Status } from '../../ui'
import {
  PhotoIcon,
  MessageIcon,
  CheckCircleIcon,
  WarnTriangleIcon,
  InfoSquareIcon,
} from '../../ui/icons'
import type { ReactNode } from 'react'

/** Deep-link an activity row to a live web route (single source of truth). */
export function linkFor(link: ActivityLink): string {
  switch (link.type) {
    case 'feed_photo':
      return '/chat' // TODO(nav): no /feed/photo web route yet — retarget when it lands
    case 'update':
    case 'milestone':
      return `/sites/${link.id}` // project-timeline surrogate = site detail
    case 'request':
      return '/chat' // TODO(nav): dedicated /requests surface lands in a later slice
    case 'decision':
      return '/approvals' // TODO(nav): no /decision/:id route yet
    case 'finding':
      return `/health/${link.id}`
    default:
      return '/owner'
  }
}

const SEVERITY_STATUS: Record<ActivitySeverity, Status> = {
  success: 'ok',
  warning: 'warn',
  info: 'info',
}

/** Kind-specific glyph; falls back to the severity icon. */
function iconFor(item: ActivityItem): (p: { title?: string }) => ReactNode {
  if (item.kind === 'photo_shared') return PhotoIcon
  if (item.kind === 'homeowner_request') return MessageIcon
  switch (item.severity) {
    case 'success':
      return CheckCircleIcon
    case 'warning':
      return WarnTriangleIcon
    default:
      return InfoSquareIcon
  }
}

/** Compact "2h ago" / "just now" relative time. */
function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('activity.rel.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('activity.rel.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('activity.rel.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('activity.rel.days_ago', { n: days })
}

export function ActivityStream({
  selectedSiteId,
  onReply,
}: {
  selectedSiteId: string | null
  onReply?: (item: ActivityItem) => void
}) {
  const t = useT()
  const query = useInfiniteQuery<ActivityPage, Error>({
    queryKey: qk.activity(selectedSiteId ?? undefined),
    queryFn: ({ pageParam }) =>
      activityApi.page({
        siteId: selectedSiteId ?? undefined,
        cursor: (pageParam as string | undefined) ?? undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section aria-labelledby="owner-activity-heading" className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="owner-activity-heading" className="font-display text-h2 font-semibold text-text">
          {t('activity.title')}
        </h2>
      </header>

      {query.isLoading ? (
        <Spinner label={t('activity.loading')} />
      ) : query.isError ? (
        <ErrorState
          message={t('activity.error')}
          onRetry={() => query.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title={t('activity.empty')} hint={t('activity.empty_hint')} />
      ) : (
        <>
          <ol className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            {items.map((item) => (
              <li key={item.id} className="border-b border-line last:border-b-0">
                <Link
                  to={linkFor(item.link)}
                  className="flex items-start gap-3 px-3 py-3 cstk-animate transition hover:bg-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <StatusDot status={SEVERITY_STATUS[item.severity]} />
                    <span className="text-text-mute" aria-hidden>
                      {(() => {
                        const Icon = iconFor(item)
                        return <Icon title={item.kind} />
                      })()}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <Body className="truncate font-semibold text-text">{item.title}</Body>
                    {item.subtitle ? (
                      <Small className="block truncate !text-text-mute">{item.subtitle}</Small>
                    ) : null}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-micro text-text-mute">
                      <span className="truncate">{item.site_name}</span>
                      <Mono className="text-micro text-text-mute">
                        {relativeTime(item.occurred_at, t)}
                      </Mono>
                      {item.actor ? <span className="truncate">· {item.actor}</span> : null}
                    </p>
                  </div>
                  {item.link.type === 'request' && onReply ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        onReply(item)
                      }}
                      className="ml-2 inline-flex min-h-tap items-center rounded-pill border border-brand/50 bg-card px-3 font-body text-small font-semibold text-brand-text cstk-animate transition hover:bg-brand/10"
                    >
                      {t('activity.reply')}
                    </button>
                  ) : (
                    <span className="ml-2 mt-1 text-text-mute" aria-hidden>
                      ›
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>

          {query.hasNextPage ? (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mx-auto inline-flex min-h-tap items-center justify-center rounded-control border border-line bg-card px-4 font-body text-small font-semibold text-text cstk-animate transition hover:bg-line/30 disabled:opacity-60"
            >
              {query.isFetchingNextPage ? t('activity.loading_more') : t('activity.load_more')}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
```
> Notes to ground while implementing:
> - Confirm `StatusDot` accepts `status: Status` (it does — used in `DecisionLog`). Confirm `EmptyState` prop names are `{ title, hint }` (verified in `states.tsx`).
> - `useInfiniteQuery` v5 API: `initialPageParam` + `getNextPageParam` are required; `query.hasNextPage`, `query.isFetchingNextPage`, `query.fetchNextPage()` are the v5 names. This repo is on `@tanstack/react-query` v5 (dashboard uses `queryFn`/`onSettled` v5 style). If `npm run build` flags the `pageParam` typing, cast as shown (`pageParam as string | undefined`).
> - The icons render as small SVGs taking `{ title? }` — same call shape used by `NeedsYou`'s `Chip` (`Icon: (p: { title?: string }) => ReactNode`).

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/ActivityStream.test.tsx`. Expected: `linkFor` (1) + stream (5) = `6 passed`. Then `npm run build`.

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/owner/ActivityStream.tsx src/features/owner/ActivityStream.test.tsx && git commit -m "feat(web): ActivityStream — infinite union feed + linkFor route map + 4 states"`

---

### Task C5: Cleaned `NeedsYou` — genuine pending decisions from `approvalsApi.list()`

**Files:**
- Rewrite `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NeedsYou.tsx` (full replace of the current `home`/`SiteCard`-driven version)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/NeedsYou.test.tsx`

**Interfaces:**
- Consumes: `useQuery` (`@tanstack/react-query`); `approvalsApi`, `type Decision` (`../../api/approvals`); `qk` (`../../api/queryKeys`); `useDecide` (`./useDecide`); `useCan` (`../../auth/useCan`); `useT` (`../../i18n`); `Body, Small, StatusPill, StatusDot, type Status` (`../../ui`); `CheckIcon, PauseIcon, UserPlusIcon` (`../../ui/icons`); `Spinner` (`../../components/states`).
- Produces: `export function NeedsYou({ date, selectedSiteId, siteNames }: { date: string; selectedSiteId: string | null; siteNames: Record<string, string> }): JSX.Element`.

**Design (grounded):**
- Reads `qk.decisions()` → `approvalsApi.list()` (same query key the Decision Log + `useDecide` optimistic path already touch, so `useDecide`'s `onMutate`/`onError` on `qk.decisions()` stay coherent). Filters to genuine pending owner decisions: `d.state === 'pending' && (d.kind === 'approval' || d.kind === 'hold_payment')`. Applies the optional `selectedSiteId` filter.
- Each pending decision renders a compact card: title + `site · relative-time`, then the capability-gated chips. Owner (`useCan('approve_money')`) sees Approve/Hold/Assign; other roles see "Propose to owner →" (reuses the same copy keys already present: `owner.needs.propose`, `action.approve/hold/assign`, `owner.needs.approve_money` for money kinds).
- Acting calls `useDecide(date).decide(input)`. `DecideInput.riskKey` must remain `${siteId}-${index}` compatible? No — `useDecide` uses `riskKey` only to drop a row from the HOME cache via `applyDecisionToHome`. In the cleaned NeedsYou there is no home cache row to drop; we pass `riskKey` = the decision id, and rely on `useDecide`'s `onSettled` invalidation of `qk.decisions()` (+ optimistic prepend) to reconcile. The optimistic removal from THIS list happens because after a successful approve the decision's `state` flips to `resolved`/`pending`→ we additionally optimistically drop it locally in an `onSuccess` set (see impl) so the card vanishes instantly.
  - IMPORTANT: `useDecide`'s `onMutate` writes to `qk.decisions()` by *prepending* an optimistic row — it does NOT remove the source pending decision. So this component keeps its own local `Set<string>` of just-actioned decision ids and filters them out for instant feedback; `onSettled` refetch then reconciles server truth. This mirrors `dashboard.ts`'s `mockResolved` honest-optimism pattern.
- Honest empty state: `t('owner.needs.empty_clean')` when no genuine pending decisions.
- Still renders `<DecisionLog siteNames={siteNames} />` beneath (unchanged — it already reads `qk.decisions()`).
- Money kinds: `d.kind === 'hold_payment' || d.kind === 'approval'` all carry money semantics here → Approve chip shows `owner.needs.approve_money` (₹) for `approval`; `hold_payment` uses the plain Hold. Keep it simple: `money = d.kind === 'approval'`.

- [ ] **Step 1: Write the failing test** — create `src/features/owner/NeedsYou.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Decision, Paginated } from '../../api/approvals'

const list = vi.fn()
vi.mock('../../api/approvals', async () => {
  const actual = await vi.importActual<typeof import('../../api/approvals')>('../../api/approvals')
  return { ...actual, approvalsApi: { ...actual.approvalsApi, list: (...a: unknown[]) => list(...a) } }
})

const decide = vi.fn((_input, cb?: { onSuccess?: () => void }) => cb?.onSuccess?.())
vi.mock('./useDecide', () => ({ useDecide: () => ({ decide, isPending: false }) }))
// DecisionLog reads its own query; stub it to keep this test focused.
vi.mock('./DecisionLog', () => ({ DecisionLog: () => <div data-testid="decision-log" /> }))

const { NeedsYou } = await import('./NeedsYou')

function dec(over: Partial<Decision> = {}): Decision {
  return {
    id: 'dec-1', company_id: 'co', site_id: 'site-a', kind: 'approval',
    title: 'Approve extra 50 bags cement (₹17,500)', detail: null, raised_by: null,
    assigned_to: null, state: 'pending', sla_due_at: null, resolved_at: null,
    resolution_note: null, evidence_event_ids: [], created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), ...over,
  }
}
function paged(items: Decision[]): Paginated<Decision> { return { items, next_cursor: null } }

function renderNeeds(items: Decision[], role = 'owner', selectedSiteId: string | null = null) {
  list.mockResolvedValue(paged(items))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <NeedsYou date="2026-07-03" selectedSiteId={selectedSiteId} siteNames={{ 'site-a': 'Tower B' }} />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('<NeedsYou> (cleaned)', () => {
  beforeEach(() => { list.mockReset(); decide.mockClear() })

  it('lists only pending approval/hold_payment decisions', async () => {
    renderNeeds([
      dec({ id: 'a', kind: 'approval', state: 'pending' }),
      dec({ id: 'b', kind: 'homeowner_question', state: 'pending', title: 'Homeowner Q' }),
      dec({ id: 'c', kind: 'approval', state: 'resolved', title: 'Old approval' }),
      dec({ id: 'd', kind: 'hold_payment', state: 'pending', title: 'Hold payment to Jindal' }),
    ])
    expect(await screen.findByText(/Approve extra 50 bags/)).toBeInTheDocument()
    expect(screen.getByText(/Hold payment to Jindal/)).toBeInTheDocument()
    expect(screen.queryByText('Homeowner Q')).not.toBeInTheDocument()
    expect(screen.queryByText('Old approval')).not.toBeInTheDocument()
  })

  it('honest empty state when nothing is pending', async () => {
    renderNeeds([dec({ kind: 'approval', state: 'resolved' })])
    expect(await screen.findByText(/Nothing needs a decision right now/i)).toBeInTheDocument()
  })

  it('owner sees Approve chip and it calls decide()', async () => {
    renderNeeds([dec({ id: 'a', kind: 'approval', state: 'pending' })], 'owner')
    const approve = await screen.findByRole('button', { name: /approve/i })
    await userEvent.click(approve)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide.mock.calls[0][0]).toEqual(
      expect.objectContaining({ siteId: 'site-a', action: 'approve', title: expect.stringContaining('cement') }),
    )
    // optimistic: the card disappears after a successful decide
    await waitFor(() => expect(screen.queryByText(/Approve extra 50 bags/)).not.toBeInTheDocument())
  })

  it('non-owner sees "Propose to owner" instead of binding chips', async () => {
    renderNeeds([dec({ id: 'a', kind: 'approval', state: 'pending' })], 'pm')
    expect(await screen.findByRole('button', { name: /propose to owner/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^hold$/i })).not.toBeInTheDocument()
  })

  it('applies the selectedSiteId filter', async () => {
    renderNeeds([
      dec({ id: 'a', site_id: 'site-a', title: 'A pending' }),
      dec({ id: 'b', site_id: 'site-b', title: 'B pending' }),
    ], 'owner', 'site-a')
    expect(await screen.findByText('A pending')).toBeInTheDocument()
    expect(screen.queryByText('B pending')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/NeedsYou.test.tsx`. Expected: fails — current `NeedsYou` requires a `home` prop / renders `SiteCard`s, so the queries/props don't match.

- [ ] **Step 3: Minimal implementation** — replace the entire contents of `src/features/owner/NeedsYou.tsx`:
```tsx
// Col-1 of the activity-first OwnerHome: "Needs you" — ONLY the genuine pending
// owner decisions (kind approval / hold_payment) read straight from the
// decisions query (qk.decisions() → approvalsApi.list()). Each row carries the
// existing capability-gated Approve/Hold/Assign chips wired to useDecide's
// optimistic path. Honest empty: "Nothing needs a decision right now."
//
// This replaces the old brief/SiteCard-driven NeedsYou. Homeowner questions and
// site-health flags are NO LONGER decisions here — they live in the activity
// stream / Requests surface.
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { approvalsApi, type Decision } from '../../api/approvals'
import { qk } from '../../api/queryKeys'
import { useDecide, type DecideInput } from './useDecide'
import { DecisionLog } from './DecisionLog'
import { useCan } from '../../auth/useCan'
import { useT, type TFunction } from '../../i18n'
import { Body, Mono, Small, StatusPill, StatusDot, type Status } from '../../ui'
import { CheckIcon, PauseIcon, UserPlusIcon } from '../../ui/icons'
import { Spinner } from '../../components/states'
import type { TranslationKey } from '../../i18n'

const ACTION_LABEL: Record<'approve' | 'hold' | 'assign', TranslationKey> = {
  approve: 'action.approve',
  hold: 'action.hold',
  assign: 'action.assign',
}

/** The only decision kinds the owner actually decides here. */
function isOwnerDecision(d: Decision): boolean {
  return d.state === 'pending' && (d.kind === 'approval' || d.kind === 'hold_payment')
}

function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return t('activity.rel.just_now')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t('activity.rel.mins_ago', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('activity.rel.hrs_ago', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('activity.rel.days_ago', { n: days })
}

export function NeedsYou({
  date,
  selectedSiteId,
  siteNames,
}: {
  date: string
  selectedSiteId: string | null
  /** site_id → display name, so a card reads "Tower B" not a UUID. */
  siteNames: Record<string, string>
}) {
  const t = useT()
  const canApprove = useCan('approve_money')
  const { decide } = useDecide(date)
  const [toast, setToast] = useState<{ status: Status; msg: string } | null>(null)
  // Locally-hidden ids so an actioned card vanishes instantly (honest optimism);
  // the useDecide onSettled refetch reconciles server truth.
  const [actioned, setActioned] = useState<Set<string>>(() => new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.decisions(),
    queryFn: () => approvalsApi.list(),
  })

  const pending = useMemo(() => {
    const all = (data?.items ?? []).filter(isOwnerDecision).filter((d) => !actioned.has(d.id))
    return selectedSiteId ? all.filter((d) => d.site_id === selectedSiteId) : all
  }, [data?.items, selectedSiteId, actioned])

  function act(d: Decision, action: DecideInput['action']) {
    const siteName = (d.site_id && siteNames[d.site_id]) || ''
    const input: DecideInput = {
      siteId: d.site_id ?? '',
      siteName,
      riskKey: d.id,
      action,
      title: d.title,
      evidenceEventIds: d.evidence_event_ids,
    }
    decide(input, {
      onSuccess: () => {
        setActioned((prev) => new Set(prev).add(d.id))
        setToast({
          status: 'ok',
          msg: canApprove
            ? t('owner.home.action_done', { action: t(ACTION_LABEL[action]), site: siteName })
            : t('owner.needs.proposed', { site: siteName }),
        })
      },
      onError: () => setToast({ status: 'risk', msg: t('owner.home.action_failed') }),
    })
  }

  return (
    <section aria-labelledby="owner-needs-heading" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="owner-needs-heading" className="font-display text-h1 font-bold text-text">
          {t('owner.needs.title')}
        </h2>
        {pending.length > 0 ? (
          <StatusPill status="risk" label={t('owner.needs.count', { n: pending.length })} />
        ) : null}
      </header>

      {toast ? (
        <p role="status" aria-live="polite">
          <StatusPill status={toast.status} label={toast.msg} />
        </p>
      ) : null}

      {isLoading ? (
        <Spinner label={t('owner.home.loading')} />
      ) : isError ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="warn" label={t('owner.home.error')} />
        </section>
      ) : pending.length === 0 ? (
        <section className="rounded-sheet border border-line bg-card p-6 text-center shadow-card">
          <StatusPill status="ok" label={t('owner.needs.empty_clean')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((d) => {
            const site = d.site_id ? siteNames[d.site_id] : null
            return (
              <li
                key={d.id}
                className="rounded-card border border-line bg-card p-3 shadow-card"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    <StatusDot status={d.kind === 'hold_payment' ? 'warn' : 'risk'} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Body className="font-semibold text-text">{d.title}</Body>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-body text-micro text-text-mute">
                      {site ? <span className="truncate">{site}</span> : null}
                      <Mono className="text-micro text-text-mute">
                        {relativeTime(d.created_at, t)}
                      </Mono>
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <DecisionChips
                    canApprove={canApprove}
                    money={d.kind === 'approval'}
                    onApprove={() => act(d, 'approve')}
                    onHold={() => act(d, 'hold')}
                    onAssign={() => act(d, 'assign')}
                    onPropose={() => act(d, 'approve')}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DecisionLog siteNames={siteNames} />
    </section>
  )
}

/** Capability-gated chip cluster — owner acts, everyone else proposes. */
function DecisionChips({
  canApprove,
  money,
  onApprove,
  onHold,
  onAssign,
  onPropose,
}: {
  canApprove: boolean
  money: boolean
  onApprove: () => void
  onHold: () => void
  onAssign: () => void
  onPropose: () => void
}) {
  const t = useT()
  if (!canApprove) {
    return (
      <button
        type="button"
        onClick={onPropose}
        className="inline-flex min-h-tap items-center gap-1.5 rounded-pill border border-brand/50 bg-card px-3 font-body text-small font-semibold text-brand-text cstk-animate transition hover:bg-brand/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-card"
      >
        {t('owner.needs.propose')} <span aria-hidden>→</span>
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Chip
        onClick={onApprove}
        label={money ? t('owner.needs.approve_money') : t('action.approve')}
        cls="border-ok/40 text-ok hover:bg-ok/10 active:bg-ok/15"
        Icon={CheckIcon}
      />
      <Chip
        onClick={onHold}
        label={t('action.hold')}
        cls="border-warn/40 text-warn hover:bg-warn/10 active:bg-warn/15"
        Icon={PauseIcon}
      />
      <Chip
        onClick={onAssign}
        label={t('action.assign')}
        cls="border-info/40 text-info hover:bg-info/10 active:bg-info/15"
        Icon={UserPlusIcon}
      />
    </div>
  )
}

function Chip({
  onClick,
  label,
  cls,
  Icon,
}: {
  onClick: () => void
  label: string
  cls: string
  Icon: (p: { title?: string }) => ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-tap items-center gap-1.5 rounded-pill border bg-card px-3 font-body text-small font-semibold cstk-animate transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${cls}`}
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        <Icon title={label} />
      </span>
      {label}
    </button>
  )
}
```
> Notes to ground:
> - This DELETES the old exported `NeedsYou` signature `({ home, date, selectedSiteId })`. The only in-tree importer is `CommandCenter.tsx` (removed in C6) — confirm with `grep -rn "from './NeedsYou'\|from '../../features/owner/NeedsYou'" src` before rewriting; if any other importer exists it must be updated in the same commit.
> - `action.approve` / `action.hold` / `action.assign` / `owner.needs.*` / `owner.home.action_done|action_failed|loading|error` keys already exist (verified in `en.ts`). Only `owner.needs.empty_clean` is new (added in C2).
> - `useT`'s `TFunction` export: if not exported, alias `type TFunction = ReturnType<typeof useT>` at the top instead of importing it.

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/owner/NeedsYou.test.tsx`. Expected: `5 passed`. Then `npm run build` (will fail until C6 stops importing the old prop shape via `CommandCenter` — so run the build at the END of C6; here just run the vitest file).

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/owner/NeedsYou.tsx src/features/owner/NeedsYou.test.tsx && git commit -m "feat(web): cleaned NeedsYou — genuine pending owner decisions only"`

---

### Task C6: Rework `OwnerHome` — compose HonestHero + NeedsYou + ActivityStream + ProjectsStrip

**Files:**
- Rewrite `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/owner/OwnerHome.tsx`
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/pages/owner/OwnerHome.test.tsx`
- (Conditional) Create placeholder `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/ProjectsStrip.tsx` ONLY if slice D has not landed — see step 3.
- Delete `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/owner/CommandCenter.tsx` (and remove `Portfolio.tsx` / `ThisWeek.tsx` only if no other importer — verify by grep).

**Interfaces:**
- Consumes: `useQuery` (`@tanstack/react-query`); `activityApi`, `type ActivitySummary`, `type ActivityItem` (`../../api/activity`); `qk` (`../../api/queryKeys`); `todayIso` (`../../api/config`); `useT` (`../../i18n`); `HonestHero` (`../../features/owner/HonestHero`); `NeedsYou` (`../../features/owner/NeedsYou`); `ActivityStream` (`../../features/owner/ActivityStream`); `ProjectsStrip` (`../../features/owner/ProjectsStrip`, slice D — props `{ selectedSiteId, onSelectSite }`); `dashboardApi` (`../../api/dashboard`) for the cold-start `SetupChecklist` gate; `SetupChecklist` (`./SetupChecklist`); `AppShell`, `type SiteSummary`, `type Status` (`../../ui`); `api` (`../../api/client`) or the sites query for `siteNames`.
- Produces: `export function OwnerHome(): JSX.Element` (route `/owner` in `App.tsx`, unchanged).

**Composition (per spec §4.3):** HonestHero (from the activity summary) → NeedsYou (cleaned) → ActivityStream (primary) → ProjectsStrip. Cold-start still routes to `SetupChecklist` (unchanged gate off `dashboardApi.getHome`), but the checklist copy change (drop "Connect WhatsApp") is a DIFFERENT slice — do not touch `SetupChecklist` here.

**How the pieces get their data:**
- One `useQuery(qk.activity(selectedSiteId ?? undefined) …)`? No — `ActivityStream` owns its own infinite query. OwnerHome only needs the **summary** + newest timestamp for the hero. Fetch a single first page for the hero via `useQuery({ queryKey: ['activity','summary'], queryFn: () => activityApi.page({ limit: 1 }) })` — cheap, gives `summary` + `items[0].occurred_at`. (ActivityStream's own `useInfiniteQuery` on `qk.activity(undefined)` is a separate cache entry; that's fine — the summary query is tiny.)
- `siteNames` for NeedsYou/hero: reuse the existing sites listing. `api.listSites()` (`../../api/client`) → `{ items: Site[] }`; build `Record<id,name>`. This is already how other owner surfaces resolve names.
- `AppShell` `sites` prop wants `SiteSummary[]` — map from the sites list (id, name, status default 'ok' — pulse status is gone). The site switcher still drives `selectedSiteId`, which flows into NeedsYou + ActivityStream + ProjectsStrip.

- [ ] **Step 1: Write the failing test** — create `src/pages/owner/OwnerHome.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import { ThemeModeProvider } from '../../ui/ThemeModeProvider'
import type { ActivityPage } from '../../api/activity'

const activityPage = vi.fn()
vi.mock('../../api/activity', async () => {
  const actual = await vi.importActual<typeof import('../../api/activity')>('../../api/activity')
  return { ...actual, activityApi: { page: (...a: unknown[]) => activityPage(...a) } }
})
// Child feature panels are unit-tested elsewhere; stub to keep this a composition test.
vi.mock('../../features/owner/NeedsYou', () => ({ NeedsYou: () => <div data-testid="needs-you" /> }))
vi.mock('../../features/owner/ActivityStream', () => ({ ActivityStream: () => <div data-testid="activity-stream" /> }))
vi.mock('../../features/owner/ProjectsStrip', () => ({ ProjectsStrip: () => <div data-testid="projects-strip" /> }))
// Cold-start gate reads dashboardApi.getHome — return a non-cold-start home.
vi.mock('../../api/dashboard', async () => {
  const actual = await vi.importActual<typeof import('../../api/dashboard')>('../../api/dashboard')
  return { ...actual, dashboardApi: { getHome: vi.fn().mockResolvedValue({ cold_start: false, setup_checklist: [], sites: [], sites_total: 2, needs_attention_count: 0, brief_date: '2026-07-03', sites_needing_attention: 0 }) } }
})
// Sites list drives siteNames + AppShell switcher.
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return { ...actual, api: { ...actual.api, listSites: vi.fn().mockResolvedValue({ items: [{ id: 'site-a', name: 'Tower B', status: 'ok' }], next_cursor: null }) } }
})

const { OwnerHome } = await import('./OwnerHome')

function page(over: Partial<ActivityPage> = {}): ActivityPage {
  return { items: [{ id: 'update_posted:1', kind: 'update_posted', site_id: 'site-a', site_name: 'Tower B', title: 'Daily update', subtitle: null, occurred_at: '2026-07-03T07:00:00Z', actor: null, link: { type: 'update', id: 'site-a' }, severity: 'info' }], summary: { updates_today: 3, needs_decision_count: 1, sites_total: 2 }, next_cursor: null, ...over }
}

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role: 'owner' })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/owner']}>
        <ThemeModeProvider>
          <LanguageProvider defaultLanguage="en">
            <OwnerHome />
          </LanguageProvider>
        </ThemeModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('<OwnerHome> (activity-first)', () => {
  beforeEach(() => activityPage.mockReset())

  it('renders the HonestHero headline from the activity summary + all three panels', async () => {
    activityPage.mockResolvedValue(page())
    renderHome()
    expect(await screen.findByText(/3 updates today · 1 needs you/)).toBeInTheDocument()
    expect(screen.getByTestId('needs-you')).toBeInTheDocument()
    expect(screen.getByTestId('activity-stream')).toBeInTheDocument()
    expect(screen.getByTestId('projects-strip')).toBeInTheDocument()
  })

  it('does not render the removed CommandCenter columns (Portfolio / This Week)', async () => {
    activityPage.mockResolvedValue(page())
    renderHome()
    await screen.findByTestId('activity-stream')
    expect(screen.queryByText(/Sites at a glance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/This week/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/pages/owner/OwnerHome.test.tsx`. Expected: fails — current OwnerHome renders `CommandCenter` (no `activity-stream`/`projects-strip` testids; imports `ProjectsStrip` will error if the module is absent).

- [ ] **Step 3: Minimal implementation** —
  (a) If `src/features/owner/ProjectsStrip.tsx` does NOT yet exist (slice D not landed), create a thin placeholder so this slice builds independently:
```tsx
// PLACEHOLDER for slice D's real ProjectsStrip. Fixed prop contract so OwnerHome
// wiring is stable; slice D replaces this file's body with real project cards +
// the "+ New project" modal. Do NOT extend this — it is intentionally minimal.
export function ProjectsStrip(_props: {
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
}) {
  return null
}
```
  (b) Rewrite `src/pages/owner/OwnerHome.tsx`:
```tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import { qk } from '../../api/queryKeys'
import { dashboardApi } from '../../api/dashboard'
import { activityApi } from '../../api/activity'
import { api } from '../../api/client'
import { useT } from '../../i18n'
import { ErrorState, Spinner } from '../../components/states'
import { SetupChecklist } from './SetupChecklist'
import { HonestHero } from '../../features/owner/HonestHero'
import { NeedsYou } from '../../features/owner/NeedsYou'
import { ActivityStream } from '../../features/owner/ActivityStream'
import { ProjectsStrip } from '../../features/owner/ProjectsStrip'
import { AppShell, type SiteSummary, type Status } from '../../ui'

/**
 * OwnerHome (activity-first) — the owner lands on a running feed of what changed,
 * not a 3-column brief. Composition, top-to-bottom priority:
 *   HonestHero (summary-driven headline) · NeedsYou (genuine pending decisions) ·
 *   ActivityStream (the primary union feed) · ProjectsStrip (project cards).
 * A cold start (no sites / zero activity) still routes to the SetupChecklist.
 * This page stays thin: it owns the hero-summary query, the site selection the
 * panels share, and the AppShell chrome; each panel owns its own data.
 */
export function OwnerHome() {
  const t = useT()
  const date = todayIso()
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)

  // Cold-start gate (unchanged source: the dashboard home aggregation).
  const home = useQuery({ queryKey: qk.home(date), queryFn: () => dashboardApi.getHome(date) })

  // Hero summary — a single tiny activity page gives the counts + newest ts.
  const summaryQ = useQuery({
    queryKey: ['activity', 'summary'],
    queryFn: () => activityApi.page({ limit: 1 }),
  })

  // Sites → names for NeedsYou + the AppShell switcher.
  const sitesQ = useQuery({ queryKey: qk.sites(), queryFn: () => api.listSites() })
  const siteNames = useMemo(
    () => Object.fromEntries((sitesQ.data?.items ?? []).map((s) => [s.id, s.name])),
    [sitesQ.data?.items],
  )
  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      (sitesQ.data?.items ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        status: (('status' in s ? (s as { status?: string }).status : undefined) as Status) ?? 'ok',
      })),
    [sitesQ.data?.items],
  )

  const lastActivityAt = summaryQ.data?.items[0]?.occurred_at ?? null

  return (
    <AppShell
      role="owner"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      roleBadge={{ name: 'Owner', initials: 'OW' }}
    >
      <HonestHero summary={summaryQ.data?.summary} lastActivityAt={lastActivityAt} date={date} />

      <div className="mt-6">
        {home.isLoading ? (
          <Spinner label={t('owner.home.loading')} />
        ) : home.isError ? (
          <ErrorState
            message={(home.error as Error)?.message ?? t('owner.home.error')}
            onRetry={() => home.refetch()}
          />
        ) : home.data?.cold_start ? (
          <SetupChecklist steps={home.data.setup_checklist} />
        ) : (
          <div className="flex flex-col gap-8">
            <NeedsYou date={date} selectedSiteId={selectedSiteId} siteNames={siteNames} />
            <ActivityStream selectedSiteId={selectedSiteId} />
            <ProjectsStrip selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId} />
          </div>
        )}
      </div>
    </AppShell>
  )
}
```
  (c) Delete the dead `CommandCenter.tsx` and remove `Portfolio.tsx` / `ThisWeek.tsx` **only if** `grep -rn "Portfolio\|ThisWeek\|CommandCenter" src --include=*.tsx | grep -v ".test."` shows no other importer. Delete their `.test.tsx` siblings alongside. If any are still referenced, leave them and note it.

> Notes to ground:
> - Confirm `api.listSites()` return type is `Paginated<Site>` with `Site.id`/`Site.name` (verified in `client.ts` + `types.ts`). `Site` may not have a `status` field — the mapping above defensively reads it optionally and defaults `'ok'`. Verify `Site` shape with `grep -n "interface Site" src/api/types.ts`.
> - `AppShell` `roleBadge`/`sites`/`selectedSiteId`/`onSelectSite` props are unchanged from the current OwnerHome — reuse verbatim.
> - Removed the old `renderHeadline` + `neev`/`Display`/`Mono`/`Small`/`formatDate` header block — that lives in `HonestHero` now.

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/pages/owner/OwnerHome.test.tsx && npm run build`. Expected: `2 passed`, and a clean `tsc -b` (this is the slice's integration gate — the whole web app must type-check with the old `CommandCenter`/`Portfolio`/`ThisWeek` removed and the new `NeedsYou` signature in place). Also run the full owner test set: `npx vitest run src/features/owner src/pages/owner src/api/activity.test.ts src/i18n/activityKeys.test.ts` → all green.

- [ ] **Step 5: Commit** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add -A src/pages/owner/OwnerHome.tsx src/pages/owner/OwnerHome.test.tsx src/features/owner/ProjectsStrip.tsx && git rm src/features/owner/CommandCenter.tsx src/features/owner/CommandCenter.test.tsx 2>/dev/null; git commit -m "feat(web): activity-first OwnerHome — HonestHero + NeedsYou + ActivityStream + ProjectsStrip; drop CommandCenter"`

---

## Cross-slice notes / handoffs

- **Slice D owns the real `ProjectsStrip`** at `src/features/owner/ProjectsStrip.tsx` with the exact contract `ProjectsStrip({ selectedSiteId: string | null; onSelectSite: (id: string | null) => void })`. If D lands first, C6 imports it directly and skips the placeholder; if C lands first, D replaces the placeholder body (import path + props already correct). The placeholder returns `null` so it renders nothing and never blocks C's tests/build.
- **Slice A/B own the backend** `GET /api/v1/activity`. This slice's `activityApi.page()` real branch already targets the shared contract (`site_id`/`cursor`/`limit` query params → `{ items, summary, next_cursor }`). No coordination needed beyond the JSON shape (matched here field-for-field).
- **`linkFor` retargeting** is centralized in `ActivityStream.tsx` with `// TODO(nav)` markers. The nav-verification slice (spec §4.5) that adds a real `/requests` route and any `/feed/photo` / `/decision/:id` routes should update `linkFor` there — no call sites change.
- **Do NOT touch `SetupChecklist` copy** here (drop-WhatsApp-step is a separate slice); C6 only keeps the existing cold-start gate.
# Slice E — Frontend Requests view + route + nav audit + setup checklist + honest empty states

Task PREFIX = **E**. All web tasks. Verify commands:
- Build (CI/Vercel path, tsc -b): `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run build`
- Unit test: `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run <path>`

## Grounding facts (verified against the real source)

- Backend endpoint is `GET /api/v1/homeowner/requests` (router prefix `/api/v1/homeowner`, route `@router.get("/requests")` at `app/homeowner/router.py:2279`). It returns a **bare `list[RequestOut]`** (NOT paginated), newest-first (`.order_by(HomeownerRequest.created_at.desc())`), scoped to the caller's resolved site, optional `?site_id=` query.
- `RequestOut` (`app/homeowner/schemas.py:469`): `{ id: UUID, site_id: UUID, raised_by: UUID|None, title: str, detail: str|None, status: HomeownerRequestStatus, sla_due_at: datetime|None, created_at, updated_at, voice_url: str|None }`.
- `HomeownerRequestStatus` (`app/models/homeowner_member.py:37`) StrEnum: `sent | seen | in_progress | done`.
- The api-client house style (self-contained, own `request<T>` helper, `USE_MOCKS` mock branch, import `ApiError` from `./client`, `API_BASE`/`USE_MOCKS` from `./config`, `getToken` from `./auth`) is `src/api/approvals.ts` — copy it verbatim.
- Query-key factory `qk` lives in `src/api/queryKeys.ts`; add `requests` there.
- Owner nav is defined in **two** places: the desktop Neev sidebar zones in `src/ui/navModel.ts` (`SHARED` array) and the phone/Blueprint bar `ROLE_TABS.owner` in `src/ui/AppShell.tsx:61-71`. Both must gain "Requests".
- `NeevSidebar` (`src/ui/NeevSidebar.tsx:19`) maps `NavIconName → ReactNode` in `NAV_ICONS`; `NavIconName` union is in `navModel.ts:7-10`.
- `EmptyState({ title, hint, action })` is in `src/components/states.tsx:48`.
- `SetupChecklist` (`src/pages/owner/SetupChecklist.tsx`) renders `SetupStep[]` (`{ key, done, title_key }`, `src/api/dashboard.ts:62`). The backend produces the steps in `app/dashboard/aggregate.py:328-344` with keys `add_site | connect_whatsapp | set_baseline`. **Removing `connect_whatsapp` and adding `add_project/invite_team/start_chat` is a BACKEND change** (aggregate.py) plus i18n keys; the frontend component needs no structural change but the i18n keys must exist.
- ChatPage (`src/features/chat/ChatPage.tsx`) selects a thread via **internal `useState`**, NOT a URL param. There is no deep-link-to-site-thread mechanism today. The honest Reply action therefore navigates to `/chat` (the inbox) — we do NOT fabricate a thread-preselect that doesn't exist. (A follow-up could add a `?site=` param to ChatPage; out of scope here.)
- `TranslationKey = keyof typeof en` (`src/i18n/en.ts` tail). Every new key MUST be added to BOTH `en.ts` and `hi.ts` or `tsc -b` fails (hi.ts is typed `Partial<Record<TranslationKey,string>>` so hi is not strictly required to compile, but the repo convention + i18n.test.tsx parity check requires it — add to both).

---

### Task E1: `api/requests.ts` client + `qk.requests` key

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/requests.ts`
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/queryKeys.ts` (add one line inside the `qk` object, after line 35 `approvals:`)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/api/requests.test.ts`

**Interfaces:**
Consumes: backend `GET /api/v1/homeowner/requests` → `RequestOut[]`; `ApiError` (`./client`), `API_BASE`/`USE_MOCKS` (`./config`), `getToken` (`./auth`).
Produces: `type HomeownerRequestStatus = 'sent'|'seen'|'in_progress'|'done'`; `interface RequestOut { id; site_id; raised_by; title; detail; status; sla_due_at; created_at; updated_at; voice_url }`; `requestsApi.list(siteId?: string): Promise<RequestOut[]>`; `qk.requests(siteId?: string)`.

- [ ] **Step 1: Write the failing test** — `src/api/requests.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsApi } from './requests'

const sample = [
  {
    id: 'req-1', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Leak under the kitchen sink', detail: 'Water pooling since Tuesday',
    status: 'sent', sla_due_at: '2026-07-06T00:00:00Z',
    created_at: '2026-07-03T09:00:00Z', updated_at: '2026-07-03T09:00:00Z',
    voice_url: null,
  },
]

afterEach(() => vi.restoreAllMocks())

describe('requestsApi.list', () => {
  it('GETs /api/v1/homeowner/requests and returns the RequestOut[] as-is', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sample), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const out = await requestsApi.list()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/homeowner/requests')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Leak under the kitchen sink')
    expect(out[0].status).toBe('sent')
  })

  it('passes ?site_id= when a site is given', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await requestsApi.list('site-9')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('site_id=site-9')
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/requests.test.ts`
  Expected: FAIL — `Failed to resolve import "./requests"` (module does not exist yet).

- [ ] **Step 3: Minimal implementation** — create `src/api/requests.ts` (mirrors `approvals.ts` house style exactly):
```ts
// Homeowner-requests API layer (owner-side read).
//
// Self-contained (mirrors api/approvals.ts): imports only ApiError / API_BASE /
// USE_MOCKS / getToken and declares its own request helper + types. Mirrors the
// backend JSON under GET /api/v1/homeowner/requests (list[RequestOut], newest-first).
import { ApiError } from './client'
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'

// ---- types (mirror backend RequestOut / HomeownerRequestStatus) -----------

export type HomeownerRequestStatus = 'sent' | 'seen' | 'in_progress' | 'done'

export interface RequestOut {
  id: string
  site_id: string
  raised_by: string | null
  title: string
  detail: string | null
  status: HomeownerRequestStatus
  sla_due_at: string | null
  created_at: string
  updated_at: string
  voice_url: string | null
}

// ---- request helper (identical shape to approvals.ts) ---------------------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev) -------------------------------------

const mockRequests: RequestOut[] = [
  {
    id: 'req-1', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Leak under the kitchen sink', detail: 'Water pooling since Tuesday.',
    status: 'sent', sla_due_at: '2026-07-01T00:00:00Z',
    created_at: '2026-06-29T09:00:00Z', updated_at: '2026-06-29T09:00:00Z',
    voice_url: null,
  },
  {
    id: 'req-2', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Please send a photo of the master bedroom', detail: null,
    status: 'in_progress', sla_due_at: null,
    created_at: '2026-07-02T11:20:00Z', updated_at: '2026-07-02T14:00:00Z',
    voice_url: null,
  },
  {
    id: 'req-3', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Confirm the tile colour for the guest bath', detail: 'Went with the sand beige.',
    status: 'done', sla_due_at: null,
    created_at: '2026-06-20T08:00:00Z', updated_at: '2026-06-24T08:00:00Z',
    voice_url: null,
  },
]

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

// ---- public surface -------------------------------------------------------

export const requestsApi = {
  /** List a site's homeowner requests, newest-first (bare array — not paginated). */
  async list(siteId?: string): Promise<RequestOut[]> {
    if (USE_MOCKS) {
      await delay()
      return mockRequests.map((r) => ({ ...r }))
    }
    const q = siteId ? `?site_id=${encodeURIComponent(siteId)}` : ''
    return request<RequestOut[]>(`/api/v1/homeowner/requests${q}`)
  },
}
```
  Then add to `qk` in `queryKeys.ts` immediately after line 35 (`approvals: (tab?: string) => ['approvals', tab] as const,`):
```ts
  /** Homeowner requests for the owner Requests view (keyed by optional site). */
  requests: (siteId?: string) => (siteId ? (['requests', siteId] as const) : (['requests'] as const)),
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/api/requests.test.ts && npm run build`
  Expected: 2 passed; build (tsc -b) exits 0.

- [ ] **Step 5: Commit**
```
git add src/api/requests.ts src/api/requests.test.ts src/api/queryKeys.ts
git commit -m "feat(web): add requestsApi.list client + qk.requests key

Owner-side read of GET /api/v1/homeowner/requests (bare RequestOut[]).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E2: i18n keys for Requests view, nav, setup steps, and empty states

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/en.ts` (add keys before the closing `} as const`)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/i18n/hi.ts` (mirror the same keys)
- Test: covered by the existing `src/i18n/i18n.test.tsx` parity check + `tsc -b`.

**Interfaces:**
Produces (all become valid `TranslationKey`s used by E3/E4/E5): `nav.requests`; `requests.title`, `requests.group.overdue`, `requests.group.open`, `requests.group.resolved`, `requests.reply`, `requests.status.sent`, `requests.status.seen`, `requests.status.in_progress`, `requests.status.done`, `requests.overdue_since`, `requests.raised`; `requests.empty.title`, `requests.empty.hint`, `requests.error`; `owner.setup.add_project`, `owner.setup.invite_team`, `owner.setup.start_chat`; `activity.empty.title`, `activity.empty.hint`, `owner.projects.empty.title`, `owner.projects.empty.hint`, `owner.needsyou.empty.title`, `owner.needsyou.empty.hint`.

- [ ] **Step 1: Write the failing test** — no new test file; extend nothing. The failing signal is `tsc -b` once E3/E4/E5 reference these keys. To make E2 independently verifiable, add a temporary assertion to the existing i18n test is NOT needed — instead verify via build after adding. (This task's "test" is the parity test `src/i18n/i18n.test.tsx` which asserts en/hi key sets match.)
  Run first to establish current green: `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/i18n.test.tsx` → Expected: PASS (baseline).

- [ ] **Step 2: Add the keys to `en.ts`** — insert into the `nav.*` block (after `'nav.chat': 'Chat',` at line 36):
```ts
  'nav.requests': 'Requests',
```
  Then, near the `owner.setup.*` block (after line 325 `'owner.setup.set_baseline'`), replace the WhatsApp step key with the three new steps and add the empty-state + requests keys. Add this block just before the final `} as const`:
```ts
  // Owner setup checklist (activity-first cold start) — replaces connect_whatsapp.
  'owner.setup.add_project': 'Add your first project',
  'owner.setup.invite_team': 'Invite your site team',
  'owner.setup.start_chat': 'Start the site chat',

  // Requests view (homeowner requests, owner-side).
  'requests.title': 'Requests',
  'requests.group.overdue': 'Overdue',
  'requests.group.open': 'Open',
  'requests.group.resolved': 'Resolved',
  'requests.reply': 'Reply in chat',
  'requests.status.sent': 'New',
  'requests.status.seen': 'Seen',
  'requests.status.in_progress': 'In progress',
  'requests.status.done': 'Resolved',
  'requests.overdue_since': 'Due {when}',
  'requests.raised': 'Raised {when}',
  'requests.error': 'Could not load requests.',

  // Honest empty-state invitations (CDS voice: name the next real action).
  'requests.empty.title': 'No requests yet',
  'requests.empty.hint': 'When a homeowner asks for a photo or flags something, it lands here. Nothing needs you right now.',
  'activity.empty.title': 'Nothing has happened yet',
  'activity.empty.hint': 'Share a site photo or post an update and it will show up here for your homeowners.',
  'owner.projects.empty.title': 'No projects yet',
  'owner.projects.empty.hint': 'Add your first project to start tracking progress and sharing it.',
  'owner.needsyou.empty.title': "You're all caught up",
  'owner.needsyou.empty.hint': 'Approvals and homeowner requests that need a decision will appear here.',
```
  (Note: `'owner.setup.connect_whatsapp'` stays defined in en.ts — it is harmless to leave the string, but E4 stops the backend from ever emitting it. Do NOT delete the key or `tsc` on any stale reference would break; grep shows the only reference is the removed backend step.)

- [ ] **Step 3: Mirror in `hi.ts`** — add the identical keys with Hindi values (English-first is the default per project memory; Hindi is secondary but the parity test requires the keys present). Example values:
```ts
  'nav.requests': 'अनुरोध',
  'owner.setup.add_project': 'अपना पहला प्रोजेक्ट जोड़ें',
  'owner.setup.invite_team': 'अपनी साइट टीम को जोड़ें',
  'owner.setup.start_chat': 'साइट चैट शुरू करें',
  'requests.title': 'अनुरोध',
  'requests.group.overdue': 'समय बीत गया',
  'requests.group.open': 'खुले',
  'requests.group.resolved': 'हल हो गए',
  'requests.reply': 'चैट में जवाब दें',
  'requests.status.sent': 'नया',
  'requests.status.seen': 'देखा गया',
  'requests.status.in_progress': 'चल रहा है',
  'requests.status.done': 'हल हो गया',
  'requests.overdue_since': 'नियत {when}',
  'requests.raised': 'दर्ज {when}',
  'requests.error': 'अनुरोध लोड नहीं हो सके।',
  'requests.empty.title': 'अभी कोई अनुरोध नहीं',
  'requests.empty.hint': 'जब कोई गृहस्वामी फोटो मांगे या कुछ बताए, वह यहाँ आएगा। अभी आपके लिए कुछ नहीं है।',
  'activity.empty.title': 'अभी कुछ नहीं हुआ',
  'activity.empty.hint': 'साइट की फोटो साझा करें या अपडेट डालें, वह यहाँ आपके गृहस्वामियों के लिए दिखेगा।',
  'owner.projects.empty.title': 'अभी कोई प्रोजेक्ट नहीं',
  'owner.projects.empty.hint': 'प्रगति ट्रैक करने और साझा करने के लिए अपना पहला प्रोजेक्ट जोड़ें।',
  'owner.needsyou.empty.title': 'सब कुछ पूरा है',
  'owner.needsyou.empty.hint': 'जिन अनुमोदन और अनुरोधों पर निर्णय चाहिए, वे यहाँ दिखेंगे।',
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/i18n.test.tsx && npm run build`
  Expected: parity test PASS (en/hi key sets match), tsc -b exits 0.

- [ ] **Step 5: Commit**
```
git add src/i18n/en.ts src/i18n/hi.ts
git commit -m "i18n(web): add Requests view, nav, activity-first setup + empty-state keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E3: `RequestsView` component + `/requests` route

**Files:**
- Create `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/requests/RequestsView.tsx`
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/App.tsx` (add lazy import near line 69 + `<Route>` near line 170)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/features/requests/RequestsView.test.tsx`

**Interfaces:**
Consumes: `requestsApi.list` + `RequestOut`/`HomeownerRequestStatus` (E1), `qk.requests` (E1); i18n keys (E2); `EmptyState`/`ErrorState`/`Spinner` (`src/components/states.tsx`); `AppShell` (`src/ui/AppShell.tsx`); `useNavigate` (react-router-dom); `useT` (`src/i18n`).
Produces: `export function RequestsView()`; route `/requests`.

Grouping rule (grounded in the real status enum + `sla_due_at`):
- **overdue** = status ∈ {`sent`,`seen`,`in_progress`} AND `sla_due_at` non-null AND `sla_due_at < now`.
- **open** = status ∈ {`sent`,`seen`,`in_progress`} AND NOT overdue.
- **resolved** = status === `done`.
Four states: loading (`<Spinner/>`), error (`<ErrorState/>`), empty (`<EmptyState/>` with the honest copy), data (the three groups; a group is omitted if empty). The Reply action calls `navigate('/chat')` (the honest inbox deep-link — ChatPage has no site-thread URL param today; see grounding note).

- [ ] **Step 1: Write the failing test** — `src/features/requests/RequestsView.test.tsx`:
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { RequestOut } from '../../api/requests'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const listMock = vi.fn<[], Promise<RequestOut[]>>()
vi.mock('../../api/requests', () => ({
  requestsApi: { list: (...a: unknown[]) => listMock(...(a as [])) },
}))

// AppShell pulls in heavy chrome; stub to a passthrough for a focused unit test.
vi.mock('../../ui/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { RequestsView } from './RequestsView'

const NOW = new Date('2026-07-03T12:00:00Z')
function req(p: Partial<RequestOut>): RequestOut {
  return {
    id: 'r', site_id: 's', raised_by: 'ho', title: 't', detail: null,
    status: 'sent', sla_due_at: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    voice_url: null, ...p,
  }
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><RequestsView /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers().setSystemTime(NOW)
})

describe('RequestsView', () => {
  it('shows the empty invitation when there are no requests', async () => {
    listMock.mockResolvedValue([])
    renderView()
    expect(await screen.findByText('No requests yet')).toBeInTheDocument()
  })

  it('groups overdue / open / resolved and only Reply on non-resolved', async () => {
    listMock.mockResolvedValue([
      req({ id: 'a', title: 'Overdue one', status: 'sent', sla_due_at: '2026-07-01T00:00:00Z' }),
      req({ id: 'b', title: 'Open one', status: 'in_progress', sla_due_at: null }),
      req({ id: 'c', title: 'Resolved one', status: 'done' }),
    ])
    renderView()
    expect(await screen.findByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Overdue one')).toBeInTheDocument()
    // Reply appears for overdue + open (2), not for the resolved row.
    expect(screen.getAllByRole('button', { name: 'Reply in chat' })).toHaveLength(2)
  })

  it('Reply navigates to /chat', async () => {
    listMock.mockResolvedValue([req({ id: 'a', title: 'Open one', status: 'sent' })])
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Reply in chat' }))
    expect(navigate).toHaveBeenCalledWith('/chat')
  })

  it('shows the error state when the list call rejects', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    renderView()
    await waitFor(() => expect(screen.getByText('Could not load requests.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/requests/RequestsView.test.tsx`
  Expected: FAIL — `Failed to resolve import "./RequestsView"`.

- [ ] **Step 3: Minimal implementation** — create `src/features/requests/RequestsView.tsx`:
```tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../ui/AppShell'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { useT, type TranslationKey } from '../../i18n'
import { qk } from '../../api/queryKeys'
import { requestsApi, type RequestOut } from '../../api/requests'
import { Body, H1, H2, Small, StatusPill } from '../../ui'

const OPEN_STATUSES: RequestOut['status'][] = ['sent', 'seen', 'in_progress']

const STATUS_LABEL_KEY: Record<RequestOut['status'], TranslationKey> = {
  sent: 'requests.status.sent',
  seen: 'requests.status.seen',
  in_progress: 'requests.status.in_progress',
  done: 'requests.status.done',
}

const STATUS_PILL: Record<RequestOut['status'], 'info' | 'ok' | 'warn'> = {
  sent: 'info', seen: 'info', in_progress: 'warn', done: 'ok',
}

interface Grouped {
  overdue: RequestOut[]
  open: RequestOut[]
  resolved: RequestOut[]
}

function groupRequests(rows: RequestOut[], now: number): Grouped {
  const g: Grouped = { overdue: [], open: [], resolved: [] }
  for (const r of rows) {
    if (r.status === 'done') {
      g.resolved.push(r)
    } else if (r.sla_due_at && new Date(r.sla_due_at).getTime() < now) {
      g.overdue.push(r)
    } else {
      g.open.push(r)
    }
  }
  return g
}

function RequestRow({
  r, onReply, t,
}: {
  r: RequestOut
  onReply: (() => void) | null
  t: ReturnType<typeof useT>
}) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-paper px-3 py-3">
      <div className="min-w-0 flex-1">
        <Body as="span" className="block font-semibold !text-text">{r.title}</Body>
        {r.detail ? <Small className="mt-0.5 block">{r.detail}</Small> : null}
        <Small className="mt-1 block !text-text-mute">
          {r.sla_due_at
            ? t('requests.overdue_since', { when: new Date(r.sla_due_at).toLocaleDateString() })
            : t('requests.raised', { when: new Date(r.created_at).toLocaleDateString() })}
        </Small>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusPill status={STATUS_PILL[r.status]} size="sm" label={t(STATUS_LABEL_KEY[r.status])} />
        {onReply ? (
          <button
            type="button"
            onClick={onReply}
            className="inline-flex min-h-tap items-center rounded-control border border-line bg-card px-3 font-body text-small font-semibold text-text cstk-animate hover:bg-surface-hover"
          >
            {t('requests.reply')}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Group({
  titleKey, rows, replyable, onReply, t,
}: {
  titleKey: TranslationKey
  rows: RequestOut[]
  replyable: boolean
  onReply: () => void
  t: ReturnType<typeof useT>
}) {
  if (rows.length === 0) return null
  return (
    <section className="mt-6 first:mt-0">
      <H2>{t(titleKey)}</H2>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <RequestRow key={r.id} r={r} t={t} onReply={replyable ? onReply : null} />
        ))}
      </ul>
    </section>
  )
}

/**
 * RequestsView — the owner's "what did homeowners ask for" surface. Lists real
 * homeowner_requests grouped overdue / open / resolved; each open row offers a
 * Reply that drops the owner into the site chat inbox. Four honest states.
 */
export function RequestsView() {
  const t = useT()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: qk.requests(), queryFn: () => requestsApi.list() })

  const grouped = useMemo(
    () => (query.data ? groupRequests(query.data, Date.now()) : null),
    [query.data],
  )

  const openReply = () => navigate('/chat')

  let body: React.ReactNode
  if (query.isPending) {
    body = <Spinner />
  } else if (query.isError) {
    body = <ErrorState message={t('requests.error')} onRetry={() => query.refetch()} />
  } else if (!grouped || (query.data && query.data.length === 0)) {
    body = <EmptyState title={t('requests.empty.title')} hint={t('requests.empty.hint')} />
  } else {
    body = (
      <>
        <Group titleKey="requests.group.overdue" rows={grouped.overdue} replyable onReply={openReply} t={t} />
        <Group titleKey="requests.group.open" rows={grouped.open} replyable onReply={openReply} t={t} />
        <Group titleKey="requests.group.resolved" rows={grouped.resolved} replyable={false} onReply={openReply} t={t} />
      </>
    )
  }

  return (
    <AppShell role="owner">
      <H1 className="mb-4">{t('requests.title')}</H1>
      {body}
    </AppShell>
  )
}
```
  **Grounding check before writing:** confirm `Body, H1, H2, Small, StatusPill` are exported from `src/ui/index.ts` (SetupChecklist imports `Body, H2, Small, StatusPill` from `../../ui`; `H1` must be present — verify with `grep -n "H1" src/ui/index.ts`; if `H1` is not exported, use `H2` for the page title and drop the `H1` import). `StatusPill` accepts `status: 'ok'|'info'|'warn'|...` + `size` + `label` (confirmed from SetupChecklist usage line 42-46). `useT` supports interpolation vars (`TFunction = (key, vars?) => string`, confirmed `src/i18n/index.tsx:44`).
  Then wire the route. In `App.tsx` add the lazy import after line 69 (the ChatPage lazy block):
```tsx
// === requests (Slice E) === lazy: keeps the Requests surface out of the entry chunk
const RequestsView = lazy(() =>
  import('./features/requests/RequestsView').then((m) => ({ default: m.RequestsView })),
)
```
  and add the route after the `/chat` route (line 170):
```tsx
      {/* Homeowner requests (owner-side). */}
      <Route path="/requests" element={<Guarded><RequestsView /></Guarded>} />
```

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/requests/RequestsView.test.tsx && npm run build`
  Expected: 4 passed; tsc -b exits 0.

- [ ] **Step 5: Commit**
```
git add src/features/requests/RequestsView.tsx src/features/requests/RequestsView.test.tsx src/App.tsx
git commit -m "feat(web): RequestsView + /requests route (overdue/open/resolved, Reply→chat)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E4: Nav audit — add Requests, sentence-case relabel, verify every owner entry routes to a live screen

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/navModel.ts` (add `REQUESTS` NavItem + `'inbox'` to `NavIconName`; insert into owner PRIMARY)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/NeevSidebar.tsx` (map `inbox` → an icon)
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/AppShell.tsx` (add Requests to `ROLE_TABS.owner`, lines 61-71; relabel any `label` that isn't sentence case)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/web/src/ui/navModel.test.ts`

**Interfaces:**
Consumes: `qk`/route from E3 (`/requests`); `'nav.requests'` (E2); `BellIcon` (`src/ui/icons`).
Produces: owner nav (both desktop zones + phone bar) contains a Requests entry pointing at `/requests`.

**Verified owner nav map (audit result).** Every current owner destination routes to a real `<Route>` in `App.tsx` (verified line refs). The desktop Neev sidebar is `navModel.ts` (owner PRIMARY = Dashboard+Approvals; SHARED = Sites/Chat/Drawings/Permits/Reports/Search; ADMIN = Admin+Settings). The phone/Blueprint bar is `ROLE_TABS.owner`. Note the two lists diverge today (the phone bar still lists `Spec desk` → `/spec-desk`, which redirects to `/designer?tab=selections`; Reconcile/Finance are intentionally hidden from the owner per the navModel comment lines 33-39).

| Label (current) | Route | Live screen (App.tsx) | Relabel (sentence case) | Action |
|---|---|---|---|---|
| Brief | `/` (RoleLanding→`/owner`) | `RoleLanding` L118 / `OwnerHome` L121 | **Latest** | keep, relabel `nav.brief` → "Latest" (Slice A owns OwnerHome; here only the label string) |
| Approvals | `/approvals` | `ApprovalInbox` L140 | Approvals | keep |
| Sites | `/sites` | `Sites` L154 | **Projects** | relabel `nav.sites` → "Projects" (per shared NewProject contract) |
| Chat | `/chat` | `ChatPage` L170 | Chat | keep |
| Spec desk | `/spec-desk` | redirect→`/designer` L137 | Spec desk | keep (owner phone bar only) |
| Drawings | `/settings/documents` | `DocumentsPage` L167 | Drawings | keep |
| Permits | `/permits` | `Permits` L149-151 | Permits | keep (SHARED, cap-gated) |
| Reports | `/reports` | `ReportsPage` L164 | Reports | keep (SHARED, cap-gated) |
| Search | `/search` | `Search` L146 | Search | keep |
| Admin | `/settings/admin` | `AdminConsole` L111 | Admin | keep |
| Settings | `/settings` | `Settings` L109 | Settings | keep |
| **(new) Requests** | `/requests` | `RequestsView` (E3) | **Requests** | **ADD** |

Relabels touch only i18n **values**, not keys. `nav.brief` → "Latest" and `nav.sites` → "Projects" would change those strings **for every role** that reuses them (pm reuses `nav.brief` as "Today" via its own key `nav.today`, and reuses `nav.sites`). To avoid collateral relabels, introduce owner-specific keys rather than mutating shared ones: add `nav.latest` and `nav.projects`, and point the owner nav rows at those keys. (pm keeps `nav.sites`; only owner's Sites row becomes Projects.)

- [ ] **Step 1: Write the failing test** — `src/ui/navModel.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { navForRole } from './navModel'

describe('navForRole(owner) — Requests entry', () => {
  it('includes a Requests item pointing at /requests', () => {
    const zones = navForRole('owner')
    const all = [...zones.primary, ...zones.shared, ...zones.admin]
    const requests = all.find((i) => i.to === '/requests')
    expect(requests).toBeDefined()
    expect(requests?.labelKey).toBe('nav.requests')
    expect(requests?.iconName).toBe('inbox')
  })

  it('owner Sites row uses the Projects label key', () => {
    const sites = navForRole('owner').shared.find((i) => i.to === '/sites')
    // owner sees "Projects"; supervisor still sees "My Sites"
    expect(sites?.labelKeyByRole?.owner).toBe('nav.projects')
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/ui/navModel.test.ts`
  Expected: FAIL — no `/requests` item (`requests` is `undefined`); `labelKeyByRole?.owner` undefined.

- [ ] **Step 3: Minimal implementation.**
  In `navModel.ts`: extend the `NavIconName` union (line 7-10) to add `'inbox'`:
```ts
export type NavIconName =
  | 'grid' | 'check' | 'scale' | 'cash' | 'compass' | 'camera'
  | 'building' | 'message' | 'doc' | 'shield' | 'chart' | 'search'
  | 'users' | 'settings' | 'inbox'
```
  Add the `REQUESTS` destination near `APPROVALS` (after line 32):
```ts
const REQUESTS: NavItem = { to: '/requests', labelKey: 'nav.requests', iconName: 'inbox' }
```
  Put owner Requests in PRIMARY (owner cockpit) — change line 59:
```ts
  owner: [DASHBOARD, APPROVALS, REQUESTS],
```
  Relabel owner's Dashboard + Sites via owner-scoped keys. Change `DASHBOARD` (line 31) and `SITES` (line 43-46):
```ts
const DASHBOARD: NavItem = { to: '/owner', labelKey: 'nav.brief', labelKeyByRole: { owner: 'nav.latest' }, iconName: 'grid', end: true }
```
```ts
const SITES: NavItem = {
  to: '/sites', labelKey: 'nav.sites',
  labelKeyByRole: { owner: 'nav.projects', supervisor: 'nav.my_sites' }, iconName: 'building',
}
```
  In `NeevSidebar.tsx`, import `BellIcon` and map `inbox` (edit the icon import block line 6-10 and `NAV_ICONS` line 19-24):
```ts
import {
  GridIcon, CheckIcon, ScaleIcon, CashIcon, CompassIcon, CameraIcon,
  BuildingIcon, MessageIcon, DocIcon, ShieldIcon, ChartBarIcon, SearchIcon,
  UsersIcon, SettingsIcon, BellIcon,
} from './icons'
```
```ts
const NAV_ICONS: Record<NavIconName, ReactNode> = {
  grid: <GridIcon />, check: <CheckIcon />, scale: <ScaleIcon />, cash: <CashIcon />,
  compass: <CompassIcon />, camera: <CameraIcon />, building: <BuildingIcon />,
  message: <MessageIcon />, doc: <DocIcon />, shield: <ShieldIcon />,
  chart: <ChartBarIcon />, search: <SearchIcon />, users: <UsersIcon />, settings: <SettingsIcon />,
  inbox: <BellIcon />,
}
```
  In `AppShell.tsx` add Requests to the phone/Blueprint owner bar and relabel Brief→Latest / Sites→Projects (owner bar only). Replace lines 61-71 (`owner:` array):
```ts
  owner: [
    { to: '/', labelKey: 'nav.latest', label: 'Latest', icon: <GridIcon />, end: true },
    { to: '/sites', labelKey: 'nav.projects', label: 'Projects', icon: <ListIcon /> },
    { to: '/requests', labelKey: 'nav.requests', label: 'Requests', icon: <BellIcon /> },
    { to: '/chat', labelKey: 'nav.chat', label: 'Chat', icon: <MessageIcon /> },
    { to: '/approvals', labelKey: 'nav.approvals', label: 'Approvals', icon: <CheckIcon /> },
    { to: '/settings/documents', labelKey: 'nav.documents', label: 'Drawings', icon: <DocIcon /> },
    { to: '/reports', labelKey: 'nav.reports', label: 'Reports', icon: <DocIcon /> },
    { to: '/search', labelKey: 'nav.search', label: 'Search', icon: <SearchIcon /> },
    { to: '/more', labelKey: 'nav.more', label: 'More', icon: <DotsIcon /> },
  ],
```
  (The Spec-desk row is dropped from the owner phone bar — it only ever redirected to `/designer`, and the owner cockpit does not own the designer surface; that removal is intentional. Add `BellIcon` to the AppShell icon import list at line 7-16.)
  Add the two new label keys to `en.ts` + `hi.ts` (append to the `nav.*` block): `'nav.latest': 'Latest'` / `'नवीनतम'`, `'nav.projects': 'Projects'` / `'प्रोजेक्ट'`. (These are additive; existing `nav.brief`/`nav.sites` stay for other roles.)

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/ui/navModel.test.ts src/ui/AppShell.test.tsx src/ui/AppShell.neev.test.tsx src/i18n/i18n.test.tsx && npm run build`
  Expected: navModel test 2 passed; existing AppShell tests still pass; i18n parity passes; tsc -b exits 0. (If `AppShell.test.tsx` asserts an exact owner-tab count, update that expectation to include Requests as part of this task.)

- [ ] **Step 5: Commit**
```
git add src/ui/navModel.ts src/ui/NeevSidebar.tsx src/ui/AppShell.tsx src/ui/navModel.test.ts src/i18n/en.ts src/i18n/hi.ts
git commit -m "feat(web): add Requests to owner nav; relabel Brief→Latest, Sites→Projects

Sentence-case owner nav; every entry verified to route to a live screen.
Owner-scoped label keys (nav.latest/nav.projects) so other roles are untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E5: SetupChecklist — drop dead `connect_whatsapp`, add `add_project → invite_team → start_chat`

**Files:**
- Modify `/Users/aryantripathi/Developer/contructionAI/constructo/backend/app/dashboard/aggregate.py` (the `_setup_checklist` step list, lines 328-344)
- Test `/Users/aryantripathi/Developer/contructionAI/constructo/backend/tests/` — locate the existing setup-checklist test (`grep -rn "connect_whatsapp\|setup_checklist\|add_site" tests/`), extend it; if none, create `tests/dashboard/test_setup_checklist.py`.

Verify command (backend): `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check <path> && pytest <path> -v`.

**Interfaces:**
Consumes: `sites`, `events_by_site`, `baselines_by_site` (already in scope in `_setup_checklist`, aggregate.py:317-323). The frontend `SetupChecklist.tsx` needs NO change — it renders whatever `SetupStep[]` the backend returns and resolves `title_key` via i18n (keys added in E2).
Produces: setup checklist steps `add_project | invite_team | start_chat`. **No `connect_whatsapp` step is ever emitted** (de-WhatsApp'd cold start).

Grounding: signals available in `_setup_checklist` are `has_sites` (len(sites)>0), `any_events`, `any_baseline`. New steps map to REAL signals we already have:
- `add_project.done` = `has_sites` (a project is a Site).
- `invite_team.done` = `any_events` (real events only exist once a team member is capturing/posting; this is the same signal the old `connect_whatsapp` used, re-labelled honestly — verify there is no stronger "team invited" signal in scope; if `sites` rows expose member counts, prefer that, else `any_events` is the honest proxy and MUST be commented as such).
- `start_chat.done` = `any_baseline` OR reuse `any_events` — pick the signal that is genuinely true when a chat has started. Since there is no chat-message signal in `_setup_checklist`'s inputs, keep `start_chat.done = any_events` and drop the baseline step, OR keep baseline as the third gate. **Decision: keep three honest gates** → `add_project=has_sites`, `invite_team=any_events`, `start_chat=any_baseline`. Re-check the completion condition (line 325) accordingly.

- [ ] **Step 1: Write the failing test** — extend/create the backend test. If `tests/dashboard/test_setup_checklist.py` does not exist, create it:
```python
import pytest

from app.dashboard.aggregate import _setup_checklist


class _FakeSite:
    def __init__(self, sid: str) -> None:
        self.id = sid


def test_setup_checklist_uses_activity_first_steps_not_whatsapp():
    # No sites, no events, no baseline → cold start returns the three new steps.
    steps = _setup_checklist(sites=[], events_by_site={}, baselines_by_site={})
    assert steps is not None
    keys = [s["key"] for s in steps]
    assert keys == ["add_project", "invite_team", "start_chat"]
    assert "connect_whatsapp" not in keys
    # title_key i18n handles rendering; every step exposes done=False here.
    assert all(s["done"] is False for s in steps)


def test_setup_checklist_add_project_done_when_a_site_exists():
    site = _FakeSite("s1")
    steps = _setup_checklist(
        sites=[site], events_by_site={}, baselines_by_site={}
    )
    assert steps is not None
    by_key = {s["key"]: s for s in steps}
    assert by_key["add_project"]["done"] is True
    assert by_key["invite_team"]["done"] is False
    assert by_key["start_chat"]["done"] is False
```
  (If a test already references the old `connect_whatsapp`, update that assertion in the same file rather than duplicating.)

- [ ] **Step 2: Run test, verify it fails** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && pytest tests/dashboard/test_setup_checklist.py -v`
  Expected: FAIL — returned keys are `['add_site','connect_whatsapp','set_baseline']`, so `keys == ['add_project','invite_team','start_chat']` fails.

- [ ] **Step 3: Minimal implementation** — edit `_setup_checklist` in `app/dashboard/aggregate.py`, lines 328-344, replacing the returned list:
```python
    return [
        {
            "key": "add_project",
            "done": has_sites,
            "title_key": "owner.setup.add_project",
        },
        {
            # `any_events` is the honest proxy for "team is on site" — real events
            # only land once a supervisor/PM starts capturing. (Was connect_whatsapp.)
            "key": "invite_team",
            "done": any_events,
            "title_key": "owner.setup.invite_team",
        },
        {
            "key": "start_chat",
            "done": any_baseline,
            "title_key": "owner.setup.start_chat",
        },
    ]
```
  Leave the completion gate at line 325 (`if has_sites and any_events and any_baseline: return None`) unchanged — it still maps 1:1 to the three new steps being done.

- [ ] **Step 4: Run test, verify pass** — `cd /Users/aryantripathi/Developer/contructionAI/constructo/backend && ruff check app/dashboard/aggregate.py tests/dashboard/test_setup_checklist.py && pytest tests/dashboard/test_setup_checklist.py -v`
  Expected: 2 passed; ruff clean.

- [ ] **Step 5: Commit**
```
git add app/dashboard/aggregate.py tests/dashboard/test_setup_checklist.py
git commit -m "feat(dashboard): activity-first setup checklist (drop connect_whatsapp)

Cold-start steps are now add_project -> invite_team -> start_chat, mapped to
existing has_sites/any_events/any_baseline signals. i18n keys land in the web
bundle (owner.setup.add_project/invite_team/start_chat).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Honest empty-state copy pass (reference — implemented across E2/E3; consumed by Slice A for activity/projects/needs-you)

CDS-voice invitations (name the next real action; never a dead-end "nothing here"). Strings + keys (added to `en.ts`/`hi.ts` in E2):

| Region | Title key / string | Hint key / string |
|---|---|---|
| Activity feed empty | `activity.empty.title` — "Nothing has happened yet" | `activity.empty.hint` — "Share a site photo or post an update and it will show up here for your homeowners." |
| Projects list empty | `owner.projects.empty.title` — "No projects yet" | `owner.projects.empty.hint` — "Add your first project to start tracking progress and sharing it." |
| Needs-you empty | `owner.needsyou.empty.title` — "You're all caught up" | `owner.needsyou.empty.hint` — "Approvals and homeowner requests that need a decision will appear here." |
| Requests empty | `requests.empty.title` — "No requests yet" | `requests.empty.hint` — "When a homeowner asks for a photo or flags something, it lands here. Nothing needs you right now." |

Slice A (OwnerHome) consumes `activity.empty.*`, `owner.projects.empty.*`, `owner.needsyou.empty.*`; Slice E owns the keys' definition (E2) and the `requests.empty.*` render (E3). No divergent strings — these are the single source.
