# Design Profiler — Brief Generation + Membrane Matrix (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Design Profiler engine with versioned, audience-rendered **structured briefs** (homeowner / architect / contractor renderings), an **approval state-machine**, an AI **clarification interview**, and — the hard part 3a deferred — the **homeowner membrane matrix** (cross-role profile access + owner/co_owner-only approval + contractor-sees-only-the-contractor-rendering-of-an-approved-brief).

**Architecture:** Additive — four new `profiler_*` tables + three enums + a new pure/LLM helper module `app/profiler/brief.py` + new endpoints on the existing `app/profiler/router.py`. The trust core holds: deterministic Python gathers every number/material/count into a structured payload; the LLM only narrates prose per audience; `confidence` always comes from the reducer. The membrane reuses the proven homeowner-side gate (`member_sub_role` + `can_approve`) and a new cross-role loader that mirrors the existing `_can_access_site` pattern. All routes stay Labs-gated (the router is already inside `if settings.enable_labs:` in `main.py`).

**Tech Stack:** FastAPI, async SQLAlchemy 2.0, Postgres+JSONB, Alembic, Pydantic v2, pytest-asyncio (auto), `app.extraction.llm` (`complete` + `FakeLLMClient`). Run from `constructo/backend` with `uv`. Postgres on `:5433`. **Base branch: this worktree off `main` (HEAD `76290ff`)** — Plan 3a is already merged; do NOT stack.

**Cross-role access — RESOLVED (investigated before planning):** Homeowner Users **share the contractor's `company_id`** — `POST /homeowner/join` creates the User with `company_id = site.company_id` (`app/homeowner/router.py:367`; confirmed by the `ctx` fixture in `tests/homeowner/conftest.py`). Therefore the existing `_load_owned_profile` company-scope check **passes for homeowners but is too permissive** (a homeowner on site A could read site B's profile in the same company). Part II adds `_load_accessible_profile`, which — for `role == homeowner` — additionally requires an active membership on the profile's `site_id` (mirroring `app/homeowner/router.py:325` `_can_access_site`), while contractor-side roles keep company-scope.

**Conventions (from the engine code — copy exactly):** models FK-only (no `relationship()`), `Mapped[...]`/`mapped_column`, named enums `SAEnum(X, name="...")`, JSONB columns, `Numeric(4,3)` confidence, `func.now()` timestamps, UUID PK `PgUUID(as_uuid=True), default=uuid4`; errors via `AppError(status, code, message, extra=...)` (NOT `HTTPException`); `status_code=201` on create; responses via `Schema.model_validate(orm)` with `ConfigDict(from_attributes=True)`; `datetime.now(UTC)` (`from datetime import UTC`); LLM via `Depends(get_llm)`, overridden in tests with `app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=...)` inside `try/finally`; LLM calls fail-safe (`try/except Exception` + `logger.exception`, degrade to empty, never 500); migrations hand-drop named enums on downgrade; autogenerate emits **spurious index-drops for pre-existing tables (known drift)** — strip them, keep only the new tables.

---

## What exists on `main` (the contract this plan EXTENDS)

- **Models** `app/models/profiler.py`: `ProfilerProfile(company_id, site_id, scope_type, status, created_by, ...)`, `ProfilerArea(profile_id, area_kind, area_key, recommended_count, status, confidence, has_conflict, taste_model, ...)`, `ProfilerContributor`, `ProfilerReference`, `ProfilerRanking`, `ProfilerReferenceAttributes`, `ProfilerTheme(status∈ThemeStatus)`, `ProfilerConflict(resolution_status∈ConflictStatus)`. Enums incl. `ProfileStatus` (13 states), `ContributorRole`, `ReferenceSource`.
- **Reducer** `app/profiler/taste.py` (PURE): `build_taste_model(rankings, attributes, recommended_count) -> {dimensions, ranked_count, recommended_count, confidence, conflicts, has_conflict}`.
- **Router** `app/profiler/router.py`: `_load_owned_profile(session, profile_id, user)` (company-scope), `_area_signals(session, area_id) -> (rankings, attrs)`, `_sync_conflicts(...)`; `_EDIT_ROLES = (owner, pm, architect, supervisor)`; endpoints for profiles/areas/references/rankings/taste/themes/conflicts. `get_llm` from `app.profiler.extraction`.
- **LLM** `app/extraction/llm.py`: `await llm.complete(system, user, json_schema) -> dict`; `FakeLLMClient(canned=...)` records `.calls` and returns `canned`.
- **Membrane primitives** `app/homeowner/authority.py` (`APPROVERS`, `can_approve(sub_role)`), `app/homeowner/scoping.py` (`member_sub_role(session, user, site_id) -> HomeownerSubRole | None`, `homeowner_site_ids(session, user) -> list[UUID]`). The canonical approve gate idiom is `app/homeowner/router.py:1989` `respond_to_decision`; the canonical cross-role site-access pattern is `app/homeowner/router.py:325` `_can_access_site`.
- **Test harness** `tests/conftest.py` fixtures `client`, `db_session`, `factory` (`.company()`, `.user(company=, role=)`, `.site(company)`). `tests/test_profiler_api.py` has `auth(user)` + `_profile_with_area_and_two_contributors(client, factory) -> (architect, pid, area_id, contrib_ids)`. Homeowner member setup pattern: `tests/homeowner/conftest.py` `ctx` fixture (creates `factory.user(company=company, role=UserRole.homeowner)` + an active `HomeownerMember(site_id=, user_id=, sub_role=, status=MemberStatus.active)`).

**Migrations:** `107430e27c2c` (foundation) → `7c55e0bf1599` (themes/conflicts). **New 3b migration `down_revision = '7c55e0bf1599'`.**

---

## The brief state machine (designed here — implement exactly)

`ProfilerBrief.state ∈ BriefState`:

```
(generate) ─────────────► homeowner_review
homeowner_review ──request_changes(owner/co_owner)──► revision_requested
homeowner_review ──send_to_architect(owner/co_owner)─► architect_review
architect_review ──request_changes(owner/co_owner)──► revision_requested
architect_review ──architect_sign_off(architect)────► contractor_brief_ready
contractor_brief_ready ──approve(owner/co_owner)─────► approved
approved ──contractor_received(contractor _EDIT_ROLES)► locked
revision_requested ──(POST /brief regenerate)───────► (new version in homeowner_review)
```

- **`BriefState`** = `homeowner_review, revision_requested, architect_review, contractor_brief_ready, approved, locked`. (The spec §4④ also names `draft`; v1 generates **directly into `homeowner_review`** — there is no separate save-draft step — so `draft` is intentionally omitted. Documented deviation; add later only if a save-draft flow is needed.)
- **`BriefAudience`** = `homeowner, architect, contractor`.
- **`BriefAction`** = `approve, request_changes, send_to_architect, architect_sign_off, contractor_received`.
- An action that is illegal from the current state → `AppError(409, "invalid_transition", ...)`.
- Every committing action writes a `ProfilerBriefApproval` row (named actor + role).

**Authority per action (the membrane):**
| action | who | gate |
|---|---|---|
| `request_changes`, `send_to_architect`, `approve` | homeowner **primary_owner/co_owner** | `member_sub_role(site_id)` + `can_approve`; else `403 approve_forbidden` `{can_comment: true}` |
| `architect_sign_off` | contractor-side **architect** | `user.role is UserRole.architect` (+ company-scope via loader); else 403 |
| `contractor_received` | contractor-side **`_EDIT_ROLES`** | `user.role in _EDIT_ROLES`; else 403 |

**Audience visibility on `GET /brief?audience=` (the membrane):**
- `homeowner` role → may read any audience of *their own* accessible brief (it is their data).
- `architect` role → may read `architect` or `contractor` audiences.
- other contractor-side roles (owner/pm/supervisor/…) = "**the contractor**" → may read **only** `contractor` audience, and **only** when `state ∈ {contractor_brief_ready, approved, locked}`; otherwise `403 brief_not_shared`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/profiler.py` (modify) | Append `BriefState`, `BriefAudience`, `BriefAction` enums + `ProfilerClarification`, `ProfilerBrief`, `ProfilerBriefRendering`, `ProfilerBriefApproval` models |
| `app/models/__init__.py` (modify) | Register/export the 7 new names |
| `alembic/versions/<rev>_profiler_brief_membrane.py` (generate) | Migration (hand-drop the 3 new enums on downgrade) |
| `app/profiler/brief.py` (create) | Deterministic `gather_brief_payload` shaping + LLM `narrate_brief` (per-audience prose) + `generate_clarifications` |
| `app/profiler/schemas.py` (modify) | `BriefOut`, `BriefRenderingOut`, `BriefDetailOut`, `BriefApprovalIn`, `BriefApprovalOut`, `ClarificationOut`, `ClarificationAnswerIn` |
| `app/profiler/router.py` (modify) | `_load_accessible_profile`, `_brief_payload`, brief generate/get, approval, clarifications generate/list/answer; migrate homeowner-reachable READS to `_load_accessible_profile` |
| `tests/test_profiler_brief.py` (create) | Part I: brief gen + renderings + determinism + state machine + clarifications |
| `tests/test_profiler_membrane.py` (create) | Part II: the cross-role visibility test matrix |

---
---

# PART I — Plan 3b-i: brief generation + renderings + state machine + clarifications

> Company-scoped, like Plan 3a. The membrane gate is layered on in Part II.

## Task 1: Models + enums + migration

**Files:** Modify `app/models/profiler.py`, `app/models/__init__.py`; generate a migration.

- [ ] **Step 1: Append the enums + models** to the END of `app/models/profiler.py`. The imports it needs (`String, Text, JSONB, Numeric, SAEnum, DateTime, ForeignKey, func, datetime, UUID, uuid4, PgUUID, Mapped, mapped_column, StrEnum, Base`) are already imported at the top of that file.

```python
class BriefState(StrEnum):
    homeowner_review = "homeowner_review"
    revision_requested = "revision_requested"
    architect_review = "architect_review"
    contractor_brief_ready = "contractor_brief_ready"
    approved = "approved"
    locked = "locked"


class BriefAudience(StrEnum):
    homeowner = "homeowner"
    architect = "architect"
    contractor = "contractor"


class BriefAction(StrEnum):
    approve = "approve"
    request_changes = "request_changes"
    send_to_architect = "send_to_architect"
    architect_sign_off = "architect_sign_off"
    contractor_received = "contractor_received"


class ProfilerClarification(Base):
    __tablename__ = "profiler_clarifications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="CASCADE"), nullable=True
    )
    contributor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_contributors.id", ondelete="SET NULL"), nullable=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_attribution: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    asked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProfilerBrief(Base):
    __tablename__ = "profiler_briefs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False, server_default="1")
    state: Mapped[BriefState] = mapped_column(
        SAEnum(BriefState, name="profiler_brief_state"),
        nullable=False,
        server_default=BriefState.homeowner_review.value,
    )
    summary_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerBriefRendering(Base):
    __tablename__ = "profiler_brief_renderings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    brief_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_briefs.id", ondelete="CASCADE"), nullable=False
    )
    audience: Mapped[BriefAudience] = mapped_column(
        SAEnum(BriefAudience, name="profiler_brief_audience"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String(16), nullable=False, server_default="whole_house")
    area_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="SET NULL"), nullable=True
    )
    content_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerBriefApproval(Base):
    __tablename__ = "profiler_brief_approvals"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    brief_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_briefs.id", ondelete="CASCADE"), nullable=False
    )
    actor_member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("homeowner_members.id", ondelete="SET NULL"), nullable=True
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[BriefAction] = mapped_column(
        SAEnum(BriefAction, name="profiler_brief_action"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Register** in `app/models/__init__.py`. Add to the existing `from app.models.profiler import (...)` block (keep it alphabetised) the names `BriefAction`, `BriefAudience`, `BriefState`, `ProfilerBrief`, `ProfilerBriefApproval`, `ProfilerBriefRendering`, `ProfilerClarification`; add the same seven to the `# Design Profiler engine` section of `__all__`.

- [ ] **Step 3: Sanity import**

Run: `cd constructo/backend && uv run python -c "import app.models as m; print(m.ProfilerBrief.__tablename__, m.ProfilerBriefRendering.__tablename__, m.ProfilerBriefApproval.__tablename__, m.ProfilerClarification.__tablename__)"`
Expected: `profiler_briefs profiler_brief_renderings profiler_brief_approvals profiler_clarifications`

- [ ] **Step 4: Generate the migration**

Run: `cd constructo/backend && uv run alembic revision --autogenerate -m "profiler brief + clarifications + membrane"`
Expected: a new revision creating the 4 tables + 3 enums. **Confirm `down_revision = '7c55e0bf1599'`.** Strip any spurious `op.drop_index(...)`/`op.create_index(...)` lines that touch tables OTHER than the four new ones (known autogenerate drift).

- [ ] **Step 5: Hand-edit `downgrade()`** to drop the three new named enums (autogenerate won't). After the `op.drop_table(...)` calls add:

```python
from sqlalchemy.dialects import postgresql

for enum_name in ("profiler_brief_action", "profiler_brief_audience", "profiler_brief_state"):
    postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
```

(Move `from sqlalchemy.dialects import postgresql` to the top-level imports if autogenerate didn't already add it.)

- [ ] **Step 6: Verify reversible + lint**

Run:
```bash
cd constructo/backend
uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
uv run ruff check app/models/profiler.py app/models/__init__.py alembic/versions/
```
Expected: all migrations succeed; ruff clean (wrap any long migration lines).

- [ ] **Step 7: Commit**

```bash
git add app/models/profiler.py app/models/__init__.py alembic/versions/
git commit -m "feat(profiler): brief + renderings + approvals + clarifications tables"
```

---

## Task 2: Brief helper — deterministic payload + LLM narration + clarifications (pure-friendly unit tests)

**Files:** Create `app/profiler/brief.py`; Test `tests/test_profiler_brief.py`.

- [ ] **Step 1: Write the failing tests** — `tests/test_profiler_brief.py`

```python
"""Brief narration + clarifications: deterministic payload shaping + LLM proposes
(FakeLLM, no spend). The LLM phrases prose only; every number/material comes from
the deterministic payload."""
from app.extraction.llm import FakeLLMClient
from app.profiler.brief import (
    PROFILER_BRIEF_SYSTEM,
    build_area_brief_payload,
    generate_clarifications,
    narrate_brief,
)


def test_build_area_brief_payload_keeps_reducer_numbers_and_approved_only():
    taste = {"dimensions": {"style": {"minimal": 2.0}}, "confidence": 1.0, "has_conflict": False}
    themes = [
        {"name": "Soft Minimal", "palette": ["oak"], "materials": ["light oak"], "status": "approved"},
        {"name": "Rejected One", "palette": [], "materials": ["chrome"], "status": "rejected"},
    ]
    conflicts = [
        {"dimension": "colors", "value": "dark", "decision_note": "go light", "resolution_status": "resolved"},
        {"dimension": "style", "value": "ornate", "decision_note": None, "resolution_status": "open"},
    ]
    payload = build_area_brief_payload("kitchen", taste, themes, conflicts)
    assert payload["area_key"] == "kitchen"
    assert payload["confidence"] == 1.0  # straight from the reducer
    # only APPROVED/adjusted themes flow into the brief; rejected dropped:
    assert [t["name"] for t in payload["themes"]] == ["Soft Minimal"]
    assert "light oak" in payload["material_families"]
    # only RESOLVED/deferred conflicts surface; open ones excluded:
    assert [c["value"] for c in payload["resolved_conflicts"]] == ["dark"]


async def test_narrate_brief_calls_complete_per_audience_and_returns_prose():
    canned = {"headline": "A calm, warm kitchen", "summary": "Light woods and soft tones.",
              "sections": [{"title": "Materials", "body": "Light oak throughout."}]}
    llm = FakeLLMClient(canned=canned)
    payload = {"scope_type": "rooms", "areas": [{"area_key": "kitchen", "confidence": 1.0,
               "material_families": ["light oak"], "themes": [{"name": "Soft Minimal"}],
               "resolved_conflicts": []}]}
    out = await narrate_brief(llm, "contractor", payload)
    assert out["headline"] == "A calm, warm kitchen"
    # the audience is named in the prompt; it used complete() (not vision):
    assert "contractor" in llm.calls[-1]["user"].lower() or "contractor" in llm.calls[-1]["system"].lower()
    assert "image_url" not in llm.calls[-1]
    assert PROFILER_BRIEF_SYSTEM  # system prompt exists


async def test_generate_clarifications_returns_questions_from_signals():
    canned = {"questions": ["Do you prefer matte or glossy finishes?",
                            "Warmer or cooler whites for the cabinets?"]}
    llm = FakeLLMClient(canned=canned)
    taste = {"dimensions": {"style": {"minimal": 0.5, "ornate": -0.5}}, "confidence": 0.3,
             "has_conflict": True}
    qs = await generate_clarifications(llm, "kitchen", taste)
    assert len(qs) == 2
    assert qs[0].startswith("Do you prefer")
    assert "minimal" in llm.calls[-1]["user"]  # grounded in the taste signals
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.profiler.brief'`

- [ ] **Step 3: Implement** — `app/profiler/brief.py`

```python
"""Brief narration + clarifications for the Design Profiler.

Determinism Doctrine: deterministic Python gathers every number / material / count
into a structured payload; the LLM only NARRATES prose per audience. ``confidence``
always originates from the reducer (taste.py), never the model. All LLM calls are
fail-safe at the call site (router) so narration never 500s a request.
"""
from app.extraction.llm import LLMClient

PROFILER_BRIEF_SYSTEM = (
    "You are an interior design assistant writing a design brief for one specific audience. "
    "You are given a STRUCTURED payload (areas, approved themes, material families, resolved "
    "decisions, and a numeric confidence). Write clear, reassuring prose that REFLECTS the "
    "payload exactly. Never invent materials, numbers, or preferences not present in the payload. "
    "Never output a confidence number yourself. Audiences: 'homeowner' = warm and reassuring, "
    "plain language; 'architect' = design intent, room priorities, open questions, where AI "
    "confidence is low; 'contractor' = finish expectations, material families, procurement "
    "dependencies, cost-impact flags, pending approvals, room-wise execution notes."
)

PROFILER_BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
            },
        },
    },
}

PROFILER_CLARIFY_SYSTEM = (
    "You are an interior design assistant. Given a homeowner's aggregated taste signals for one "
    "area (liked/disliked style/material/color values, a confidence score, and whether co-owners "
    "conflict), propose 1-4 short, specific clarifying questions that would raise confidence or "
    "resolve a disagreement. Ground every question in the given signals. Do not ask generic "
    "questions. Do not output anything except the questions."
)

PROFILER_CLARIFY_SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {"type": "string"}}},
}

_KEEP_THEME_STATUSES = {"approved", "adjusted"}
_KEEP_CONFLICT_STATUSES = {"resolved", "deferred_to_architect"}


def build_area_brief_payload(
    area_key: str, taste_model: dict, themes: list[dict], conflicts: list[dict]
) -> dict:
    """Deterministically shape ONE area into the structured brief payload.

    Only APPROVED/adjusted themes and RESOLVED/deferred conflicts flow into the brief
    (proposals and open disagreements are not yet committed). ``confidence`` is copied
    straight from the reducer's taste model.
    """
    kept_themes = [t for t in themes if t.get("status") in _KEEP_THEME_STATUSES]
    material_families: list[str] = []
    for t in kept_themes:
        for m in t.get("materials") or []:
            if m not in material_families:
                material_families.append(m)
    resolved = [
        {"dimension": c.get("dimension"), "value": c.get("value"),
         "decision_note": c.get("decision_note")}
        for c in conflicts
        if c.get("resolution_status") in _KEEP_CONFLICT_STATUSES
    ]
    return {
        "area_key": area_key,
        "confidence": taste_model.get("confidence", 0.0),
        "has_conflict": taste_model.get("has_conflict", False),
        "dimensions": taste_model.get("dimensions", {}),
        "themes": [{"name": t.get("name"), "palette": t.get("palette") or [],
                    "materials": t.get("materials") or []} for t in kept_themes],
        "material_families": material_families,
        "resolved_conflicts": resolved,
    }


def _payload_summary_text(audience: str, payload: dict) -> str:
    """Deterministic, human-readable rendering of the payload for the LLM prompt."""
    lines = [f"Audience: {audience}", f"Scope: {payload.get('scope_type', 'whole_house')}"]
    for area in payload.get("areas", []):
        lines.append(f"\nArea: {area.get('area_key')} (confidence {area.get('confidence')})")
        if area.get("material_families"):
            lines.append(f"  Material families: {', '.join(area['material_families'])}")
        for t in area.get("themes", []):
            lines.append(f"  Theme: {t.get('name')}")
        for c in area.get("resolved_conflicts", []):
            lines.append(f"  Resolved: {c.get('dimension')}={c.get('value')} ({c.get('decision_note')})")
    return "\n".join(lines)


async def narrate_brief(llm: LLMClient, audience: str, payload: dict) -> dict:
    """LLM narrates the audience-specific prose for a structured payload.

    Returns {headline, summary, sections}. NEVER includes numbers/materials the
    payload did not supply (the router composes the persisted content from the
    deterministic payload + this prose)."""
    user = _payload_summary_text(audience, payload)
    out = await llm.complete(PROFILER_BRIEF_SYSTEM, user, PROFILER_BRIEF_SCHEMA)
    return {
        "headline": out.get("headline", ""),
        "summary": out.get("summary", ""),
        "sections": out.get("sections", []),
    }


def _clarify_summary_text(area_key: str, taste_model: dict) -> str:
    lines = [f"Area: {area_key}", f"Confidence: {taste_model.get('confidence', 0.0)}",
             f"Has conflict: {taste_model.get('has_conflict', False)}"]
    for dim, values in (taste_model.get("dimensions") or {}).items():
        liked = sorted([v for v, s in values.items() if s > 0], key=lambda v: -values[v])
        disliked = sorted([v for v, s in values.items() if s < 0], key=lambda v: values[v])
        if liked:
            lines.append(f"Liked {dim}: {', '.join(liked)}")
        if disliked:
            lines.append(f"Disliked {dim}: {', '.join(disliked)}")
    return "\n".join(lines)


async def generate_clarifications(llm: LLMClient, area_key: str, taste_model: dict) -> list[str]:
    """LLM proposes grounded clarifying questions for a low-confidence/conflicting area."""
    user = _clarify_summary_text(area_key, taste_model)
    out = await llm.complete(PROFILER_CLARIFY_SYSTEM, user, PROFILER_CLARIFY_SCHEMA)
    return [q for q in (out.get("questions") or []) if isinstance(q, str) and q.strip()]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: PASS (all three tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/brief.py tests/test_profiler_brief.py
git commit -m "feat(profiler): brief payload shaping + narration + clarifications helper"
```

---

## Task 3: Schemas

**Files:** Modify `app/profiler/schemas.py`.

- [ ] **Step 1: Append** these to `app/profiler/schemas.py` (the file already imports `BaseModel, ConfigDict, Field`, `UUID`, `datetime`):

```python
class BriefRenderingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    audience: str
    scope: str
    area_id: UUID | None = None
    content_json: dict = {}
    created_at: datetime


class BriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    profile_id: UUID
    version: int
    state: str
    created_at: datetime


class BriefDetailOut(BriefOut):
    renderings: list[BriefRenderingOut] = []


class BriefApprovalIn(BaseModel):
    action: str = Field(
        pattern="^(approve|request_changes|send_to_architect|architect_sign_off|contractor_received)$"
    )
    note: str | None = None


class BriefApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    brief_id: UUID
    actor_user_id: UUID | None = None
    actor_member_id: UUID | None = None
    actor_role: str
    action: str
    note: str | None = None
    created_at: datetime


class ClarificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID | None = None
    question: str
    answer: str | None = None
    asked_at: datetime
    answered_at: datetime | None = None


class ClarificationAnswerIn(BaseModel):
    answer: str = Field(min_length=1)
```

- [ ] **Step 2: Lint + commit**

```bash
cd constructo/backend && uv run ruff check app/profiler/schemas.py
git add app/profiler/schemas.py
git commit -m "feat(profiler): brief + clarification schemas"
```

---

## Task 4: Brief generation endpoint (`POST /profiles/{id}/brief`)

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_brief.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_brief.py`

```python
from app.main import app
from app.profiler.extraction import get_llm
from tests.test_profiler_api import _profile_with_area_and_two_contributors, auth


def _brief_llm() -> FakeLLMClient:
    # One canned dict serves vision-extraction (on add_reference), theme narration,
    # brief narration, and clarifications — FakeLLM returns it for every complete()/
    # complete_vision() call; each helper reads only the keys it needs.
    return FakeLLMClient(canned={
        "headline": "A calm, warm space", "summary": "Light woods and soft tones.",
        "sections": [{"title": "Materials", "body": "Light oak throughout."}],
        "themes": [{"name": "Soft Minimal", "palette": ["beige"], "materials": ["light oak"],
                    "rationale": "warm minimal"}],
        "questions": ["Matte or glossy?"],
        "colors": ["dark"], "style": "minimal", "confidence": 0.9,
    })


async def _seed_ranked_area(client, factory):
    architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)
    ref_ids = []
    for _ in range(2):
        r = await client.post("/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/x.jpg"}, headers=auth(architect))
        ref_ids.append(r.json()["id"])
    for ref_id in ref_ids:
        await client.post(f"/api/v1/design/references/{ref_id}/rankings",
            json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))
        await client.post(f"/api/v1/design/references/{ref_id}/rankings",
            json={"contributor_id": contrib_ids[1], "stars": 5}, headers=auth(architect))
    return architect, pid, area_id, contrib_ids


async def test_generate_brief_snapshots_three_renderings_with_deterministic_numbers(client, factory):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, pid, area_id, _ = await _seed_ranked_area(client, factory)
        # approve a theme so it flows into the brief
        await client.post(f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))
        themes = (await client.get(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))).json()
        await client.post(f"/api/v1/design/themes/{themes[0]['id']}/decision",
            json={"action": "approve"}, headers=auth(architect))

        gen = await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))
        assert gen.status_code == 201
        brief = gen.json()
        assert brief["version"] == 1
        assert brief["state"] == "homeowner_review"
        assert len(brief["renderings"]) == 3
        auds = {r["audience"] for r in brief["renderings"]}
        assert auds == {"homeowner", "architect", "contractor"}
        # determinism: confidence in every rendering's content == reducer's 1.0, not the LLM's 0.9
        for r in brief["renderings"]:
            areas = r["content_json"]["areas"]
            assert areas[0]["confidence"] == 1.0
        # the contractor rendering carries material families straight from the approved theme
        contractor = next(r for r in brief["renderings"] if r["audience"] == "contractor")
        assert "light oak" in contractor["content_json"]["areas"][0]["material_families"]
        # second generate bumps the version
        gen2 = await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))
        assert gen2.json()["version"] == 2
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py::test_generate_brief_snapshots_three_renderings_with_deterministic_numbers -v`
Expected: FAIL — 404/405 (route not defined).

- [ ] **Step 3: Add imports + payload helper + endpoint** to `app/profiler/router.py`.

Extend the `app.models.profiler` import to include `BriefAction, BriefAudience, BriefState, ProfilerBrief, ProfilerBriefApproval, ProfilerBriefRendering, ProfilerClarification`. Extend the schemas import to include `BriefApprovalIn, BriefApprovalOut, BriefDetailOut, BriefOut, BriefRenderingOut, ClarificationAnswerIn, ClarificationOut`. Add `from app.profiler.brief import build_area_brief_payload, generate_clarifications, narrate_brief`. Add `from sqlalchemy import func` to the existing sqlalchemy import line if not present (used for max version).

Add this deterministic payload helper near `_area_signals`:

```python
async def _brief_payload(session: AsyncSession, profile: ProfilerProfile) -> dict:
    """Deterministically gather the whole-profile structured brief payload.

    For each area: the reducer's taste model + APPROVED/adjusted themes + RESOLVED
    conflicts. No LLM here — every number/material is computed."""
    areas = (
        await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile.id))
    ).scalars().all()
    area_payloads: list[dict] = []
    for area in areas:
        rankings, attrs = await _area_signals(session, area.id)
        model = build_taste_model(rankings, attrs, area.recommended_count)
        themes = (
            await session.execute(select(ProfilerTheme).where(ProfilerTheme.area_id == area.id))
        ).scalars().all()
        conflicts = (
            await session.execute(select(ProfilerConflict).where(ProfilerConflict.area_id == area.id))
        ).scalars().all()
        area_payloads.append(
            build_area_brief_payload(
                area.area_key,
                model,
                [{"name": t.name, "palette": t.palette, "materials": t.materials,
                  "status": t.status.value if hasattr(t.status, "value") else t.status}
                 for t in themes],
                [{"dimension": c.dimension, "value": c.value, "decision_note": c.decision_note,
                  "resolution_status": c.resolution_status.value
                  if hasattr(c.resolution_status, "value") else c.resolution_status}
                 for c in conflicts],
            )
        )
    return {"scope_type": profile.scope_type.value
            if hasattr(profile.scope_type, "value") else profile.scope_type,
            "areas": area_payloads}


def _brief_detail(brief: ProfilerBrief, renderings: list[ProfilerBriefRendering]) -> BriefDetailOut:
    out = BriefDetailOut.model_validate(brief)
    out.renderings = [BriefRenderingOut.model_validate(r) for r in renderings]
    return out
```

Then the generate endpoint:

```python
@router.post("/profiles/{profile_id}/brief", response_model=BriefDetailOut, status_code=201)
async def generate_brief(
    profile_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> BriefDetailOut:
    profile = await _load_owned_profile(session, profile_id, user)
    payload = await _brief_payload(session, profile)

    next_version = (
        await session.scalar(
            select(func.coalesce(func.max(ProfilerBrief.version), 0)).where(
                ProfilerBrief.profile_id == profile_id
            )
        )
    ) + 1
    brief = ProfilerBrief(
        profile_id=profile_id, version=next_version,
        state=BriefState.homeowner_review, summary_json=payload, created_by=user.id,
    )
    session.add(brief)
    await session.flush()

    renderings: list[ProfilerBriefRendering] = []
    for audience in (BriefAudience.homeowner, BriefAudience.architect, BriefAudience.contractor):
        try:
            prose = await narrate_brief(llm, audience.value, payload)
        except Exception:  # narration must never 500 the request
            logger.exception("profiler: brief narration failed for %s/%s", profile_id, audience)
            prose = {"headline": "", "summary": "", "sections": []}
        # content = deterministic payload (numbers/materials) + LLM prose (phrasing only)
        content = {"areas": payload["areas"], "scope_type": payload["scope_type"], "narrative": prose}
        rendering = ProfilerBriefRendering(
            brief_id=brief.id, audience=audience, scope="whole_house", content_json=content,
        )
        session.add(rendering)
        renderings.append(rendering)

    await session.commit()
    await session.refresh(brief)
    for r in renderings:
        await session.refresh(r)
    return _brief_detail(brief, renderings)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py
git commit -m "feat(profiler): generate brief (3 audience renderings, deterministic numbers)"
```

---

## Task 5: Approval state-machine endpoint (company-scoped first; membrane added in Part II)

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_brief.py`.

> In Part I the approval endpoint enforces the **state machine + transition legality + actor recording** under the contractor-side `_EDIT_ROLES` gate. Part II layers the homeowner/architect/contractor authority split on top. Splitting this way keeps each task independently testable.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_brief.py`

```python
async def test_brief_state_machine_transitions_and_records_actor(client, factory):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, pid, area_id, _ = await _seed_ranked_area(client, factory)
        brief = (await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))).json()
        bid = brief["id"]
        assert brief["state"] == "homeowner_review"

        # illegal transition from homeowner_review -> 409
        bad = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(architect))
        assert bad.status_code == 409

        # homeowner_review --send_to_architect--> architect_review
        r1 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(architect))
        assert r1.status_code == 200 and r1.json()["state"] == "architect_review"

        # architect_review --architect_sign_off--> contractor_brief_ready
        r2 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(architect))
        assert r2.json()["state"] == "contractor_brief_ready"

        # contractor_brief_ready --approve--> approved
        r3 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "approve"}, headers=auth(architect))
        assert r3.json()["state"] == "approved"

        # approved --contractor_received--> locked
        r4 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "contractor_received"}, headers=auth(architect))
        assert r4.json()["state"] == "locked"

        # bad action rejected by schema
        bad2 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "nope"}, headers=auth(architect))
        assert bad2.status_code == 422
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

> NOTE: this Part-I test uses the `architect` (an `_EDIT_ROLES` user) to drive **all** transitions, because Part I has not yet added the per-action authority split. Part II's membrane test (Task 8) re-drives the same transitions with the CORRECT actors (owner/co_owner for homeowner actions) and asserts family/advisor are rejected. When Part II lands, the per-action authority gate will make this Part-I test's owner-action calls (`send_to_architect`, `approve`) fail for the architect — so in Task 7 Step 4 you will UPDATE this test to call those with a homeowner owner. That is expected and called out there.

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py::test_brief_state_machine_transitions_and_records_actor -v`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Add the transition table + endpoint** to `app/profiler/router.py`.

Add this module-level transition table near `_EDIT_ROLES`:

```python
# (action, from_state) -> to_state. Any pair not present is an illegal transition.
_BRIEF_TRANSITIONS: dict[tuple[BriefAction, BriefState], BriefState] = {
    (BriefAction.request_changes, BriefState.homeowner_review): BriefState.revision_requested,
    (BriefAction.request_changes, BriefState.architect_review): BriefState.revision_requested,
    (BriefAction.send_to_architect, BriefState.homeowner_review): BriefState.architect_review,
    (BriefAction.architect_sign_off, BriefState.architect_review): BriefState.contractor_brief_ready,
    (BriefAction.approve, BriefState.contractor_brief_ready): BriefState.approved,
    (BriefAction.contractor_received, BriefState.approved): BriefState.locked,
}
```

Then the endpoint (Part I version — `_EDIT_ROLES` only; Part II replaces the gate):

```python
@router.post("/briefs/{brief_id}/approval", response_model=BriefOut)
async def act_on_brief(
    brief_id: UUID,
    body: BriefApprovalIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> BriefOut:
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    await _load_owned_profile(session, brief.profile_id, user)

    action = BriefAction(body.action)
    target = _BRIEF_TRANSITIONS.get((action, brief.state))
    if target is None:
        raise AppError(
            409, "invalid_transition",
            f"Cannot {action.value} a brief in state {brief.state.value}",
        )
    brief.state = target
    session.add(
        ProfilerBriefApproval(
            brief_id=brief.id, actor_user_id=user.id, actor_role=user.role.value,
            action=action, note=body.note,
        )
    )
    await session.commit()
    await session.refresh(brief)
    return BriefOut.model_validate(brief)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: PASS (all brief tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py
git commit -m "feat(profiler): brief approval state-machine + transition guard"
```

---

## Task 6: Clarifications — generate / list / answer

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_brief.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_brief.py`

```python
async def test_clarifications_generate_list_and_answer(client, factory):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        # low confidence (recommended_count high, few ranked) -> questions generated
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)
        r = await client.post("/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/x.jpg"}, headers=auth(architect))
        rid = r.json()["id"]
        await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))

        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/clarifications", headers=auth(architect))
        assert gen.status_code == 201
        created = gen.json()
        assert len(created) >= 1 and created[0]["answer"] is None

        listed = (await client.get(
            f"/api/v1/design/profiles/{pid}/clarifications", headers=auth(architect))).json()
        assert len(listed) >= 1
        qid = listed[0]["id"]

        ans = await client.post(f"/api/v1/design/clarifications/{qid}/answer",
            json={"answer": "Matte, please."}, headers=auth(architect))
        assert ans.status_code == 200
        assert ans.json()["answer"] == "Matte, please."
        assert ans.json()["answered_at"] is not None
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py::test_clarifications_generate_list_and_answer -v`
Expected: FAIL — 404.

- [ ] **Step 3: Add the three endpoints** to `app/profiler/router.py`:

```python
@router.post(
    "/profiles/{profile_id}/areas/{area_id}/clarifications",
    response_model=list[ClarificationOut],
    status_code=201,
)
async def generate_clarifications_endpoint(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> list[ClarificationOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    try:
        questions = await generate_clarifications(llm, area.area_key, model)
    except Exception:  # never 500 on narration
        logger.exception("profiler: clarification generation failed for area %s", area_id)
        questions = []

    created: list[ProfilerClarification] = []
    for q in questions:
        row = ProfilerClarification(
            profile_id=profile_id, area_id=area_id, question=q,
            source_attribution={"confidence": model["confidence"], "has_conflict": model["has_conflict"]},
        )
        session.add(row)
        created.append(row)
    await session.commit()
    for row in created:
        await session.refresh(row)
    return [ClarificationOut.model_validate(c) for c in created]


@router.get("/profiles/{profile_id}/clarifications", response_model=list[ClarificationOut])
async def list_clarifications(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ClarificationOut]:
    await _load_owned_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerClarification)
            .where(ProfilerClarification.profile_id == profile_id)
            .order_by(ProfilerClarification.asked_at)
        )
    ).scalars().all()
    return [ClarificationOut.model_validate(c) for c in rows]


@router.post("/clarifications/{clarification_id}/answer", response_model=ClarificationOut)
async def answer_clarification(
    clarification_id: UUID,
    body: ClarificationAnswerIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ClarificationOut:
    row = await session.get(ProfilerClarification, clarification_id)
    if row is None:
        raise AppError(404, "not_found", "Clarification not found")
    await _load_owned_profile(session, row.profile_id, user)
    row.answer = body.answer
    row.answered_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return ClarificationOut.model_validate(row)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: PASS

- [ ] **Step 5: Full Part-I suite + lint + commit**

```bash
cd constructo/backend
uv run pytest tests/test_profiler_taste.py tests/test_profiler_api.py tests/test_profiler_extraction.py tests/test_profiler_themes.py tests/test_profiler_brief.py -q
uv run ruff check app/profiler app/models/profiler.py tests/test_profiler_brief.py
git add app/profiler/router.py tests/test_profiler_brief.py
git commit -m "feat(profiler): clarification generate/list/answer endpoints"
```
Expected: all green; ruff clean.

---
---

# PART II — Plan 3b-ii: the homeowner membrane matrix

> The trickiest, most product-significant part. It (a) adds the cross-role profile loader, (b) splits brief-approval authority across homeowner-owner / architect / contractor, (c) gates the contractor-audience rendering, and (d) proves all of it with a visibility test matrix. Build only AFTER Part I is green.

## Task 7: Cross-role loader + per-action authority + audience gate

**Files:** Modify `app/profiler/router.py`; update one Part-I test as noted.

- [ ] **Step 1: Add the cross-role loader + audience helper** to `app/profiler/router.py`.

Extend the imports: `from app.models import User, UserRole` is already there. Add `from app.homeowner.authority import can_approve` and `from app.homeowner.scoping import homeowner_site_ids, member_sub_role`. Add `from app.models import HomeownerMember, MemberStatus` (for actor_member_id lookup). Add `from app.models.profiler import BriefAudience` if not already imported (it is, from Task 4).

Add near `_load_owned_profile`:

```python
async def _load_accessible_profile(
    session: AsyncSession, profile_id: UUID, user: User
) -> ProfilerProfile:
    """Load a profile the caller may ACCESS (read-class), enforcing the membrane.

    Homeowner Users share the contractor's company_id (POST /homeowner/join sets
    company_id = site.company_id), so company-scope alone is too permissive for them.
    Mirror app/homeowner/router.py::_can_access_site: a homeowner must hold an active
    membership on the profile's site; contractor-side roles keep company-scope.
    """
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None:
        raise AppError(404, "not_found", "Profile not found")
    if user.role is UserRole.homeowner:
        if profile.site_id not in await homeowner_site_ids(session, user):
            raise AppError(404, "not_found", "Profile not found")
    elif profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


_HOMEOWNER_BRIEF_ACTIONS = {
    BriefAction.approve, BriefAction.request_changes, BriefAction.send_to_architect,
}


def _audience_allowed(user: User, audience: BriefAudience) -> bool:
    """Which audience renderings a role may read (the homeowner controls the contractor view)."""
    if user.role is UserRole.homeowner:
        return True  # their own data — any audience
    if user.role is UserRole.architect:
        return audience in (BriefAudience.architect, BriefAudience.contractor)
    return audience is BriefAudience.contractor  # other contractor-side roles = "the contractor"


_CONTRACTOR_VISIBLE_STATES = {
    BriefState.contractor_brief_ready, BriefState.approved, BriefState.locked,
}
```

- [ ] **Step 2: Replace the approval endpoint gate** (the Part-I `act_on_brief` from Task 5). Swap `Depends(require_role(*_EDIT_ROLES))` for `Depends(get_current_user)`, load via `_load_accessible_profile`, and branch authority by action. Replace the whole `act_on_brief` body with:

```python
@router.post("/briefs/{brief_id}/approval", response_model=BriefOut)
async def act_on_brief(
    brief_id: UUID,
    body: BriefApprovalIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BriefOut:
    brief = await session.get(ProfilerBrief, brief_id)
    if brief is None:
        raise AppError(404, "not_found", "Brief not found")
    profile = await _load_accessible_profile(session, brief.profile_id, user)

    action = BriefAction(body.action)
    target = _BRIEF_TRANSITIONS.get((action, brief.state))
    if target is None:
        raise AppError(
            409, "invalid_transition",
            f"Cannot {action.value} a brief in state {brief.state.value}",
        )

    # --- the membrane: authority per action ---------------------------------
    actor_member_id: UUID | None = None
    actor_role: str
    if action in _HOMEOWNER_BRIEF_ACTIONS:
        # Money/scope commit -> owner/co_owner only. Family/advisor get a comment box.
        sub_role = await member_sub_role(session, user, profile.site_id)
        if sub_role is None or not can_approve(sub_role):
            raise AppError(
                403, "approve_forbidden",
                "Only a property owner can approve this. You can add a comment.",
                extra={"can_comment": True},
            )
        actor_role = sub_role.value
        member = (
            await session.execute(
                select(HomeownerMember.id).where(
                    HomeownerMember.user_id == user.id,
                    HomeownerMember.site_id == profile.site_id,
                    HomeownerMember.status == MemberStatus.active,
                )
            )
        ).scalars().first()
        actor_member_id = member
    elif action is BriefAction.architect_sign_off:
        if user.role is not UserRole.architect:
            raise AppError(403, "architect_only", "Only the architect can sign off this brief.")
        actor_role = user.role.value
    else:  # contractor_received
        if user.role not in _EDIT_ROLES:
            raise AppError(403, "contractor_only", "Only the contractor can mark this received.")
        actor_role = user.role.value

    brief.state = target
    session.add(
        ProfilerBriefApproval(
            brief_id=brief.id, actor_user_id=user.id, actor_member_id=actor_member_id,
            actor_role=actor_role, action=action, note=body.note,
        )
    )
    await session.commit()
    await session.refresh(brief)
    return BriefOut.model_validate(brief)
```

- [ ] **Step 3: Add the membrane-filtered GET brief endpoint** to `app/profiler/router.py`:

```python
@router.get("/profiles/{profile_id}/brief", response_model=BriefRenderingOut)
async def get_brief_rendering(
    profile_id: UUID,
    audience: str = "homeowner",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BriefRenderingOut:
    await _load_accessible_profile(session, profile_id, user)
    try:
        aud = BriefAudience(audience)
    except ValueError as exc:
        raise AppError(422, "bad_audience", "Unknown audience") from exc

    # the latest brief version for this profile
    brief = (
        await session.execute(
            select(ProfilerBrief)
            .where(ProfilerBrief.profile_id == profile_id)
            .order_by(ProfilerBrief.version.desc())
            .limit(1)
        )
    ).scalars().first()
    if brief is None:
        raise AppError(404, "not_found", "No brief generated yet")

    if not _audience_allowed(user, aud):
        raise AppError(403, "audience_forbidden", "Not permitted to view this rendering")
    # The contractor (non-architect contractor-side) sees the brief only once shared.
    if (
        user.role is not UserRole.homeowner
        and user.role is not UserRole.architect
        and brief.state not in _CONTRACTOR_VISIBLE_STATES
    ):
        raise AppError(403, "brief_not_shared", "This brief has not been shared with the contractor yet")

    rendering = (
        await session.execute(
            select(ProfilerBriefRendering).where(
                ProfilerBriefRendering.brief_id == brief.id,
                ProfilerBriefRendering.audience == aud,
            )
        )
    ).scalars().first()
    if rendering is None:
        raise AppError(404, "not_found", "Rendering not found")
    return BriefRenderingOut.model_validate(rendering)
```

- [ ] **Step 4: Migrate homeowner-reachable READS to the accessible loader.** In `app/profiler/router.py`, change `_load_owned_profile` → `_load_accessible_profile` in exactly these READ endpoints (so a homeowner cannot read another site's profile in the same company): `get_profile`, `get_area_taste`, `list_themes`, `list_conflicts`, `list_clarifications`, `answer_clarification`. Leave `_load_owned_profile` in place for the contractor-side WRITE endpoints (`add_reference`, `rank_reference`, `add_contributor`, `generate_themes`, `decide_theme`, `resolve_conflict`, `generate_brief`, `generate_clarifications_endpoint`) — those are already `_EDIT_ROLES`-gated so homeowners never reach them and company-scope is correct.

  Then UPDATE the Part-I state-machine test (Task 5 Step 1, `test_brief_state_machine_transitions_and_records_actor`): the homeowner-authority actions can no longer be driven by the architect. Change its `send_to_architect` and `approve` calls to be driven by an owner. Replace the test body's setup to also create a homeowner owner on the site and use `auth(owner)` for those two calls. Use this drop-in helper at the top of `tests/test_profiler_brief.py` (import the member model):

```python
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole


async def _add_owner_member(factory, db_session, site_id, sub_role=HomeownerSubRole.primary_owner):
    company = (await factory.user(role=UserRole.owner)).company_id  # unused placeholder guard
    owner = await factory.user(role=UserRole.homeowner)
    db_session.add(HomeownerMember(
        site_id=site_id, user_id=owner.id, sub_role=sub_role, status=MemberStatus.active))
    await db_session.flush()
    return owner
```

  NOTE: `_seed_ranked_area` returns `(architect, pid, area_id, contrib_ids)` but not the site_id. Resolve it via `GET /profiles/{pid}` → `site_id`. Update the state-machine test to: fetch `site_id = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()["site_id"]`, create an owner with `_add_owner_member(factory, db_session, site_id)`, then drive `send_to_architect`/`approve` with `auth(owner)` and `architect_sign_off`/`contractor_received` with `auth(architect)`. Add `db_session` to the test's params. (The clean, exhaustive matrix lives in Task 8; this is the minimal Part-I-test repair.)

- [ ] **Step 5: Run the brief suite to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_brief.py -v`
Expected: PASS (Task-5 test now uses correct actors; GET-brief route exists).

- [ ] **Step 6: Commit**

```bash
git add app/profiler/router.py tests/test_profiler_brief.py
git commit -m "feat(profiler): cross-role loader + per-action approval authority + audience-gated GET brief"
```

---

## Task 8: The cross-role visibility test matrix

**Files:** Create `tests/test_profiler_membrane.py`.

- [ ] **Step 1: Write the matrix tests** — `tests/test_profiler_membrane.py`

```python
"""The membrane matrix — the most important Plan 3b tests.

Proves: homeowner owner approves; family/advisor are refused with a comment box;
the architect signs off; the contractor sees ONLY the contractor rendering of a
SHARED brief; a different-company user and a different-site homeowner get 404.
"""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth


def _brief_llm() -> FakeLLMClient:
    return FakeLLMClient(canned={
        "headline": "h", "summary": "s", "sections": [],
        "themes": [{"name": "T", "palette": ["beige"], "materials": ["light oak"], "rationale": "r"}],
        "questions": ["q?"], "colors": ["dark"], "style": "minimal", "confidence": 0.9,
    })


async def _member(db_session, site_id, user_id, sub_role):
    db_session.add(HomeownerMember(
        site_id=site_id, user_id=user_id, sub_role=sub_role, status=MemberStatus.active))
    await db_session.flush()


async def _world(client, factory, db_session):
    """A company with an architect (contractor-side), a site, a generated brief in
    homeowner_review, plus owner/co_owner/family/advisor homeowner members."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post("/api/v1/design/profiles",
        json={"site_id": str(site.id),
              "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}],
              "contributors": [{"role": "co_owner", "is_decision_owner": True}]},
        headers=auth(architect))
    pid = created.json()["id"]
    area_id = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()["areas"][0]["id"]
    # one ranked reference so the brief has signal
    r = await client.post("/api/v1/design/references",
        json={"area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
        headers=auth(architect))
    contrib_id = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()["contributors"][0]["id"]
    await client.post(f"/api/v1/design/references/{r.json()['id']}/rankings",
        json={"contributor_id": contrib_id, "stars": 5}, headers=auth(architect))
    brief = (await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))).json()

    owner = await factory.user(company=company, role=UserRole.homeowner)
    co = await factory.user(company=company, role=UserRole.homeowner)
    family = await factory.user(company=company, role=UserRole.homeowner)
    advisor = await factory.user(company=company, role=UserRole.homeowner)
    await _member(db_session, site.id, owner.id, HomeownerSubRole.primary_owner)
    await _member(db_session, site.id, co.id, HomeownerSubRole.co_owner)
    await _member(db_session, site.id, family.id, HomeownerSubRole.family)
    await _member(db_session, site.id, advisor.id, HomeownerSubRole.advisor)
    return dict(company=company, architect=architect, site=site, pid=pid, area_id=area_id,
                bid=brief["id"], owner=owner, co=co, family=family, advisor=advisor)


async def test_family_and_advisor_cannot_approve_get_comment_box(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        for actor in (w["family"], w["advisor"]):
            resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
                json={"action": "send_to_architect"}, headers=auth(actor))
            assert resp.status_code == 403
            assert resp.json()["detail"]["code"] == "approve_forbidden"
            assert resp.json()["detail"]["extra"]["can_comment"] is True
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_owner_drives_full_approval_chain(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        bid = w["bid"]
        # owner sends to architect
        assert (await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))).json()["state"] == "architect_review"
        # architect signs off
        assert (await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))).json()["state"] == "contractor_brief_ready"
        # co_owner gives final approval
        assert (await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "approve"}, headers=auth(w["co"]))).json()["state"] == "approved"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_architect_cannot_do_owner_action(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        # architect has no homeowner membership -> owner action refused
        resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["architect"]))
        assert resp.status_code == 403
        assert resp.json()["detail"]["code"] == "approve_forbidden"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_contractor_sees_only_contractor_rendering_of_shared_brief(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid, bid = w["pid"], w["bid"]
        # a non-architect contractor-side user = "the contractor"
        contractor = await factory.user(company=w["company"], role=UserRole.pm)
        # draft (homeowner_review): contractor cannot see it at all
        early = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=contractor",
            headers=auth(contractor))
        assert early.status_code == 403 and early.json()["detail"]["code"] == "brief_not_shared"
        # contractor cannot peek at the homeowner rendering
        peek = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(contractor))
        assert peek.status_code == 403 and peek.json()["detail"]["code"] == "audience_forbidden"
        # drive the brief to shared (contractor_brief_ready)
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))
        # now the contractor sees the contractor rendering
        ok = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=contractor",
            headers=auth(contractor))
        assert ok.status_code == 200 and ok.json()["audience"] == "contractor"
        # homeowner can read their own rendering throughout
        ho = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(w["owner"]))
        assert ho.status_code == 200 and ho.json()["audience"] == "homeowner"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_cross_company_and_cross_site_get_404(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid = w["pid"]
        # different company contractor -> 404
        other = await factory.user(role=UserRole.architect)
        assert (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(other))).status_code == 404
        # a homeowner of a DIFFERENT site in the SAME company -> 404 (the loader fix)
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        assert (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(stranger))).status_code == 404
        assert (await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(stranger))).status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

> **IMPORTANT — verify the AppError JSON shape first.** Before relying on `resp.json()["detail"]["code"]`/`["extra"]`, confirm how `AppError` serializes by grepping the handler: `grep -rn "code\|extra\|detail" app/common/errors.py app/main.py | head`. If the shape differs (e.g. top-level `{"code":..., "extra":...}` rather than nested under `detail`), adjust every assertion in this file to match. Do NOT guess — read the handler and make the tests match reality.

- [ ] **Step 2: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_membrane.py -v`
Expected: PASS (all five matrix tests). If an assertion about the error JSON shape fails, fix the assertions per the IMPORTANT note (the membrane behaviour is what matters, not the exact JSON nesting).

- [ ] **Step 3: Commit**

```bash
git add tests/test_profiler_membrane.py
git commit -m "test(profiler): cross-role membrane visibility matrix"
```

---

## Task 9: Full suite + lint + app import (Production-Bar gate)

**Files:** none (verification).

- [ ] **Step 1: Run the whole profiler + homeowner + sites suites**

Run:
```bash
cd constructo/backend
uv run pytest tests/test_profiler_*.py tests/homeowner/ tests/sites/ -q
```
Expected: all green (the membrane reuses homeowner primitives; confirm no regression).

- [ ] **Step 2: Lint**

Run: `cd constructo/backend && uv run ruff check app/profiler app/models/profiler.py tests/test_profiler_brief.py tests/test_profiler_membrane.py`
Expected: clean.

- [ ] **Step 3: App imports + full backend suite**

Run:
```bash
cd constructo/backend
uv run python -c "from app.main import app; print('ok')"
uv run pytest -q
```
Expected: `ok`; full suite green.

- [ ] **Step 4: Commit (if any lint fixups)**

```bash
git add -A app/profiler tests/test_profiler_brief.py tests/test_profiler_membrane.py
git commit -m "chore(profiler): lint brief + membrane" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage (vs `docs/superpowers/specs/2026-06-12-design-profiler-engine-design.md` §4③④ + §5 + §6 + §7 + §8):**
- §4③ `design_clarification` → `ProfilerClarification` (Task 1) ✓.
- §4④ `design_brief` → `ProfilerBrief`, `design_brief_rendering` → `ProfilerBriefRendering`, `design_brief_approval` → `ProfilerBriefApproval` (Task 1) ✓.
- §5 state machine: `BriefState` + `_BRIEF_TRANSITIONS` + 409 on illegal transition (Task 5); committing actions write a named-actor approval row (Task 5/7) ✓.
- §6 step 4 (clarify, grounded): `generate_clarifications` from taste signals (Task 2/6) ✓. step 5 (brief narrates structured data): deterministic payload + LLM prose, numbers from payload (Task 2/4) ✓.
- §7 contract: `POST /profiles/{id}/brief` ✓, `GET /profiles/{id}/brief?audience=` ✓, `POST /briefs/{id}/approval` ✓, `GET /profiles/{id}/clarifications` + answer ✓.
- §8 membrane: decision authority owner/co_owner-only via `member_sub_role`+`can_approve`, family/advisor `can_comment` (Task 7/8) ✓; architect sign-off (Task 7/8) ✓; contractor sees only contractor rendering of a shared brief (Task 7/8) ✓; every action attributed (Task 5/7) ✓; cross-role visibility test matrix (Task 8) ✓.
- §10 Production Bar: deterministic numbers asserted (Task 4), FakeLLM no-spend (all tasks), e2e create→rank→theme→approve→brief→sign-off→contractor-visible + family-cannot-approve (Task 8), ruff + full suite (Task 9) ✓.

**Determinism:** `confidence` and all materials/counts come from `build_taste_model`/`build_area_brief_payload`; the LLM supplies only `{headline, summary, sections}` prose; narration is fail-safe (try/except + log) in every endpoint that calls the LLM (Task 4/6) ✓. Determinism assertion: Task 4 asserts the persisted rendering confidence is the reducer's `1.0`, not the LLM canned `0.9`.

**Placeholder scan:** none — every step has runnable code + commands + expected output. The one deliberate forward dependency (Part-I state-machine test updated in Part II Task 7 Step 4) is explicitly called out in both places.

**Type consistency:** `build_area_brief_payload(area_key, taste_model, themes, conflicts) -> dict`, `narrate_brief(llm, audience, payload) -> dict`, `generate_clarifications(llm, area_key, taste_model) -> list[str]` used identically in helper + endpoints + tests. `_BRIEF_TRANSITIONS` keyed by `(BriefAction, BriefState)`. `BriefState`/`BriefAudience`/`BriefAction` enum values match schema regex patterns. `ProfilerBrief`/`ProfilerBriefRendering`/`ProfilerBriefApproval`/`ProfilerClarification` field names match `BriefOut`/`BriefRenderingOut`/`BriefApprovalOut`/`ClarificationOut`. `_load_accessible_profile` signature matches `_load_owned_profile` so the read-endpoint swap (Task 7 Step 4) is mechanical.

**Cross-role access (investigated, not assumed):** homeowner Users share the contractor `company_id` (`app/homeowner/router.py:367`); the loader fix requires homeowner membership on the profile's site — proven by `test_cross_company_and_cross_site_get_404` (Task 8).

---

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks (this is how Plan 1 + Plan 3a were built).
2. **Inline Execution** — tasks in-session with checkpoints.
