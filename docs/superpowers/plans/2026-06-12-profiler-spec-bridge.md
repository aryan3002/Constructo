# Design Profiler — Spec-Engine Bridge + Contractor Trigger (Plan 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the Design Profiler's contractor-ready brief into the **Spec engine** — turn a shared brief's deterministic, human-approved material families into **proposed `Material` + `Spec` rows** (`approval_status=pending`) that a human confirms via the existing `POST /api/v1/specs/{id}/approve`. Plus confirm the thin contractor **"Build Design Profile" trigger** (the existing `POST /api/v1/design/profiles`) works end-to-end.

**Architecture:** Additive — a new pure module `app/profiler/bridge.py` (deterministic enumeration + idempotent `uuid5` keys, NO LLM, NO DB) + one new endpoint `POST /api/v1/design/briefs/{brief_id}/materialize` on the existing `app/profiler/router.py`. The endpoint reads the brief's **deterministic** `summary_json` payload (built from human-approved themes — never the LLM prose), find-or-creates company `Material` catalog rows, and creates `Spec` rows bound to the area's `Component` where one exists. **Determinism Doctrine holds: the bridge contains no LLM; quantities/rates are left NULL (never fabricated); every row lands `pending` for human confirmation.** This is the same propose→confirm pattern as `POST /api/v1/specs/extract`. Idempotent via `uuid5` natural keys (mirrors `app/specs/importer.py`), so re-running never duplicates.

**Tech Stack:** FastAPI, async SQLAlchemy 2.0, Postgres+JSONB, Pydantic v2, pytest-asyncio (auto). Run from `constructo/backend` with `uv`. Postgres on `:5433`. **Base branch: this worktree (continues after Plan 3b; HEAD includes the brief + membrane work).** No migration needed — uses existing `specs`/`materials` tables.

---

## What exists (the contract this plan bridges)

- **Spec engine** (`app/specs/`, `app/materials/`):
  - `Spec(company_id, site_id, component_id[NOT NULL FK components], material_id?[FK materials SET NULL], label, qty?, unit?, wastage_pct?, unit_rate?, approval_status[SpecApprovalStatus: pending/approved/rejected, server_default pending], client_final_code?, assignee_id?, notes?, created_at)`.
  - `Material(company_id, name, unit?, category?, notes?, brand?, sku?, colour?, finish?, size?, thickness?, catalog_url?, is_active, created_at)`.
  - Create idiom (`app/specs/router.py:57`): `Spec(company_id=user.company_id, **body.model_dump())`; `approval_status` defaults to `pending`. The propose precedent (`app/specs/router.py:90` `extract_spec`): creates a `Material` then a `Spec` with `notes="Proposed from a photo — confirm."`, returns it. Confirm: `POST /api/v1/specs/{id}/approve` (`_APPROVE_ROLES = owner/pm/architect`).
  - Idempotent keying (`app/specs/importer.py:22`): `_NS = uuid5(NAMESPACE_URL, "constructo.spec-import")`, `_id(*parts) = uuid5(_NS, "|".join(map(str, parts)))`, `_get_or_add(model, pk, **fields)` returns `(obj, created)`.
- **Component/Space** (`app/models/homeowner_property.py`): `Component(space_id[FK spaces], name, kind?, status, location?, ...)`; `Space(site_id[FK sites], parent_id?, name, kind[SpaceKind], order)`. A Component belongs to a Site only via its Space (`Component.space_id -> Space.site_id`). `SpaceKind`, `ComponentStatus`, `Space`, `Component` are exported from `app.models`.
- **Profiler** (after Plan 3b): `ProfilerArea(profile_id, area_kind, area_key, space_id?[FK spaces SET NULL], component_id?[FK components SET NULL], recommended_count, ...)`. `ProfilerBrief(profile_id, version, state[BriefState], summary_json[JSONB = the deterministic payload], ...)`. The payload shape (from `app/profiler/brief.py` `build_area_brief_payload`): `{"scope_type": str, "areas": [{"area_key", "confidence", "has_conflict", "dimensions", "themes":[{name,palette,materials}], "material_families":[str], "resolved_conflicts":[...]}]}`. `material_families` are the materials from **approved/adjusted** themes only (human-committed). Brief states: `homeowner_review, revision_requested, architect_review, contractor_brief_ready, approved, locked`. `_load_owned_profile` (company-scope), `_EDIT_ROLES = (owner, pm, architect, supervisor)` exist in the profiler router.
- **Test harness:** `tests/conftest.py` fixtures `client`, `db_session`, `factory` (`.company()`, `.user(company=, role=)`, `.site(company)`). `tests/test_profiler_api.py` `auth(user)`. Spec tests build skeleton inline: `Space(site_id=, name=, kind=SpaceKind.room)` then `Component(space_id=, name=, location=)` (see `tests/test_specs.py` `_room_with_component`). `tests/test_profiler_brief.py` has `_brief_llm()` (the shared FakeLLM canned). Homeowner member setup: `HomeownerMember(site_id=, user_id=, sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active)`.

---

## Conventions (copy exactly)

Models FK-only; `AppError(status, code, message, extra=...)` not HTTPException; `status_code=201` on create; `Schema.model_validate(orm)`; `datetime.now(UTC)`; LLM (n/a here — the bridge has none); ruff CI gate (≤100 char lines), run `uv run ruff check` on every touched file incl. tests; run from `constructo/backend` with `uv`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/profiler/bridge.py` (create) | Pure: `bridge_id(*parts)` (uuid5), `plan_proposals(payload) -> list[dict]` (one proposal per area×material-family) |
| `app/profiler/schemas.py` (modify) | `MaterializeOut` (counts + skipped areas + the created/reused specs) |
| `app/profiler/router.py` (modify) | `POST /briefs/{brief_id}/materialize` — find-or-create Materials + create pending Specs idempotently |
| `tests/test_profiler_bridge.py` (create) | Unit (`plan_proposals`, `bridge_id`) + endpoint (materialize, skip-no-component, idempotency, state gate) + e2e (trigger→…→materialize→specs pending) |

---

## Task 1: Pure bridge helper

**Files:** Create `app/profiler/bridge.py`; Test `tests/test_profiler_bridge.py`.

- [ ] **Step 1: Write the failing tests** — `tests/test_profiler_bridge.py`

```python
"""Profiler -> Spec engine bridge: pure deterministic planning (no LLM, no DB)."""
from app.profiler.bridge import bridge_id, plan_proposals


def test_plan_proposals_enumerates_one_per_area_material_family():
    payload = {"areas": [
        {"area_key": "kitchen", "material_families": ["light oak", "quartz"]},
        {"area_key": "bath", "material_families": []},
    ]}
    out = plan_proposals(payload)
    assert out == [
        {"area_key": "kitchen", "material_name": "light oak", "label": "light oak"},
        {"area_key": "kitchen", "material_name": "quartz", "label": "quartz"},
    ]
    assert plan_proposals({}) == []
    assert plan_proposals({"areas": []}) == []


def test_bridge_id_is_deterministic_and_distinct():
    a = bridge_id("material", "c1", "oak")
    assert a == bridge_id("material", "c1", "oak")  # stable across calls
    assert bridge_id("material", "c1", "teak") != a  # distinct inputs -> distinct id
    assert bridge_id("spec", "c1", "oak") != a       # namespace prefix matters
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_bridge.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.profiler.bridge'`

- [ ] **Step 3: Implement** — `app/profiler/bridge.py`

```python
"""Bridge the Design Profiler's contractor-ready brief into the Spec engine.

Determinism Doctrine: this module is PURE (no LLM, no DB). It enumerates one
material proposal per (area x approved-material-family) from the brief's
deterministic payload, and mints idempotent uuid5 ids so re-running the bridge
never duplicates Material/Spec rows (mirrors app/specs/importer.py)."""
from uuid import NAMESPACE_URL, UUID, uuid5

_NS = uuid5(NAMESPACE_URL, "constructo.profiler-bridge")


def bridge_id(*parts: object) -> UUID:
    """Deterministic uuid5 from natural-key parts (the first part is a type tag)."""
    return uuid5(_NS, "|".join(str(p) for p in parts))


def plan_proposals(payload: dict) -> list[dict]:
    """One proposal per (area, approved material family) from the brief payload.

    The payload is ``ProfilerBrief.summary_json`` (deterministic; material_families
    come only from approved/adjusted themes). Pure — no DB, no LLM."""
    out: list[dict] = []
    for area in payload.get("areas", []):
        for fam in area.get("material_families", []):
            out.append({"area_key": area["area_key"], "material_name": fam, "label": fam})
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_bridge.py -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/bridge.py tests/test_profiler_bridge.py
git commit -m "feat(profiler): pure spec-bridge planner (deterministic, idempotent keys)"
```

---

## Task 2: MaterializeOut schema

**Files:** Modify `app/profiler/schemas.py`.

- [ ] **Step 1: Append** to `app/profiler/schemas.py` (reuse the Spec engine's `SpecOut` so the response is the real spec shape — the bridge is the fusion seam, so the coupling is intentional):

```python
from app.specs.schemas import SpecOut  # noqa: E402  (bridge response reuses the spec shape)


class MaterializeOut(BaseModel):
    materials_created: int
    materials_reused: int
    specs_created: int
    specs_reused: int
    skipped_areas: list[str] = []
    specs: list[SpecOut] = []
```

(If the top-of-file import block is the conventional place, move the `from app.specs.schemas import SpecOut` import there instead of inline and drop the `# noqa`. Prefer top-of-file; only keep it inline if it would create a circular import — verify by running the import check in Step 2.)

- [ ] **Step 2: Lint + import check + commit**

```bash
cd constructo/backend
uv run python -c "from app.profiler.schemas import MaterializeOut; print('ok')"
uv run ruff check app/profiler/schemas.py
git add app/profiler/schemas.py
git commit -m "feat(profiler): MaterializeOut bridge schema"
```
Expected: `ok`; ruff clean. (If the import errored with a circular import, keep the `SpecOut` import inline inside `schemas.py` as shown and re-run.)

---

## Task 3: The materialize endpoint + integration/e2e tests

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_bridge.py`.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_profiler_bridge.py`

```python
from app.main import app
from app.models import (
    Component,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    Space,
    SpaceKind,
    UserRole,
)
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth
from tests.test_profiler_brief import _brief_llm


async def _shared_brief_with_component(client, factory, db_session, *, with_component=True):
    """Build a profile whose kitchen area is (optionally) bound to a real Component,
    approve a theme so 'light oak' flows into the brief, generate it, and drive it
    to contractor_brief_ready. Returns (architect, site, pid, bid, comp_id|None)."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    comp_id = None
    area_payload = {"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}
    if with_component:
        space = Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room)
        db_session.add(space)
        await db_session.flush()
        comp = Component(space_id=space.id, name="Cabinets")
        db_session.add(comp)
        await db_session.flush()
        comp_id = comp.id
        area_payload["component_id"] = str(comp.id)

    created = await client.post("/api/v1/design/profiles", json={
        "site_id": str(site.id), "areas": [area_payload],
        "contributors": [{"role": "co_owner", "is_decision_owner": True}],
    }, headers=auth(architect))
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_id = detail["contributors"][0]["id"]

    r = await client.post("/api/v1/design/references", json={
        "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg",
    }, headers=auth(architect))
    await client.post(f"/api/v1/design/references/{r.json()['id']}/rankings",
        json={"contributor_id": contrib_id, "stars": 5}, headers=auth(architect))
    await client.post(f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))
    themes = (await client.get(
        f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))).json()
    await client.post(f"/api/v1/design/themes/{themes[0]['id']}/decision",
        json={"action": "approve"}, headers=auth(architect))
    bid = (await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))).json()["id"]

    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active))
    await db_session.flush()
    await client.post(f"/api/v1/design/briefs/{bid}/approval",
        json={"action": "send_to_architect"}, headers=auth(owner))
    await client.post(f"/api/v1/design/briefs/{bid}/approval",
        json={"action": "architect_sign_off"}, headers=auth(architect))
    return architect, site, pid, bid, comp_id


async def test_materialize_creates_pending_specs_and_is_idempotent(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, comp_id = await _shared_brief_with_component(
            client, factory, db_session)
        mat = await client.post(f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))
        assert mat.status_code == 201
        body = mat.json()
        assert body["materials_created"] >= 1
        assert body["specs_created"] >= 1
        assert body["skipped_areas"] == []
        spec = next(s for s in body["specs"] if s["label"] == "light oak")
        assert spec["approval_status"] == "pending"
        assert spec["component_id"] == str(comp_id)
        assert spec["qty"] is None and spec["unit_rate"] is None  # never fabricated
        # idempotent: a second run reuses, creates nothing new
        again = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        assert again["specs_created"] == 0 and again["materials_created"] == 0
        assert again["specs_reused"] >= 1
        # the proposed spec is visible in the Spec engine, pending confirmation
        specs = (await client.get(
            f"/api/v1/specs?site_id={site.id}", headers=auth(architect))).json()
        assert any(s["label"] == "light oak" and s["approval_status"] == "pending" for s in specs)
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_materialize_skips_areas_without_a_component(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, _ = await _shared_brief_with_component(
            client, factory, db_session, with_component=False)
        body = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        # material catalog still proposed, but no spec (no component to bind to)
        assert body["materials_created"] >= 1
        assert body["specs_created"] == 0
        assert "kitchen" in body["skipped_areas"]
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_materialize_rejects_unshared_brief(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        # build a brief but DON'T sign it off (stays homeowner_review)
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post("/api/v1/design/profiles", json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}],
            "contributors": [{"role": "co_owner"}]}, headers=auth(architect))
        pid = created.json()["id"]
        bid = (await client.post(
            f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))).json()["id"]
        resp = await client.post(f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "brief_not_ready"
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_bridge.py -v`
Expected: FAIL — 404/405 (route not defined).

- [ ] **Step 3: Implement the endpoint** in `app/profiler/router.py`.

Add imports: `from app.models import Component, Material, Space, Spec` (merge into the existing `from app.models import ...` line — `User, UserRole, HomeownerMember, MemberStatus` are already imported; add `Component, Material, Space, Spec`). Add `from app.profiler.bridge import bridge_id, plan_proposals`. Add `from app.profiler.schemas import MaterializeOut` (merge into the existing schemas import block). `_CONTRACTOR_VISIBLE_STATES` already exists (Plan 3b). `SpecOut` is referenced only via `MaterializeOut` (no direct import needed in the router).

Add the endpoint (place it after `list_brief_approvals`):

```python
@router.post("/briefs/{brief_id}/materialize", response_model=MaterializeOut, status_code=201)
async def materialize_brief(
    brief_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> MaterializeOut:
    """Propose Material + Spec rows (pending) from a SHARED brief's deterministic
    payload. No LLM; quantities left NULL; a human confirms via /specs/{id}/approve.
    Idempotent via uuid5 keys — re-running reuses, never duplicates."""
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    profile = await _load_owned_profile(session, brief.profile_id, user)
    if brief.state not in _CONTRACTOR_VISIBLE_STATES:
        raise AppError(
            409, "brief_not_ready",
            "Materialize a brief only after architect sign-off (contractor_brief_ready+).",
        )

    # areas carry the component binding; the payload carries the approved families
    areas = (
        await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile.id))
    ).scalars().all()
    areas_by_key = {a.area_key: a for a in areas}

    materials_created = materials_reused = specs_created = specs_reused = 0
    skipped: list[str] = []
    created_specs: list[Spec] = []

    for prop in plan_proposals(brief.summary_json or {}):
        area = areas_by_key.get(prop["area_key"])
        # find-or-create the company Material (catalog) by deterministic key
        mat_id = bridge_id("material", profile.company_id, prop["material_name"])
        material = await session.get(Material, mat_id)
        if material is None:
            material = Material(
                id=mat_id, company_id=profile.company_id, name=prop["material_name"],
                category="design-brief",
            )
            session.add(material)
            await session.flush()
            materials_created += 1
        else:
            materials_reused += 1

        # a Spec needs a real Component on the profile's site; skip the area if none
        component_id = await _resolve_area_component(session, area, profile.site_id)
        if component_id is None:
            if prop["area_key"] not in skipped:
                skipped.append(prop["area_key"])
            continue

        spec_id = bridge_id("spec", component_id, prop["label"])
        spec = await session.get(Spec, spec_id)
        if spec is None:
            spec = Spec(
                id=spec_id, company_id=profile.company_id, site_id=profile.site_id,
                component_id=component_id, material_id=material.id, label=prop["label"],
                notes="Proposed from the design brief — confirm.",
            )
            session.add(spec)
            await session.flush()
            specs_created += 1
        else:
            specs_reused += 1
        created_specs.append(spec)

    await session.commit()
    for s in created_specs:
        await session.refresh(s)
    return MaterializeOut(
        materials_created=materials_created, materials_reused=materials_reused,
        specs_created=specs_created, specs_reused=specs_reused,
        skipped_areas=skipped, specs=[SpecOut.model_validate(s) for s in created_specs],
    )
```

Add the component-resolution helper near `_brief_payload` (it validates the area's component belongs to the profile's site, defending against stale/cross-site FKs):

```python
async def _resolve_area_component(
    session: AsyncSession, area: ProfilerArea | None, site_id: UUID
) -> UUID | None:
    """The area's bound Component id IF it exists and belongs to ``site_id`` (via its
    Space). Returns None when the area has no component or the component is off-site."""
    if area is None or area.component_id is None:
        return None
    component = await session.get(Component, area.component_id)
    if component is None:
        return None
    space = await session.get(Space, component.space_id)
    if space is None or space.site_id != site_id:
        return None
    return component.id
```

The `MaterializeOut.model_validate`-style return uses `SpecOut`; ensure `SpecOut` is importable from `app.profiler.schemas` (it is, via Task 2). The router builds `SpecOut` through `MaterializeOut`'s field type, so import `SpecOut` in the router too: add `from app.specs.schemas import SpecOut` near the other imports (it is used directly in the return).

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_bridge.py -v`
Expected: PASS (all bridge tests)

- [ ] **Step 5: Commit**

```bash
cd constructo/backend
uv run ruff check app/profiler tests/test_profiler_bridge.py
git add app/profiler/router.py tests/test_profiler_bridge.py
git commit -m "feat(profiler): materialize brief -> pending Material+Spec rows (idempotent bridge)"
```
Expected: ruff clean.

---

## Task 4: The contractor "Build Design Profile" trigger — verify thin path

**Files:** Test append to `tests/test_profiler_bridge.py`.

> The trigger is the EXISTING `POST /api/v1/design/profiles` (contractor-side, `_EDIT_ROLES`). Per the handoff it must stay thin so the coming contractor userflow plugs into the same endpoint with zero backend change. This task adds NO new endpoint — it pins the full contractor round-trip with one e2e test (trigger → intake → theme → brief → sign-off → materialize → pending specs), proving the seam.

- [ ] **Step 1: Write the e2e test** — append to `tests/test_profiler_bridge.py`

```python
async def test_contractor_trigger_to_materialize_e2e(client, factory, db_session):
    """The full contractor seam: POST /profiles (the 'Build Design Profile' trigger)
    -> rank -> approve theme -> brief -> homeowner+architect sign-off -> materialize
    -> a pending Spec lands in the Spec engine ready for human confirmation."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, comp_id = await _shared_brief_with_component(
            client, factory, db_session)
        assert pid and bid and comp_id  # the trigger created a usable profile
        body = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        assert body["specs_created"] >= 1
        # confirm one of the proposed specs via the EXISTING spec-engine approve path
        spec_id = body["specs"][0]["id"]
        approved = await client.post(f"/api/v1/specs/{spec_id}/approve",
            json={"status": "approved"}, headers=auth(architect))
        assert approved.status_code == 200 and approved.json()["approval_status"] == "approved"
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_bridge.py -v`
Expected: PASS (proves the trigger→bridge→confirm seam end-to-end).

- [ ] **Step 3: Commit**

```bash
git add tests/test_profiler_bridge.py
git commit -m "test(profiler): contractor trigger -> materialize -> spec-approve e2e"
```

---

## Task 5: Full suite + lint (Production-Bar gate)

**Files:** none (verification).

- [ ] **Step 1: Profiler + specs + materials suites**

Run:
```bash
cd constructo/backend
uv run pytest tests/test_profiler_*.py tests/test_specs.py tests/test_spec_*.py tests/test_materials.py -q
```
Expected: all green (the bridge must not regress the spec engine).

- [ ] **Step 2: Lint + app import + full suite**

Run:
```bash
cd constructo/backend
uv run ruff check app/profiler tests/test_profiler_bridge.py
uv run python -c "from app.main import app; print('ok')"
uv run pytest -q
```
Expected: ruff clean; `ok`; full suite green.

- [ ] **Step 3: Commit (if any fixups)**

```bash
git add -A app/profiler tests/test_profiler_bridge.py
git commit -m "chore(profiler): lint spec-bridge" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage (vs spec §9 "The Spec-engine bridge" + handoff §7 Plan 5):**
- §9 contractor-ready brief → proposed `Material` + `Spec` (`approval_status=pending`): `materialize_brief` (Task 3) ✓; reuses the brief's **deterministic** `summary_json` (approved material families), not the LLM prose ✓.
- §9 same propose→confirm pattern as the vision-extraction: rows land `pending`, human confirms via existing `POST /specs/{id}/approve` — pinned by the e2e (Task 4) ✓.
- Handoff §7 contractor "Build Design Profile" trigger = the existing thin `POST /profiles`; pinned e2e, no new backend (Task 4) ✓.
- Determinism: NO LLM in the bridge; `qty`/`unit_rate` left NULL (asserted in Task 3); `pending` default; idempotent uuid5 keys ✓.

**Placeholder scan:** none — every step has runnable code + commands + expected output.

**Type consistency:** `plan_proposals(payload) -> list[dict]` (keys `area_key`/`material_name`/`label`) consumed identically in the endpoint. `bridge_id(*parts) -> UUID` used for both material and spec keys. `_resolve_area_component(session, area, site_id) -> UUID | None`. `MaterializeOut` field names match the endpoint's return kwargs; `SpecOut` reused from the spec engine. `Spec`/`Material`/`Component`/`Space` FK fields match the models (Spec needs `company_id, site_id, component_id`; Material needs `company_id, name`).

**Open follow-ups (non-blocking, note for later):** the bridge skips areas without a `Component` — a future enhancement could auto-create a Component from `area.space_id`/`area_key` (the importer's pattern), but v1 stays honest (Material proposed, Spec skipped, area reported). The `material_id`-less path is not used (we always create/reuse a Material first).

---

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks.
2. **Inline Execution** — tasks in-session with checkpoints.
