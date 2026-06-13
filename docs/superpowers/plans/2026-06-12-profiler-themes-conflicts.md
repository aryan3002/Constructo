# Design Profiler — Themes & Conflicts (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the Design Profiler engine so that, from a deterministic taste model, it (1) generates AI-proposed **theme directions** (the LLM proposes names/palette/materials/rationale; **confidence comes from the reducer, evidence from the deterministically top-ranked references**), (2) persists the reducer-detected **multi-owner conflicts** as resolvable rows, and (3) exposes decide/resolve endpoints.

**Architecture:** Additive — two new `profiler_*` tables + two enums + a new pure helper module `app/profiler/themes.py` + new endpoints on the existing `app/profiler/router.py`. The trust core holds: `taste.py` (pure) computes confidence + conflicts; the LLM only narrates theme copy; `confidence` persisted on a theme is `taste_model["confidence"]`, never the model's. All new routes stay Labs-gated (the router is already inside `if settings.enable_labs:` in `main.py`). Built on the engine branch (PR #182).

**Tech Stack:** FastAPI, async SQLAlchemy 2.0, Postgres+JSONB, Alembic, Pydantic v2, pytest-asyncio (auto), `app.extraction.llm` (`complete` + `FakeLLMClient`). Run from `constructo/backend` with `uv`. **Base branch: `worktree-design-profiler-engine`** (stacked on the engine PR).

**Conventions (from the engine code):** models FK-only (no `relationship()`); errors via `AppError(status, code, message, extra=...)`; company-scope every load via `_load_owned_profile`; POST-create `status_code=201`; responses via `Schema.model_validate(orm)` (`ConfigDict(from_attributes=True)`); LLM via `Depends(get_llm)` overridden in tests with `app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=...)` in try/finally; migrations hand-drop named enums on downgrade.

**Scope boundary:** the homeowner-side membrane (owner/co_owner-only approval via `member_sub_role`+`can_approve`, family/advisor get `can_comment`, contractor sees only the approved brief, cross-role profile access) is **Plan 3b** with the brief. Plan 3a's decide/resolve endpoints use the proven `_EDIT_ROLES` + company-scope gate and record `decided_by`/`resolved_by`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/profiler.py` (modify) | Append `ThemeStatus`, `ConflictStatus` enums + `ProfilerTheme`, `ProfilerConflict` models |
| `app/models/__init__.py` (modify) | Register/export the 4 new names |
| `alembic/versions/<rev>_profiler_themes_conflicts.py` (generate) | Migration (hand-drop the 2 new enums on downgrade) |
| `app/profiler/themes.py` (create) | Pure: `top_reference_ids`, `_taste_summary_text`; LLM: `PROFILER_THEME_SYSTEM`/`_SCHEMA`, `narrate_themes` |
| `app/profiler/schemas.py` (modify) | `ThemeOut`, `ThemeDecisionIn`, `ConflictOut`, `ConflictResolveIn` |
| `app/profiler/router.py` (modify) | generate-themes, list-themes, theme-decision, list-conflicts, resolve-conflict + `_sync_conflicts` helper |
| `tests/test_profiler_themes.py` (create) | Unit (pure + narrate) + endpoint + e2e tests |

---

## Task 1: Models + enums + migration

**Files:** Modify `app/models/profiler.py`, `app/models/__init__.py`; generate a migration.

- [ ] **Step 1: Append the enums + models** to the END of `app/models/profiler.py` (the imports it needs — `String, Text, JSONB, Numeric, SAEnum, datetime, ...` — are already imported at the top of that file):

```python
class ThemeStatus(StrEnum):
    suggested = "suggested"
    approved = "approved"
    adjusted = "adjusted"
    rejected = "rejected"


class ConflictStatus(StrEnum):
    open = "open"
    resolved = "resolved"
    deferred_to_architect = "deferred_to_architect"


class ProfilerTheme(Base):
    __tablename__ = "profiler_themes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    palette: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    materials: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_reference_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    status: Mapped[ThemeStatus] = mapped_column(
        SAEnum(ThemeStatus, name="profiler_theme_status"),
        nullable=False,
        server_default=ThemeStatus.suggested.value,
    )
    decided_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerConflict(Base):
    __tablename__ = "profiler_conflicts"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="CASCADE"), nullable=False
    )
    dimension: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[str] = mapped_column(String(120), nullable=False)
    contributor_a_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_contributors.id", ondelete="SET NULL"), nullable=True
    )
    contributor_b_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_contributors.id", ondelete="SET NULL"), nullable=True
    )
    resolution_status: Mapped[ConflictStatus] = mapped_column(
        SAEnum(ConflictStatus, name="profiler_conflict_status"),
        nullable=False,
        server_default=ConflictStatus.open.value,
    )
    resolved_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Register** in `app/models/__init__.py` — add to the existing `from app.models.profiler import (...)` block (alphabetised) the names `ConflictStatus`, `ProfilerConflict`, `ProfilerTheme`, `ThemeStatus`, and add the same four to the `# Design Profiler engine` section of `__all__`.

- [ ] **Step 3: Sanity import**

Run: `cd constructo/backend && uv run python -c "import app.models as m; print(m.ProfilerTheme.__tablename__, m.ProfilerConflict.__tablename__)"`
Expected: `profiler_themes profiler_conflicts`

- [ ] **Step 4: Generate the migration**

Run: `cd constructo/backend && uv run alembic revision --autogenerate -m "profiler themes + conflicts"`
Expected: a new revision creating `profiler_themes` + `profiler_conflicts` + the two enums. Confirm `down_revision = '107430e27c2c'`.

- [ ] **Step 5: Hand-edit `downgrade()`** to drop the two new named enums (autogenerate won't). After the `op.drop_table(...)` calls add:

```python
from sqlalchemy.dialects import postgresql

for enum_name in ("profiler_theme_status", "profiler_conflict_status"):
    postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
```

(Move that `from sqlalchemy.dialects import postgresql` to the top-level imports if autogenerate didn't already add it.)

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
git commit -m "feat(profiler): themes + conflicts tables"
```

---

## Task 2: Theme narration helper (pure + LLM)

**Files:** Create `app/profiler/themes.py`; Test `tests/test_profiler_themes.py`.

- [ ] **Step 1: Write the failing tests** — `tests/test_profiler_themes.py`

```python
"""Theme narration: pure evidence selection + LLM proposes (FakeLLM, no spend)."""
from app.extraction.llm import FakeLLMClient
from app.profiler.themes import narrate_themes, top_reference_ids


def test_top_reference_ids_picks_highest_starred_deterministically():
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r2", "contributor_id": "A", "stars": 2, "tags": {}},
        {"reference_id": "r3", "contributor_id": "B", "stars": 4, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 3, "tags": {}},  # r1 max stays 5
    ]
    assert top_reference_ids(rankings, limit=2) == ["r1", "r3"]  # 5, then 4
    assert top_reference_ids([], limit=3) == []


async def test_narrate_themes_calls_complete_and_returns_list():
    canned = {"themes": [{"name": "Warm Contemporary", "palette": ["oak", "beige"],
                          "materials": ["light oak"], "rationale": "You liked warm minimal."}]}
    llm = FakeLLMClient(canned=canned)
    taste = {"dimensions": {"style": {"minimal": 2.0, "ornate": -1.0}, "colors": {"light": 1.5}}}
    out = await narrate_themes(llm, "kitchen", taste)
    assert out[0]["name"] == "Warm Contemporary"
    # it used complete() (not vision) and the prompt mentions the liked/disliked signals
    assert "minimal" in llm.calls[-1]["user"]
    assert "ornate" in llm.calls[-1]["user"]
    assert "image_url" not in llm.calls[-1]  # complete(), not complete_vision()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.profiler.themes'`

- [ ] **Step 3: Implement** — `app/profiler/themes.py`

```python
"""Theme narration for the Design Profiler.

The deterministic taste model -> AI-proposed theme directions. The LLM PROPOSES
names/palette/materials/rationale; CONFIDENCE comes from the reducer (taste.py),
never the model; EVIDENCE is the deterministically top-ranked references.
"""
from app.extraction.llm import LLMClient

PROFILER_THEME_SYSTEM = (
    "You are an interior design assistant. Given a homeowner's aggregated taste signals for one "
    "area of their home (liked and disliked style/material/color/lighting values), propose 1-3 "
    "named design theme directions. For each: a short evocative name, a palette (list of color "
    "names), a materials list, and a one-sentence rationale grounded ONLY in the given signals. "
    "Do not invent preferences not present in the signals. Do not output any confidence number."
)

PROFILER_THEME_SCHEMA = {
    "type": "object",
    "properties": {
        "themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "palette": {"type": "array", "items": {"type": "string"}},
                    "materials": {"type": "array", "items": {"type": "string"}},
                    "rationale": {"type": "string"},
                },
            },
        }
    },
}


def top_reference_ids(rankings: list[dict], limit: int = 4) -> list[str]:
    """Deterministically pick the highest-starred reference ids as theme evidence.
    Ties break by reference_id (stable)."""
    by_ref: dict[str, int] = {}
    for r in rankings:
        rid = r["reference_id"]
        by_ref[rid] = max(by_ref.get(rid, 0), r["stars"])
    ordered = sorted(by_ref.items(), key=lambda kv: (-kv[1], kv[0]))
    return [rid for rid, _ in ordered][:limit]


def _taste_summary_text(area_key: str, taste_model: dict) -> str:
    """Deterministic, human-readable rendering of the taste model for the LLM prompt."""
    lines = [f"Area: {area_key}"]
    for dim, values in (taste_model.get("dimensions") or {}).items():
        liked = sorted([v for v, s in values.items() if s > 0], key=lambda v: -values[v])
        disliked = sorted([v for v, s in values.items() if s < 0], key=lambda v: values[v])
        if liked:
            lines.append(f"Liked {dim}: {', '.join(liked)}")
        if disliked:
            lines.append(f"Disliked {dim}: {', '.join(disliked)}")
    return "\n".join(lines)


async def narrate_themes(llm: LLMClient, area_key: str, taste_model: dict) -> list[dict]:
    """LLM proposes theme directions from the taste summary. Returns a list of
    {name, palette, materials, rationale} dicts (never confidence — that's the reducer's)."""
    user = _taste_summary_text(area_key, taste_model)
    out = await llm.complete(PROFILER_THEME_SYSTEM, user, PROFILER_THEME_SCHEMA)
    return out.get("themes", [])
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py -v`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/themes.py tests/test_profiler_themes.py
git commit -m "feat(profiler): theme narration helper (LLM proposes, reducer grounds)"
```

---

## Task 3: Schemas

**Files:** Modify `app/profiler/schemas.py`.

- [ ] **Step 1: Append** these to `app/profiler/schemas.py` (the file already imports `BaseModel, ConfigDict, Field`, `UUID`, `datetime`):

```python
class ThemeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID | None = None
    name: str
    confidence: float
    palette: list = []
    materials: list = []
    rationale: str | None = None
    evidence_reference_ids: list = []
    status: str
    created_at: datetime


class ThemeDecisionIn(BaseModel):
    action: str = Field(pattern="^(approve|adjust|reject)$")
    note: str | None = None


class ConflictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID
    dimension: str
    value: str
    contributor_a_id: UUID | None = None
    contributor_b_id: UUID | None = None
    resolution_status: str
    decision_note: str | None = None


class ConflictResolveIn(BaseModel):
    resolution: str = Field(pattern="^(keep_a|keep_b|compromise|defer_to_architect)$")
    note: str | None = None
```

- [ ] **Step 2: Lint + commit**

```bash
cd constructo/backend && uv run ruff check app/profiler/schemas.py
git add app/profiler/schemas.py
git commit -m "feat(profiler): theme + conflict schemas"
```

---

## Task 4: Generate-themes + list-themes endpoints (+ conflict sync)

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_themes.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_themes.py`. (Reuses the engine's existing `_profile_with_area_and_two_contributors` helper + `auth` from `tests/test_profiler_api.py` — import them.)

```python
from app.main import app
from app.profiler.extraction import get_llm
from tests.test_profiler_api import _profile_with_area_and_two_contributors, auth


async def test_generate_themes_persists_with_reducer_confidence_and_syncs_conflicts(client, factory):
    # Two owners rank the same dark reference oppositely -> a real conflict; FakeLLM proposes a theme.
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(
        canned={"themes": [{"name": "Soft Minimal", "palette": ["beige"],
                            "materials": ["oak"], "rationale": "warm minimal"}],
                # vision-extraction (on add_reference) also goes through this fake:
                "colors": ["dark"], "style": "ornate", "confidence": 0.9}
    )
    try:
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)
        ref_ids = []
        for _ in range(2):
            r = await client.post("/api/v1/design/references",
                json={"area_id": area_id, "source_type": "upload",
                      "source_url": "https://example.test/dark.jpg"}, headers=auth(architect))
            ref_ids.append(r.json()["id"])
        for ref_id in ref_ids:
            await client.post(f"/api/v1/design/references/{ref_id}/rankings",
                json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))
            await client.post(f"/api/v1/design/references/{ref_id}/rankings",
                json={"contributor_id": contrib_ids[1], "stars": 1}, headers=auth(architect))

        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))
        assert gen.status_code == 201
        themes = gen.json()
        assert themes[0]["name"] == "Soft Minimal"
        # confidence comes from the deterministic reducer (2 ranked refs / recommended 2 == 1.0),
        # NOT from the LLM canned payload (which has 0.9):
        assert themes[0]["confidence"] == 1.0
        assert themes[0]["evidence_reference_ids"]  # deterministically chosen

        # conflicts were synced as rows:
        conflicts = (await client.get(
            f"/api/v1/design/profiles/{pid}/conflicts", headers=auth(architect))).json()
        assert any(c["dimension"] == "colors" and c["value"] == "dark" for c in conflicts)

        # listing themes returns the generated one:
        listed = (await client.get(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))).json()
        assert len(listed) == 1
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py::test_generate_themes_persists_with_reducer_confidence_and_syncs_conflicts -v`
Expected: FAIL — 404/405 (routes not defined).

- [ ] **Step 3: Add imports + helper + endpoints** to `app/profiler/router.py`.

Add to the top imports: `from datetime import datetime, timezone`. Extend the `app.models.profiler` import to include `ConflictStatus, ProfilerConflict, ProfilerTheme, ThemeStatus`. Extend the schemas import to include `ConflictOut, ConflictResolveIn, ThemeDecisionIn, ThemeOut`. Add `from app.profiler.themes import narrate_themes, top_reference_ids`.

Add a small helper for gathering an area's rankings + attributes (factor out the block already in `get_area_taste`, OR duplicate it — DRY preferred). Add this helper near `_load_owned_profile`:

```python
async def _area_signals(session: AsyncSession, area_id: UUID) -> tuple[list[dict], list[dict]]:
    """The (rankings, attributes) dict-lists the reducer expects, for one area."""
    ref_ids = (
        (await session.execute(select(ProfilerReference.id).where(ProfilerReference.area_id == area_id)))
        .scalars().all()
    )
    if not ref_ids:
        return [], []
    rank_rows = (
        await session.execute(select(ProfilerRanking).where(ProfilerRanking.reference_id.in_(ref_ids)))
    ).scalars().all()
    attr_rows = (
        await session.execute(
            select(ProfilerReferenceAttributes).where(ProfilerReferenceAttributes.reference_id.in_(ref_ids))
        )
    ).scalars().all()
    rankings = [
        {"reference_id": str(r.reference_id), "contributor_id": str(r.contributor_id),
         "stars": r.stars, "tags": r.tags}
        for r in rank_rows
    ]
    attrs = [{"reference_id": str(a.reference_id), "attributes": a.attributes} for a in attr_rows]
    return rankings, attrs


async def _sync_conflicts(session: AsyncSession, profile_id: UUID, area_id: UUID, conflicts: list[dict]) -> None:
    """Replace this area's OPEN conflicts with the freshly-detected set (resolved ones preserved)."""
    existing = (
        await session.execute(
            select(ProfilerConflict).where(
                ProfilerConflict.area_id == area_id,
                ProfilerConflict.resolution_status == ConflictStatus.open,
            )
        )
    ).scalars().all()
    for c in existing:
        await session.delete(c)
    for cf in conflicts:
        session.add(
            ProfilerConflict(
                profile_id=profile_id, area_id=area_id,
                dimension=cf["dimension"], value=cf["value"],
                contributor_a_id=UUID(cf["contributor_a"]), contributor_b_id=UUID(cf["contributor_b"]),
            )
        )
```

(Optional DRY: refactor `get_area_taste` to call `_area_signals` too — keep behaviour identical.)

Then the two endpoints:

```python
@router.post("/profiles/{profile_id}/areas/{area_id}/themes", response_model=list[ThemeOut], status_code=201)
async def generate_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> list[ThemeOut]:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    rankings, attrs = await _area_signals(session, area_id)
    model = build_taste_model(rankings, attrs, area.recommended_count)
    evidence = top_reference_ids(rankings)

    try:
        proposals = await narrate_themes(llm, area.area_key, model)
    except Exception:  # narration must never 500 the request
        logger.exception("profiler: theme narration failed for area %s", area_id)
        proposals = []

    # Replace prior SUGGESTED themes for this area (keep approved/adjusted/rejected).
    prior = (
        await session.execute(
            select(ProfilerTheme).where(
                ProfilerTheme.area_id == area_id, ProfilerTheme.status == ThemeStatus.suggested
            )
        )
    ).scalars().all()
    for t in prior:
        await session.delete(t)

    created: list[ProfilerTheme] = []
    for p in proposals:
        theme = ProfilerTheme(
            profile_id=profile_id, area_id=area_id,
            name=(p.get("name") or "Untitled"),
            palette=(p.get("palette") or []),
            materials=(p.get("materials") or []),
            rationale=p.get("rationale"),
            evidence_reference_ids=evidence,
            confidence=model["confidence"],  # reducer math, never the LLM
        )
        session.add(theme)
        created.append(theme)

    await _sync_conflicts(session, profile_id, area_id, model["conflicts"])
    await session.commit()
    for t in created:
        await session.refresh(t)
    return [ThemeOut.model_validate(t) for t in created]


@router.get("/profiles/{profile_id}/areas/{area_id}/themes", response_model=list[ThemeOut])
async def list_themes(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ThemeOut]:
    await _load_owned_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerTheme).where(ProfilerTheme.area_id == area_id).order_by(ProfilerTheme.created_at)
        )
    ).scalars().all()
    return [ThemeOut.model_validate(t) for t in rows]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py
git commit -m "feat(profiler): generate-themes + list-themes (reducer-grounded, conflicts synced)"
```

---

## Task 5: Theme decision + conflict list/resolve endpoints

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_themes.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_themes.py`

```python
async def test_theme_decision_and_conflict_resolve(client, factory):
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(
        canned={"themes": [{"name": "Soft Minimal", "palette": ["beige"], "materials": ["oak"],
                            "rationale": "warm"}], "colors": ["dark"], "confidence": 0.9})
    try:
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)
        for _ in range(2):
            r = await client.post("/api/v1/design/references",
                json={"area_id": area_id, "source_type": "upload",
                      "source_url": "https://example.test/x.jpg"}, headers=auth(architect))
            rid = r.json()["id"]
            await client.post(f"/api/v1/design/references/{rid}/rankings",
                json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))
            await client.post(f"/api/v1/design/references/{rid}/rankings",
                json={"contributor_id": contrib_ids[1], "stars": 1}, headers=auth(architect))
        themes = (await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect))).json()
        theme_id = themes[0]["id"]

        # approve the theme
        dec = await client.post(f"/api/v1/design/themes/{theme_id}/decision",
            json={"action": "approve"}, headers=auth(architect))
        assert dec.status_code == 200
        assert dec.json()["status"] == "approved"

        # bad action rejected by schema
        bad = await client.post(f"/api/v1/design/themes/{theme_id}/decision",
            json={"action": "nope"}, headers=auth(architect))
        assert bad.status_code == 422

        # resolve a conflict
        conflicts = (await client.get(
            f"/api/v1/design/profiles/{pid}/conflicts", headers=auth(architect))).json()
        cid = conflicts[0]["id"]
        res = await client.post(f"/api/v1/design/conflicts/{cid}/resolve",
            json={"resolution": "compromise", "note": "light oak + subtle contrast"},
            headers=auth(architect))
        assert res.status_code == 200
        assert res.json()["resolution_status"] == "resolved"
        assert res.json()["decision_note"] == "light oak + subtle contrast"
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py::test_theme_decision_and_conflict_resolve -v`
Expected: FAIL — 404 (routes not defined).

- [ ] **Step 3: Add the endpoints** to `app/profiler/router.py`:

```python
@router.post("/themes/{theme_id}/decision", response_model=ThemeOut)
async def decide_theme(
    theme_id: UUID,
    body: ThemeDecisionIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ThemeOut:
    theme = await session.get(ProfilerTheme, theme_id)
    if theme is None:
        raise AppError(404, "not_found", "Theme not found")
    await _load_owned_profile(session, theme.profile_id, user)
    theme.status = {
        "approve": ThemeStatus.approved,
        "adjust": ThemeStatus.adjusted,
        "reject": ThemeStatus.rejected,
    }[body.action]
    theme.decided_by = user.id
    theme.decided_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(theme)
    return ThemeOut.model_validate(theme)


@router.get("/profiles/{profile_id}/conflicts", response_model=list[ConflictOut])
async def list_conflicts(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConflictOut]:
    await _load_owned_profile(session, profile_id, user)
    rows = (
        await session.execute(
            select(ProfilerConflict)
            .where(ProfilerConflict.profile_id == profile_id)
            .order_by(ProfilerConflict.created_at)
        )
    ).scalars().all()
    return [ConflictOut.model_validate(c) for c in rows]


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictOut)
async def resolve_conflict(
    conflict_id: UUID,
    body: ConflictResolveIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ConflictOut:
    conflict = await session.get(ProfilerConflict, conflict_id)
    if conflict is None:
        raise AppError(404, "not_found", "Conflict not found")
    await _load_owned_profile(session, conflict.profile_id, user)
    conflict.resolution_status = (
        ConflictStatus.deferred_to_architect
        if body.resolution == "defer_to_architect"
        else ConflictStatus.resolved
    )
    conflict.resolved_by = user.id
    conflict.decision_note = body.note or body.resolution
    conflict.resolved_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(conflict)
    return ConflictOut.model_validate(conflict)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_themes.py -v`
Expected: PASS (all theme tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py tests/test_profiler_themes.py
git commit -m "feat(profiler): theme decision + conflict list/resolve endpoints"
```

---

## Task 6: Full suite + lint

**Files:** none (verification).

- [ ] **Step 1: Run the profiler suites**

Run:
```bash
cd constructo/backend
uv run pytest tests/test_profiler_taste.py tests/test_profiler_api.py tests/test_profiler_extraction.py tests/test_profiler_themes.py -q
```
Expected: all green (the pre-existing profiler tests must still pass — Task 4/5 only added routes).

- [ ] **Step 2: Lint**

Run: `cd constructo/backend && uv run ruff check app/profiler app/models/profiler.py tests/test_profiler_themes.py`
Expected: clean.

- [ ] **Step 3: App imports**

Run: `cd constructo/backend && uv run python -c "from app.main import app; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit (if any lint fixups)**

```bash
git add -A app/profiler tests/test_profiler_themes.py
git commit -m "chore(profiler): lint themes/conflicts" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage (vs `docs/superpowers/specs/2026-06-12-design-profiler-engine-design.md` §4③ + §6 + §7):**
- §4③ `design_theme` → `ProfilerTheme` (Task 1) ✓ · `design_conflict` → `ProfilerConflict` (Task 1) ✓. (`design_clarification` is Plan 3b.)
- §6 theme step: LLM proposes (Task 2), confidence echoed from reducer + evidence deterministic (Task 4) ✓; conflict detection persisted (Task 4 `_sync_conflicts`) ✓.
- §7 contract subset: `themes:generate`(POST themes) / GET themes / theme decision / GET conflicts / conflict resolve ✓. (`brief:*` + `clarifications` = Plan 3b.)
- Determinism: `confidence = model["confidence"]` not the LLM; narration fail-safe (try/except + log) ✓.
- §8 membrane: **deferred to Plan 3b** (noted in the scope boundary) — Plan 3a uses `_EDIT_ROLES` + company-scope and records `decided_by`/`resolved_by`.

**Placeholder scan:** none — every step has runnable code + commands + expected output.

**Type consistency:** `narrate_themes(llm, area_key, taste_model) -> list[dict]` and `top_reference_ids(rankings, limit)` used identically in helper + endpoint + tests. `build_taste_model` return keys (`dimensions`/`confidence`/`conflicts`) consumed exactly as the engine defines them. Conflict dict keys (`dimension`/`value`/`contributor_a`/`contributor_b`) from `detect_conflicts` map to `_sync_conflicts`. `ThemeOut`/`ConflictOut` field names match the models.

**Deferred to Plan 3b (explicit):** `design_clarification` (AI interview) + brief generation + the 3 audience renderings + approval state-machine + the **homeowner membrane matrix** (owner/co_owner-only approval via `member_sub_role`+`can_approve`, family/advisor `can_comment`, contractor-sees-approved-only, cross-role homeowner access to the profile).

---

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks.
2. **Inline Execution** — tasks in-session with checkpoints.
