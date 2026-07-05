# Phase 2 — Design Events: Push + Bell Inbox + Activity + Badges

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every design hand-off produces a signal: homeowner gets bell-inbox rows + cadence-gated push (via the existing `notify_site_homeowners`), the designer gets pushes + a state-computed badge, the owner web activity feed gains design rows, and push taps deep-link to the right screen.

**Architecture (IMPORTANT DELIBERATE CHOICE):** We do **NOT** create `Update` rows or new `UpdateType` enum values, and we do **NOT** write `SiteEventModel` rows — both are consumed by multiple unrelated surfaces (WhatsApp brief, site register), which is exactly how the shadow-Decision pollution bug happened (see memory: owner-activity-first-rethink). Instead: homeowner signal = `notify_site_homeowners(...)` (which already persists `HomeownerNotification` bell rows AND pushes, honouring per-member cadence); designer signal = `push_tokens_for_user` + `send_expo_push`; owner-web activity reads **profiler tables directly** as a new source.

**Assumes:** Phase 1 merged (`app/profiler/engine.py` with `refresh_taste_and_maybe_propose`, `_gate_design_commit`, self-serve endpoint).

**Branch:** `feat/design-loop-p2-events`.

## Global Constraints

- All notification sends are best-effort AFTER commit: wrapped so a push failure can never 500 or roll back the domain write (mirror `publish_update`, `app/publish/router.py:390-414`).
- Push message dict shape: `{"to": token, "title": str, "body": str, "data": {...}}` (`app/push/sender.py:51-74`). Tests assert via `dry_run_log()` / `reset_dry_run_log()` (PUSH_SEND_MODE defaults to dry_run in tests).
- Homeowner category for cadence gating: `"design"`. Nothing in this phase is a `spike` — design news is never urgent enough to punch through a member's Paused setting.
- English lead + Hindi secondary for user-visible copy.
- Gates per task: `uv run ruff check .` + targeted pytest; phase end: full backend suite, mobile typecheck+jest, web `npm run build`.

## File structure

| File | Responsibility |
|---|---|
| `backend/app/profiler/events.py` (new) | The one notifier: kind catalog, copy, audience targeting |
| `backend/app/profiler/router.py`, `engine.py` | Call sites (after commit) |
| `backend/app/activity/aggregate.py`, `router.py`, `schemas.py` | 10th source: design activity |
| `backend/tests/test_profiler_events.py` (new) | Emission matrix |
| `mobile/app/_layout.tsx` | Push-tap routing for `data.type == "design"` |
| `web/src/features/owner/ActivityStream.tsx`, `web/src/api/activity.ts` | Render the new kind |
| `mobile/app/(contractor)/architect/brief.tsx`, `web/.../DesignerWorkspace.tsx` | Badge consumption |

---

### Task 1: `app/profiler/events.py` — the notifier

**Files:** Create `app/profiler/events.py`; Test `tests/test_profiler_events.py`.

**Interfaces:**
- Produces: `async def notify_design_event(session, profile, kind, *, note=None, area_label=None, version=None) -> None` — the ONLY function later tasks call. Kind ∈ the catalog below; unknown kind raises ValueError (a typo must fail loudly in tests, silently never-notify in prod is the bug we're killing).
- Consumes: `notify_site_homeowners` (`app/push/sender.py:170-217`), `push_tokens_for_user` (:121-139), `send_expo_push` (:51-74).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_profiler_events.py
import pytest
from app.push.sender import dry_run_log, reset_dry_run_log
from app.profiler.events import notify_design_event, DESIGN_EVENT_KINDS
from tests.test_profiler_membrane import _world

@pytest.fixture(autouse=True)
def _clean_push_log():
    reset_dry_run_log()
    yield
    reset_dry_run_log()

async def test_brief_sent_notifies_designer_not_homeowner(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(__import__("app.models.profiler", fromlist=["ProfilerProfile"]).ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "brief_sent_to_designer", version=1)
    msgs = dry_run_log()
    # architect has no PushToken registered in this world -> no crash, no homeowner push
    assert all(m["data"]["type"] == "design" for m in msgs)
    assert not any(m["data"]["kind"] == "brief_sent_to_designer" and m["data"].get("audience") == "homeowner" for m in msgs)

async def test_signed_off_reaches_homeowner_inbox_and_push(client, factory, db_session):
    from app.models.homeowner import HomeownerMember
    w = await _world(client, factory, db_session)
    # give the owner member a push token + default cadence
    member = (await db_session.execute(
        __import__("sqlalchemy").select(HomeownerMember).where(
            HomeownerMember.user_id == w["owner"].id))).scalars().first()
    member.notif_prefs = {"push_token": "ExponentPushToken[test-owner]"}
    await db_session.commit()
    profile = await db_session.get(__import__("app.models.profiler", fromlist=["ProfilerProfile"]).ProfilerProfile, w["pid"])
    await notify_design_event(db_session, profile, "designer_signed_off", version=2)
    msgs = dry_run_log()
    assert any(m["to"] == "ExponentPushToken[test-owner]" and m["data"]["kind"] == "designer_signed_off"
               for m in msgs)

async def test_unknown_kind_raises(client, factory, db_session):
    w = await _world(client, factory, db_session)
    profile = await db_session.get(__import__("app.models.profiler", fromlist=["ProfilerProfile"]).ProfilerProfile, w["pid"])
    with pytest.raises(ValueError):
        await notify_design_event(db_session, profile, "brief_snet")  # typo must fail loudly
```

(Import style: use normal top-of-file imports in the real test file — the inline `__import__` above is only to keep this plan snippet single-block; write `from app.models.profiler import ProfilerProfile` etc.)

- [ ] **Step 2:** `uv run pytest tests/test_profiler_events.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement**

```python
# app/profiler/events.py
"""Design-loop notifications. ONE entry point; copy + targeting per kind.

Homeowner direction rides notify_site_homeowners (bell inbox + cadence-gated
push). Designer direction pushes to every architect user of the profile's
company. Never raises out of notify_design_event's internals after the kind
check — a notification failure must not break the domain write.
"""
from __future__ import annotations
import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.profiler import ProfilerProfile
from app.models.user import User, UserRole
from app.push.sender import notify_site_homeowners, push_tokens_for_user, send_expo_push

logger = logging.getLogger(__name__)

# kind -> (homeowner_copy | None, designer_copy | None, deep_link)
# copy is (title, body-template); {area}/{note}/{version} fill from kwargs.
DESIGN_EVENT_KINDS: dict[str, tuple[tuple[str, str] | None, tuple[str, str] | None, str]] = {
    "profile_started":        (("Design profile started", "Start adding rooms you love"), None, "/design/profiler"),
    "themes_ready":           (("Design ideas ready", "New theme suggestions for {area}"),
                               ("Themes proposed", "{area}: new AI themes await review"), "/design/profiler"),
    "clarifications_asked":   (("A few questions about your style", "Answering sharpens your {area} brief"), None, "/design/profiler"),
    "clarification_answered": (None, ("Homeowner answered", "New clarification answers on a brief"), "/architect/brief"),
    "conflict_detected":      (("Your styles differ on {area}", "See both sides and settle it together"),
                               ("Taste conflict flagged", "{area} has diverging preferences"), "/design/profiler"),
    "conflict_resolved":      (None, ("Conflict settled", "{note}"), "/architect/brief"),
    "brief_ready":            (("Your design brief v{version} is ready", "Review it and send it to your designer"),
                               ("Brief v{version} generated", "A homeowner brief was generated"), "/design/brief"),
    "brief_sent_to_designer": (None, ("New brief for review", "A homeowner sent you their design brief"), "/architect/brief"),
    "changes_requested":      (("Your designer asked for changes", "{note}"), None, "/design/brief"),
    "designer_signed_off":    (("Your designer signed off", "Brief v{version} — your approval unlocks pricing"), None, "/design/brief"),
    "brief_approved":         (None, ("Brief approved", "Materialize it into material selections"), "/designer?tab=intake"),
    "brief_locked":           (("Locked in", "Your contractor received the final brief"), None, "/design/brief"),
    "specs_materialized":     (("Your brief became material choices", "{note}"),
                               ("Specs created from brief", "{note}"), "/design"),
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
```

- [ ] **Step 4:** tests green. **Step 5: Commit** — `feat(profiler): design event notifier (bell inbox + push, both directions)`

### Task 2: Wire the emit points

**Files:** Modify `app/profiler/engine.py` (auto-propose block), `app/profiler/router.py` (`act_on_brief`, `generate_brief`, `materialize_brief`, self-serve create, contractor `create_profile`); Test: extend `tests/test_profiler_events.py`.

Emit map (call AFTER the domain `session.commit()`):
- engine auto-propose fired → `themes_ready` (+ `clarifications_asked` if clarifications were created; + `conflict_detected` if the fresh model has a NEW open conflict) — pass `area_label=area.area_key`.
- `generate_brief` → `brief_ready` (version=new version).
- `act_on_brief` per action → `send_to_architect→brief_sent_to_designer`, `request_changes→changes_requested (note=body.note)`, `architect_sign_off→designer_signed_off`, `approve→brief_approved`, `contractor_received→brief_locked`.
- `materialize_brief` → `specs_materialized` (note=f"{specs_created} selections proposed").
- both profile-create endpoints → `profile_started`.

- [ ] **Step 1: Failing tests** — one test per trigger, pattern: perform the API action with a tokened owner-member (reuse Task 1's member setup as a helper `_tokened_owner(db_session, w)`), assert `dry_run_log()` contains exactly the expected kind, and **a failed transition emits nothing**:

```python
async def test_illegal_transition_emits_nothing(client, factory, db_session):
    w = await _world(client, factory, db_session)
    await _tokened_owner(db_session, w)
    reset_dry_run_log()
    resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
        json={"action": "contractor_received"}, headers=auth(w["owner"]))  # illegal from homeowner_review
    assert resp.status_code in (403, 409)
    assert dry_run_log() == []
```

- [ ] **Step 2-4:** fail → wire → green (also re-run `tests/test_profiler_brief.py` — approval flows now notify; dry-run mode keeps them green).
- [ ] **Step 5: Commit** — `feat(profiler): every design hand-off emits its signal`

### Task 3: Owner-web activity — the design source

**Files:** Modify `app/activity/aggregate.py` (:30-38 kinds, add `_map_design`, extend `build_activity` params), `app/activity/router.py` (:147-175 source loads), `app/activity/schemas.py` (:38-48 ActivityKind + LinkType literals); Test: extend the existing activity tests file.

Design rows come from **profiler tables directly** (no site_events): `ProfilerBriefApproval` (each action → one row) + `ProfilerBrief` creations (brief_ready).

- [ ] **Step 1: Failing test** — seed a brief + one `send_to_architect` approval in a world; call `GET /api/v1/activity` as the owner; assert an item with `kind == "design_update"`, `title` containing "brief", `link == {"type": "design_brief", "id": str(profile_id)}`, severity "info".
- [ ] **Step 2: Implement**
  - `KIND_DESIGN = "design_update"`; ActivityKind literal + LinkType literal gain `design_update` / `design_brief`.
  - Router loads: `brief_approvals = await _load(ProfilerBriefApproval, ProfilerBriefApproval.created_at)` joined to their brief→profile for site scoping (explicit select with join — profiler tables have no site_id on the approval row; scope via `ProfilerProfile.site_id.in_(visible)`).
  - `_map_design(approval, brief, profile, site_name)` → `{"kind": KIND_DESIGN, "title": _DESIGN_TITLES[approval.action], "subtitle": approval.note, "occurred_at": approval.created_at, "actor": approval.actor_role, "severity": "info", "link": {"type": "design_brief", "id": str(profile.site_id)}}` with `_DESIGN_TITLES = {"send_to_architect": "Design brief sent to designer", "request_changes": "Designer asked for brief changes", "architect_sign_off": "Designer signed off the brief", "approve": "Design brief approved", "contractor_received": "Design brief locked"}`.
- [ ] **Step 3-4:** green; `uv run ruff check .`. **Step 5: Commit** — `feat(activity): design brief hand-offs appear in the owner feed`

### Task 4: Web activity rendering

**Files:** Modify `web/src/api/activity.ts` (ActivityItem kind/link unions), `web/src/features/owner/ActivityStream.tsx` (`iconFor`, `linkFor`).

- [ ] **Step 1:** extend the `kind` union with `'design_update'` and link type `'design_brief'`; `linkFor`: `design_brief` → `/designer?tab=intake` (site pre-selected via existing site param convention); `iconFor(kind === 'design_update')` → the palette/brush icon already in the icon set (reuse `PhotoIcon` sibling pattern).
- [ ] **Step 2:** `npm run build` green + existing ActivityStream tests updated with one new fixture row. **Step 3: Commit** — `feat(web): render design activity rows`

### Task 5: Mobile push-tap routing

**Files:** Modify `mobile/app/_layout.tsx` (the `addNotificationResponseReceivedListener` switch).

- [ ] **Step 1:** In the tap handler, add before the generic `type` fallback:

```ts
if (data?.type === 'design') {
  const url = typeof data.url === 'string' ? data.url : '/design'
  // homeowner targets live under /(homeowner)/, designer pushes carry audience
  router.push(
    data.audience === 'designer'
      ? '/(contractor)/architect/brief'
      : (`/(homeowner)${url.startsWith('/') ? url : `/${url}`}` as never),
  )
  return
}
```

- [ ] **Step 2:** typecheck + jest green (routing switch is exercised by existing `_layout` tests if present; otherwise sim smoke covers it in Phase 6). **Step 3: Commit** — `feat(mobile): design push taps deep-link`

### Task 6: Designer badge — `GET /api/v1/design/inbox-summary`

**Files:** Modify `app/profiler/router.py` (+schema in `app/profiler/schemas.py`); Test: extend `tests/test_profiler_events.py`.

**Interfaces:** `InboxSummaryOut { briefs_awaiting_signoff: int, answered_clarifications: int, deferred_conflicts: int }` — state-computed for the caller's company (architect/_EDIT_ROLES; homeowner gets 403 — it is a contractor-side cockpit endpoint). Counts: briefs in `architect_review` · clarifications with `answer != None` on profiles whose latest brief is not locked · conflicts `resolution_status == deferred_to_architect`.

- [ ] Steps: failing test (world + one sent brief + one answered clarification + one deferred conflict → `{1,1,1}`; second company sees zeros) → implement (three scalar `select(func.count())` queries joined via profile.company_id) → green → commit `feat(profiler): designer inbox summary`.

### Task 7: Badge consumption (mobile Brief hub + web Intake tab)

**Files:** `mobile/src/api/client.ts` (+`design.inboxSummary()`), `mobile/app/(contractor)/architect/brief.tsx` (banner count chips), `web/src/api/design.ts` (+`inboxSummary` with USE_MOCKS branch), `web/src/features/designer/DesignerWorkspace.tsx` (Intake tab label suffix ` (N)`).

- [ ] Steps: wrappers + render (a `StatusPill status="info" label={`${n} waiting`}` beside the SubHeader on mobile; tab label count on web) → mobile jest URL-shape test in `src/api/design_loop.test.ts` → typecheck/jest/web build green → commit `feat: designer sees what waits for them`.

### Task 8: Phase gate

- [ ] Full backend suite + ruff; mobile typecheck + jest; web build. PR `feat(design): Phase 2 — every design hand-off has a signal`, reviewed, merged.

## Self-review notes
- Catalog covers every transition emitted in Task 2; `notify_design_event` raises on unknown kind so a future transition without copy fails tests, not silently.
- No Update/SiteEvent writes anywhere (the pollution lesson) — bell rows come from `notify_site_homeowners` internally.
- Activity: profiler-table source keeps the feed honest (no shadow rows to clean up later).
