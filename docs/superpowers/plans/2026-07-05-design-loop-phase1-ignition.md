# Phase 1 — Engine Ignition + Authority (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine ignites itself: ranking past the threshold auto-proposes themes + clarifications; homeowners get the decision authority the spec intended (themes, conflicts, brief generation); a homeowner can start a profile; extraction failures become visible and retryable; the GET-that-writes smell is removed.

**Architecture:** Extract theme/clarification generation from route handlers into a shared `app/profiler/engine.py`; call a deterministic, debounced `refresh_taste_and_maybe_propose` hook from every ranking/reference write. Authority opens via ONE shared membrane helper that mirrors the proven `act_on_brief` homeowner branch (`router.py:1133-1153`). Two additive columns ride one migration.

**Tech stack:** FastAPI async + SQLAlchemy 2.0 + Alembic; pytest with `client` / `factory` / `db_session` fixtures; `FakeLLMClient` for narration.

**Branch:** `feat/design-loop-p1-ignition` off main (after Phase 0 merges).

## Global Constraints

- Determinism: proposals auto, commits human. `confidence` only ever from `build_taste_model`. Narration failures never 500 (existing try/except pattern).
- Membrane: homeowner write-access = active `HomeownerMember` on the profile's site; commit authority = `member_sub_role(...)` ∈ `APPROVERS` via `can_approve` (`app/homeowner/authority.py:19-33`). Cross-company → 404 (via `_load_accessible_profile`), never a 403 leak.
- All new endpoints stay inside the Labs-mounted profiler router.
- Executor note: test helper names below follow `tests/test_profiler_membrane.py` (`_world`, `_member`) and `tests/test_profiler_presets.py` (`_profile_with_area`) — if a fixture drifted, adapt the import, not the assertion.
- Every task: run its tests (fail → pass), then `uv run ruff check .`, then commit. Working dir: `constructo/backend`.

## File structure

| File | Responsibility |
|---|---|
| `app/profiler/engine.py` (new) | Pure-orchestration: taste refresh + persist, threshold check, theme/clarification proposal generation (shared by routes + hook) |
| `app/profiler/router.py` | Thin routes; new `_gate_design_commit` membrane helper; new self-serve + retry-extraction endpoints |
| `app/models/profiler.py` | +`ProfilerArea.last_proposal_ranked_count`, +`ProfilerReference.extraction_status` |
| `alembic/versions/<gen>_profiler_ignition_columns.py` | The one additive migration |
| `app/profiler/schemas.py` | `ReferenceOut.extraction_status`, `SelfServeProfileIn` |
| `tests/test_profiler_engine.py` (new) | Hook behavior: threshold, debounce, persist-on-write |
| `tests/test_profiler_authority.py` (new) | Homeowner theme/conflict/brief authority matrix |
| `tests/test_profiler_selfserve.py` (new) | Self-serve profile creation |
| `mobile/src/api/client.ts` + `mobile/src/api/design_loop.test.ts` (new) | Typed wrappers for the changed contract |

---

### Task 1: Migration + model columns

**Files:**
- Modify: `app/models/profiler.py` (ProfilerArea ~line 118-148, ProfilerReference ~line 175-201)
- Create: `alembic/versions/<generated>_profiler_ignition_columns.py`

**Interfaces:**
- Produces: `ProfilerArea.last_proposal_ranked_count: int` (default 0), `ProfilerReference.extraction_status: str | None` (`"ok" | "failed"` | None=never ran). Later tasks read/write both.

- [ ] **Step 1: Add columns to the models**

```python
# in ProfilerArea, after taste_model:
    last_proposal_ranked_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
# in ProfilerReference, after preset_id:
    extraction_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
```

- [ ] **Step 2: Autogenerate + prune the migration** (autogenerate emits known spurious index-drops on unrelated tables — DELETE those ops; keep ONLY the two add_column/drop_column pairs)

```bash
uv run alembic revision --autogenerate -m "profiler ignition columns"
# edit: keep only op.add_column("profiler_areas", ...) and op.add_column("profiler_references", ...)
uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
```

Expected: clean up/down/up; single head (`uv run alembic heads` → one).

- [ ] **Step 3: Commit** — `git commit -m "feat(profiler): ignition columns (last_proposal_ranked_count, extraction_status)"`

### Task 2: Extract shared generation into `app/profiler/engine.py`

**Files:**
- Create: `app/profiler/engine.py`
- Modify: `app/profiler/router.py` — `generate_themes` (:902-953) and `generate_clarifications_endpoint` (:1335-1373) bodies delegate
- Test: existing `tests/test_profiler_themes.py`, `tests/test_profiler_brief.py` stay green (pure refactor — no new tests)

**Interfaces:**
- Produces (exact signatures later tasks call):

```python
# app/profiler/engine.py
async def compute_and_persist_taste(
    session: AsyncSession, area: ProfilerArea
) -> dict:
    """build_taste_model over _area_signals; writes area.taste_model/confidence/
    has_conflict (no commit). Returns the full model dict."""

async def propose_themes_for_area(
    session: AsyncSession, llm: LLMClient, profile_id: UUID,
    area: ProfilerArea, model: dict,
) -> list[ProfilerTheme]:
    """The exact body of today's generate_themes after the model is built:
    narrate (exception-safe) → delete prior SUGGESTED → insert new (confidence
    from model) → _sync_conflicts. No commit."""

async def propose_clarifications_for_area(
    session: AsyncSession, llm: LLMClient, profile_id: UUID,
    area: ProfilerArea, model: dict,
) -> list[ProfilerClarification]:
    """Today's generate_clarifications_endpoint body after model build. No commit."""
```

- [ ] **Step 1: Move the code.** `_area_signals` and `_sync_conflicts` currently live in `router.py:312/354` — move both INTO `engine.py` (router imports them back where still referenced). Route handlers become: load+authz → `model = await compute_and_persist_taste(...)` → `await propose_*` → `session.commit()` → serialize.
- [ ] **Step 2: Run the touched suites**

```bash
uv run pytest tests/test_profiler_themes.py tests/test_profiler_brief.py tests/test_profiler_api.py -q
```

Expected: PASS unchanged (refactor-only).
- [ ] **Step 3: Commit** — `refactor(profiler): extract generation engine from route handlers`

### Task 3: The auto-propose hook (the ignition)

**Files:**
- Modify: `app/profiler/engine.py` (add hook), `app/profiler/router.py` — call sites in `rank_reference` (:837-872), `add_reference` (:654), `add_reference_from_link` (:690), `add_reference_from_preset` (:770)
- Test: `tests/test_profiler_engine.py` (new)

**Interfaces:**
- Produces:

```python
async def refresh_taste_and_maybe_propose(
    session: AsyncSession, llm: LLMClient, profile_id: UUID, area_id: UUID,
) -> None:
    """Called after every ranking/reference write, pre-commit.
    1. compute_and_persist_taste (taste now persists on WRITE — Task 4 removes
       the GET side-effect).
    2. If model['ranked_count'] >= area.recommended_count AND
       model['ranked_count'] != area.last_proposal_ranked_count:
         propose_themes_for_area + (if model['confidence'] < 0.7 or
         model['has_conflict']) propose_clarifications_for_area;
         area.last_proposal_ranked_count = model['ranked_count'].
    Proposal errors are logged, never raised (ranking must always save)."""
```

- Consumes: Task 2's three functions.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_profiler_engine.py
"""The ignition: ranking past the threshold auto-proposes; below it, silence."""
import pytest
from sqlalchemy import select
from app.models.profiler import ProfilerArea, ProfilerClarification, ProfilerTheme, ThemeStatus
from tests.test_profiler_presets import _profile_with_area  # architect+site+area+contributor
from .conftest import auth  # adapt import path to repo convention if flat

async def _add_and_rank(client, hdrs, pid, area_id, contributor_id, n, stars=5):
    """n upload references, each ranked immediately (stars). Returns ref ids."""
    ids = []
    for i in range(n):
        ref = await client.post("/api/v1/design/references", json={
            "profile_id": pid, "area_id": area_id, "contributor_id": contributor_id,
            "source_type": "upload", "image_r2_key": f"design/test/{i}.jpg",
        }, headers=hdrs)
        assert ref.status_code == 201, ref.text
        rid = ref.json()["id"]
        rank = await client.post(f"/api/v1/design/references/{rid}/rankings", json={
            "contributor_id": contributor_id, "stars": stars, "tags": {},
        }, headers=hdrs)
        assert rank.status_code == 201, rank.text
        ids.append(rid)
    return ids

async def test_crossing_threshold_autoproposes_themes(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 3
    await db_session.commit()
    hdrs = auth(architect)
    await _add_and_rank(client, hdrs, pid, area_id, contributor_id, 3)
    themes = (await db_session.execute(
        select(ProfilerTheme).where(ProfilerTheme.area_id == area_id,
                                    ProfilerTheme.status == ThemeStatus.suggested)
    )).scalars().all()
    assert themes, "ranking past recommended_count must auto-propose themes"
    area = await db_session.get(ProfilerArea, area_id)
    assert area.last_proposal_ranked_count == 3
    assert area.taste_model  # persisted on write, not on GET

async def test_below_threshold_stays_silent(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 5
    await db_session.commit()
    await _add_and_rank(client, auth(architect), pid, area_id, contributor_id, 2)
    themes = (await db_session.execute(
        select(ProfilerTheme).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    assert themes == []

async def test_same_ranked_count_does_not_regenerate(client, factory, db_session):
    """Debounce: re-ranking the same reference (upsert, count unchanged) must not
    delete+recreate the suggested set."""
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 2
    await db_session.commit()
    hdrs = auth(architect)
    ids = await _add_and_rank(client, hdrs, pid, area_id, contributor_id, 2)
    first = (await db_session.execute(
        select(ProfilerTheme.id).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    # re-rank ref 0 (count still 2)
    await client.post(f"/api/v1/design/references/{ids[0]}/rankings", json={
        "contributor_id": contributor_id, "stars": 2, "tags": {},
    }, headers=hdrs)
    second = (await db_session.execute(
        select(ProfilerTheme.id).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    assert set(first) == set(second)
```

- [ ] **Step 2: Run to verify fail** — `uv run pytest tests/test_profiler_engine.py -q` → FAIL (no auto-proposal).
- [ ] **Step 3: Implement** the hook exactly per the docstring; in the four route handlers insert `await refresh_taste_and_maybe_propose(session, llm, profile.id, area_id)` immediately before their `session.commit()` (rank_reference gains an `llm: LLMClient = Depends(get_llm)` param; the three add-reference routes already have `llm`).
- [ ] **Step 4: Run to green** — new file + `tests/test_profiler_intake.py` + `tests/test_profiler_api.py` all pass (FakeLLM narrates canned themes; if a canned-shape assert in an old test now sees auto-proposed rows, scope its query by `status == suggested` rather than weakening the new tests).
- [ ] **Step 5: Commit** — `feat(profiler): auto-propose themes+clarifications when an area crosses its ranking threshold`

### Task 4: GET /taste becomes read-only

**Files:**
- Modify: `app/profiler/router.py:875-894` — delete the three persist lines + commit (the hook now persists on write); handler returns the freshly-computed model only.
- Test: add to `tests/test_profiler_engine.py`:

```python
async def test_get_taste_is_read_only(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    resp = await client.get(
        f"/api/v1/design/profiles/{pid}/areas/{area_id}/taste", headers=auth(architect))
    assert resp.status_code == 200
    area = await db_session.get(ProfilerArea, area_id)
    await db_session.refresh(area)
    assert area.taste_model == {}  # untouched by a GET (no rankings yet, nothing persisted)
```

- [ ] Steps: failing test → remove side-effect → green (`tests/test_profiler_api.py` may pin the old persist behavior — update that assertion to the new contract) → commit `fix(profiler): GET /taste no longer writes`.

### Task 5: Shared commit-authority helper + homeowner theme decisions

**Files:**
- Modify: `app/profiler/router.py` — new helper near `_load_accessible_profile` (:205); `decide_theme` (:994-1014) re-gated
- Test: `tests/test_profiler_authority.py` (new)

**Interfaces:**
- Produces:

```python
async def _gate_design_commit(
    session: AsyncSession, user: User, profile: ProfilerProfile,
) -> str:
    """Who may COMMIT design decisions (themes, conflicts, brief generation).
    Contractor side: role ∈ _EDIT_ROLES and company match (404 otherwise —
    the caller already went through _load_accessible_profile).
    Homeowner side: member_sub_role(session, user, profile.site_id) must
    satisfy can_approve, else 403 'approve_forbidden' {can_comment: true}
    (mirrors act_on_brief :1133-1153). Returns the actor_role string."""
```

- [ ] **Step 1: Failing tests**

```python
# tests/test_profiler_authority.py
"""Spec §6: the HOMEOWNER (owner/co_owner) holds theme/conflict/brief authority;
family can look, not commit; strangers see nothing."""
import pytest
from app.models.homeowner import HomeownerSubRole
from app.models.profiler import ProfilerTheme, ThemeStatus
from tests.test_profiler_membrane import _world, _member  # site+profile+homeowner users world
from .conftest import auth

async def _suggested_theme(db_session, pid, area_id) -> ProfilerTheme:
    t = ProfilerTheme(profile_id=pid, area_id=area_id, name="Warm Minimal",
                      palette=["oak"], materials=["light oak"], confidence=0.8,
                      evidence_reference_ids=[])
    db_session.add(t); await db_session.commit(); await db_session.refresh(t)
    return t

async def test_owner_homeowner_approves_theme(client, factory, db_session):
    # _world returns a dict: company, architect, site, pid, area_id, bid,
    # owner, co, family, advisor (tests/test_profiler_membrane.py:32-66)
    w = await _world(client, factory, db_session)
    theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
    resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
        json={"action": "approve"}, headers=auth(w["owner"]))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved"

async def test_family_member_gets_comment_box_not_authority(client, factory, db_session):
    w = await _world(client, factory, db_session)   # w["family"] is already an active family member
    theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
    resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
        json={"action": "approve"}, headers=auth(w["family"]))
    assert resp.status_code == 403
    body = resp.json()
    assert body["error"]["code"] == "approve_forbidden"
    assert body["error"]["extra"]["can_comment"] is True

async def test_cross_company_homeowner_sees_404(client, factory, db_session):
    w = await _world(client, factory, db_session)
    stranger = await factory.user(role=w["owner"].role)  # no membership on this site
    theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
    resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
        json={"action": "approve"}, headers=auth(stranger))
    assert resp.status_code == 404  # membrane: existence not revealed

async def test_architect_path_still_works(client, factory, db_session):
    w = await _world(client, factory, db_session)
    theme = await _suggested_theme(db_session, w["pid"], w["area_id"])
    resp = await client.post(f"/api/v1/design/themes/{theme.id}/decision",
        json={"action": "reject"}, headers=auth(w["architect"]))
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
```

- [ ] **Step 2:** run → FAIL (homeowner currently blocked by `require_role(*_EDIT_ROLES)` → 403 wrong shape / 401).
- [ ] **Step 3: Implement.** `decide_theme` signature: `user: User = Depends(get_current_user)`; body becomes `profile = await _load_accessible_profile(session, theme.profile_id, user)` → `actor_role = await _gate_design_commit(session, user, profile)` → existing status/decided_by lines. Implement `_gate_design_commit` per docstring (copy the act_on_brief branch, factor both call sites onto the helper).
- [ ] **Step 4:** green incl. `tests/test_profiler_themes.py` + `tests/test_profiler_membrane.py` (architect paths must not regress).
- [ ] **Step 5: Commit** — `feat(profiler): homeowner owners hold theme decision authority`

### Task 6: Homeowner conflict resolution

**Files:** `app/profiler/router.py` `resolve_conflict` (:1017-1038) — same re-gate as Task 5; Test: extend `tests/test_profiler_authority.py`.

- [ ] **Step 1: Failing tests** (same world; create a `ProfilerConflict(profile_id, area_id, dimension="colors", value="dark", resolution_status=ConflictStatus.open)` row): owner resolves with `{"resolution": "keep_a", "note": "warm woods win"}` → 200, `resolution_status == "resolved"`, `decision_note == "warm woods win"`; owner defers with `{"resolution": "defer_to_architect"}` → `"deferred_to_architect"`; family → 403 `approve_forbidden`; stranger → 404.
- [ ] **Step 2-4:** fail → re-gate via `_load_accessible_profile` + `_gate_design_commit` → green.
- [ ] **Step 5: Commit** — `feat(profiler): homeowner owners can resolve/defer taste conflicts`

### Task 7: Homeowner brief generation + the revision_requested exit

**Files:** `app/profiler/router.py` `generate_brief` (:1046-1105) — same re-gate; Test: extend `tests/test_profiler_authority.py`.

- [ ] **Step 1: Failing tests**

```python
async def test_owner_generates_brief_and_regenerates_out_of_revision(client, factory, db_session):
    w = await _world(client, factory, db_session)   # NOTE: _world already generated a brief (w["bid"])
    hdrs = auth(w["owner"])
    r1 = await client.post(f"/api/v1/design/profiles/{w['pid']}/brief", headers=hdrs)
    assert r1.status_code == 201, r1.text
    b1 = r1.json()
    assert b1["state"] == "homeowner_review"
    v1 = b1["version"]                       # world's seed brief means this is >= 2
    # dead-end exit: request changes, then REGENERATE
    rc = await client.post(f"/api/v1/design/briefs/{b1['id']}/approval",
        json={"action": "request_changes", "note": "less grey"}, headers=hdrs)
    assert rc.status_code == 200 and rc.json()["state"] == "revision_requested"
    r2 = await client.post(f"/api/v1/design/profiles/{w['pid']}/brief", headers=hdrs)
    assert r2.status_code == 201
    assert r2.json()["version"] == v1 + 1 and r2.json()["state"] == "homeowner_review"

async def test_family_cannot_generate_brief(client, factory, db_session):
    w = await _world(client, factory, db_session)
    resp = await client.post(f"/api/v1/design/profiles/{w['pid']}/brief", headers=auth(w["family"]))
    assert resp.status_code == 403
```

- [ ] **Step 2-4:** fail → re-gate (`get_current_user` + accessible + `_gate_design_commit`) → green (brief suite intact). Versioning/regeneration already exists — this task only opens the door and pins the exit path under test.
- [ ] **Step 5: Commit** — `feat(profiler): homeowners can generate/regenerate the brief — revision_requested has an exit`

### Task 8: Self-serve profile start

**Files:**
- Modify: `app/profiler/router.py` (new endpoint after `create_profile` :454-493), `app/profiler/schemas.py` (`SelfServeProfileIn(site_id: UUID | None = None)`)
- Test: `tests/test_profiler_selfserve.py` (new)

**Interfaces:**
- Produces: `POST /api/v1/design/profiles/self-serve` → 201 `ProfileDetailOut` | 409 `profile_exists` (`extra={"profile_id": ...}`). Homeowner owner/co-owner only. Mobile calls it in Phase 4.
- Consumes: `resolve_site` (`app.homeowner.scoping:65`), `member_sub_role`/`can_approve`, `Space` (`app.models.homeowner_property:55`).

Behavior:
1. `sid = await resolve_site(session, user, body.site_id)`; `sub_role = await member_sub_role(session, user, sid)`; not `can_approve(sub_role)` → 403 `approve_forbidden` `{can_comment: True}`.
2. Existing non-archived profile on site → 409 `profile_exists` + its id (client navigates, never duplicates).
3. `company_id = site.company_id`; areas from the site's `Space` rows (`area_kind=interior`, `area_key=space.name.strip().lower()`, `space_id=space.id`, recommended default) — no spaces → defaults `["kitchen", "living room", "master bedroom"]`.
4. Contributors: every active `HomeownerMember` on the site (`member_id=m.id`, `user_id=m.user_id`, role `co_owner` if their sub_role ∈ APPROVERS else `family`, `is_decision_owner=can_approve`).
5. Return via the same serializer as `get_profile`.

- [ ] **Step 1: Failing tests** — owner creates → 201, areas match spaces (seed 2 Spaces first), self listed as contributor with `is_decision_owner=True`; second call → 409 with the same profile id; family member → 403; contractor-side architect on this route → 403 (route is homeowner-only; architects keep `POST /profiles`).
- [ ] **Step 2-4:** fail → implement → green.
- [ ] **Step 5: Commit** — `feat(profiler): homeowner self-serve profile start`

### Task 9: Extraction status + retry

**Files:**
- Modify: `app/profiler/router.py` — `_run_vision` (:124-151) sets `ref.extraction_status = "ok"` on success / `"failed"` in the except branch; `_reference_out` (:116) + `ReferenceOut` in `schemas.py` gain `extraction_status`; new endpoint:

```python
@router.post("/references/{reference_id}/extract", response_model=ReferenceOut)
async def retry_extraction(reference_id: UUID, user=Depends(get_current_user),
                           session=Depends(get_session), llm=Depends(get_llm)) -> ReferenceOut:
    """Re-run vision for a reference whose extraction failed (or never ran).
    Any member who can see the profile may retry — it commits nothing."""
```
- Test: extend `tests/test_profiler_extraction.py`.

- [ ] **Step 1: Failing tests** — (a) FakeLLM raising in `complete_vision` (monkeypatch) → add still 201, row's `extraction_status == "failed"`; (b) `POST /references/{id}/extract` with a working LLM → 200, `"ok"`, `ProfilerReferenceAttributes` row exists; (c) cross-company user → 404.
- [ ] **Step 2-4:** fail → implement (retry endpoint reuses `_run_vision` with a fresh presigned/source URL, deletes a stale attributes row first) → green.
- [ ] **Step 5: Commit** — `feat(profiler): extraction status is visible and retryable`

### Task 10: Cross-company write matrix (deferred hardening)

**Files:** extend `tests/test_profiler_membrane.py`.

- [ ] **Step 1:** One parametrized test: a full second world (company B homeowner-owner + architect) attempts every WRITE against world A — `rank`, `add reference`, `from-link`, `from-preset`, `theme decision`, `conflict resolve`, `brief generate`, `brief approval`, `clarification answer`, `retry extract`, `materialize` — every one asserts **404** (not 403). Plus `_validate_contributor` hardening: contributor id from world B used on world A's profile → 403 `not_your_contributor` or 404, never 201.
- [ ] **Step 2:** run — any failure is a REAL vulnerability: fix the endpoint (route through `_load_accessible_profile`), do not soften the test.
- [ ] **Step 3: Commit** — `test(profiler): cross-company write matrix locks the membrane`

### Task 11: Mobile + web contract wrappers

**Files:**
- Modify: `mobile/src/api/client.ts` (design section, after `approvals` :561); `web/src/api/design.ts` (after `themeDecision`)
- Test: `mobile/src/api/design_loop.test.ts` (new — under `src/`, NEVER `app/`)

- [ ] **Step 1: Failing jest** asserting URL + method shape (mirror `homeowner.test.ts` mock-fetch pattern) for: `design.selfServeProfile(siteId?)` → POST `/api/v1/design/profiles/self-serve`; `design.generateBrief(profileId)` → POST `/api/v1/design/profiles/{pid}/brief`; `design.retryExtraction(refId)` → POST `/api/v1/design/references/{id}/extract`.
- [ ] **Step 2: Implement wrappers** (typed: `ProfilerProfileDetail`, `ProfilerBriefDetail`, `ProfilerReference` — reuse existing types; add `extraction_status?: 'ok' | 'failed' | null` to the `ProfilerReference` type). Web: `designApi.generateBrief(profileId)` with the same USE_MOCKS canned-response branch as its siblings.
- [ ] **Step 3:** `npm run typecheck` 0 errors; `npx jest src/api/design_loop.test.ts` green; `cd ../web && npm run build` green.
- [ ] **Step 4: Commit** — `feat(api): client wrappers for self-serve, brief generation, extraction retry`

### Task 12: Full gate + PR

- [ ] `uv run ruff check .` clean; `uv run pytest -q` full suite — same pass count as post-Phase-0 main + the new tests, zero regressions; `uv run alembic heads` → single head.
- [ ] Mobile `npm run typecheck` + full `npx jest`; web `npm run build`.
- [ ] Push + PR titled `feat(design): engine ignition + homeowner authority (Design Loop Phase 1)`, body linking spec + master plan; request review per repo convention (adversarial review pass before merge).

## Self-review notes (already applied)

- Spec coverage: P0-1 → Tasks 2-3; P0-4 → Task 5; dead-end exit → Task 7; D5 self-serve → Task 8; P2-hygiene (taste GET, extraction, membrane) → Tasks 4/9/10; contract for Phases 3-4 → Task 11. Notifications intentionally absent — Phase 2 owns them (hook emit points already centralized in `engine.py` by design).
- Type consistency: `refresh_taste_and_maybe_propose(session, llm, profile_id, area_id)` is the only hook signature; Tasks 3's route wiring uses exactly it. `_gate_design_commit(session, user, profile) -> str` used identically in Tasks 5/6/7/8.
