# Design Profiler — Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the role-agnostic backend foundation of the Design Profiler — a homeowner can create a profile with scoped areas + contributors, add and (per-contributor) rank reference images, have a vision-LLM extract attributes, and read back a **deterministically computed** taste model (confidence + multi-owner conflicts) via the API.

**Architecture:** New cohesive package `app/profiler/` + a new models file `app/models/profiler.py` with additive `profiler_*` tables (the thin existing `design_*`/`design_fingerprint` tables are left untouched and reconciled in a later sub-project — additive = unbroken). The **trust core is a pure-Python reducer** (`app/profiler/taste.py`): vision-LLM only *extracts per-image attributes*; confidence and conflict are computed by the reducer, never the model. All new routes are Labs-gated. Vision extraction runs **inline** (await) in v1 — the RQ async path is a later optimization.

**Tech Stack:** FastAPI, async SQLAlchemy 2.0 (`Mapped`/`mapped_column`), Postgres + JSONB, Alembic, Pydantic v2, pytest-asyncio (auto mode), `app.extraction.llm` (`complete_vision` + `FakeLLMClient`). Run from `constructo/backend` with `uv`.

**Conventions to honor (from the codebase):** models are FK-only (no `relationship()`); errors use `AppError(status, code, message)` from `app.common.errors`, never `HTTPException`; company-scoping is manual on every query; POST-create returns `status_code=201`; responses are built with `Schema.model_validate(orm)` (`ConfigDict(from_attributes=True)`); tests are plain `async def test_...` (no decorator) and commit seed data before the `client` call.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/profiler.py` (create) | The 6 `profiler_*` tables + their StrEnums |
| `app/models/__init__.py` (modify) | Register/export the new models |
| `alembic/versions/<rev>_design_profiler_engine.py` (generated) | Migration (hand-edit downgrade to drop named enums) |
| `app/profiler/__init__.py` (create) | Package marker |
| `app/profiler/taste.py` (create) | **Pure deterministic reducer** — taste model, confidence, conflicts, consistency |
| `app/profiler/schemas.py` (create) | Pydantic request/response models |
| `app/profiler/extraction.py` (create) | Vision prompt/schema + `get_llm` + `extract_reference_attributes` |
| `app/profiler/router.py` (create) | Endpoints (`/api/v1/design/*`) |
| `app/main.py` (modify) | `include_router(profiler_router)` inside the `enable_labs` block |
| `tests/test_profiler_taste.py` (create) | Reducer unit tests (no DB, no LLM) |
| `tests/test_profiler_api.py` (create) | Endpoint + e2e tests |
| `tests/test_profiler_extraction.py` (create) | Vision-extraction test (FakeLLM) |

---

## Task 1: Models + enums + migration

**Files:** Create `app/models/profiler.py`; Modify `app/models/__init__.py`; generate a migration.

- [ ] **Step 1: Write the models** — `app/models/profiler.py`

```python
"""Design Profiler engine tables — moodboard inputs -> deterministic taste -> brief.

Additive: new cohesive `profiler_*` tables. The thin existing `design_*` tables
(design_fingerprint) are left untouched and reconciled in a later sub-project.
Models are FK-only (no relationship()), matching the rest of app/models.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ProfileScope(StrEnum):
    whole_house = "whole_house"
    rooms = "rooms"
    elements = "elements"


class ProfileStatus(StrEnum):
    not_started = "not_started"
    intake_started = "intake_started"
    collecting_inputs = "collecting_inputs"
    ranking = "ranking"
    ai_interpreting = "ai_interpreting"
    needs_clarification = "needs_clarification"
    theme_suggested = "theme_suggested"
    homeowner_review = "homeowner_review"
    revision_requested = "revision_requested"
    architect_review = "architect_review"
    contractor_brief_ready = "contractor_brief_ready"
    approved = "approved"
    locked = "locked"


class AreaKind(StrEnum):
    house_build = "house_build"
    interior = "interior"
    element = "element"


class AreaStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    ready = "ready"


class ContributorRole(StrEnum):
    owner = "owner"
    co_owner = "co_owner"
    family = "family"
    advisor = "advisor"
    architect = "architect"


class ReferenceSource(StrEnum):
    upload = "upload"
    camera = "camera"
    pinterest_link = "pinterest_link"
    pinterest_oauth = "pinterest_oauth"
    preset = "preset"


class ConsistencyStatus(StrEnum):
    consistent = "consistent"
    tension = "tension"
    conflict = "conflict"


class ProfilerProfile(Base):
    __tablename__ = "profiler_profiles"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    scope_type: Mapped[ProfileScope] = mapped_column(
        SAEnum(ProfileScope, name="profiler_scope"),
        nullable=False,
        server_default=ProfileScope.whole_house.value,
    )
    status: Mapped[ProfileStatus] = mapped_column(
        SAEnum(ProfileStatus, name="profiler_status"),
        nullable=False,
        server_default=ProfileStatus.not_started.value,
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerArea(Base):
    __tablename__ = "profiler_areas"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_kind: Mapped[AreaKind] = mapped_column(SAEnum(AreaKind, name="profiler_area_kind"), nullable=False)
    area_key: Mapped[str] = mapped_column(String(64), nullable=False)
    space_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True
    )
    component_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL"), nullable=True
    )
    recommended_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="6")
    status: Mapped[AreaStatus] = mapped_column(
        SAEnum(AreaStatus, name="profiler_area_status"),
        nullable=False,
        server_default=AreaStatus.not_started.value,
    )
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    has_conflict: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    taste_model: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerContributor(Base):
    __tablename__ = "profiler_contributors"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("homeowner_members.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[ContributorRole] = mapped_column(
        SAEnum(ContributorRole, name="profiler_contributor_role"), nullable=False
    )
    is_decision_owner: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerReference(Base):
    __tablename__ = "profiler_references"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="CASCADE"), nullable=False
    )
    contributor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_contributors.id", ondelete="SET NULL"), nullable=True
    )
    source_type: Mapped[ReferenceSource] = mapped_column(
        SAEnum(ReferenceSource, name="profiler_reference_source"), nullable=False
    )
    image_r2_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    consistency_status: Mapped[ConsistencyStatus | None] = mapped_column(
        SAEnum(ConsistencyStatus, name="profiler_consistency_status"), nullable=True
    )
    consistency_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerRanking(Base):
    __tablename__ = "profiler_rankings"
    __table_args__ = (
        UniqueConstraint("reference_id", "contributor_id", name="uq_profiler_ranking_ref_contributor"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    reference_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_references.id", ondelete="CASCADE"), nullable=False
    )
    contributor_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_contributors.id", ondelete="CASCADE"), nullable=False
    )
    stars: Mapped[int] = mapped_column(Integer, nullable=False)
    tags: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default='{"positive": [], "negative": []}'
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerReferenceAttributes(Base):
    __tablename__ = "profiler_reference_attributes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    reference_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_references.id", ondelete="CASCADE"), nullable=False
    )
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Register the models** — in `app/models/__init__.py`, add the import block and `__all__` entries (mirror the existing `homeowner_property` block):

```python
from app.models.profiler import (
    AreaKind,
    AreaStatus,
    ConsistencyStatus,
    ContributorRole,
    ProfileScope,
    ProfileStatus,
    ProfilerArea,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfilerReferenceAttributes,
    ReferenceSource,
)
```

Add each of those names to the module's `__all__` list.

- [ ] **Step 3: Sanity-check that the tables register** — they're created in tests via `Base.metadata.create_all`, so a quick import proves registration:

Run: `cd constructo/backend && uv run python -c "import app.models as m; print(m.ProfilerProfile.__tablename__, m.ProfilerRanking.__tablename__)"`
Expected: prints `profiler_profiles profiler_rankings` with no ImportError.

- [ ] **Step 4: Generate the migration**

Run: `cd constructo/backend && uv run alembic revision --autogenerate -m "design profiler engine tables"`
Expected: a new file under `alembic/versions/` creating the 6 tables + the named enums.

- [ ] **Step 5: Hand-edit the migration `downgrade()`** to drop the named enums (autogenerate does not). At the end of `downgrade()`, after the `op.drop_table(...)` calls, add:

```python
from sqlalchemy.dialects import postgresql

for enum_name in (
    "profiler_scope",
    "profiler_status",
    "profiler_area_kind",
    "profiler_area_status",
    "profiler_contributor_role",
    "profiler_reference_source",
    "profiler_consistency_status",
):
    postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 6: Apply + verify reversible**

Run:
```bash
cd constructo/backend
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
```
Expected: all three succeed (proves the migration is reversible and the enum-drop works).

- [ ] **Step 7: Commit**

```bash
git add app/models/profiler.py app/models/__init__.py alembic/versions/
git commit -m "feat(profiler): design profiler engine tables (additive profiler_* schema)"
```

---

## Task 2: The deterministic taste reducer (pure, no DB, no LLM)

**Files:** Create `app/profiler/__init__.py` (empty), `app/profiler/taste.py`; Test `tests/test_profiler_taste.py`.

- [ ] **Step 1: Write the failing tests** — `tests/test_profiler_taste.py`

```python
"""Deterministic taste reducer — pure functions, hand-computable assertions."""
from app.profiler.taste import (
    aggregate_dimension_scores,
    build_taste_model,
    check_consistency,
    confidence_score,
    detect_conflicts,
    star_weight,
)


def test_star_weight_maps_1_to_5():
    assert star_weight(5) == 1.0
    assert star_weight(4) == 0.5
    assert star_weight(3) == 0.0
    assert star_weight(2) == -0.5
    assert star_weight(1) == -1.0


def test_aggregate_sums_star_weighted_attribute_values():
    attrs = [
        {"reference_id": "r1", "attributes": {"style": "minimal", "colors": "light"}},
        {"reference_id": "r2", "attributes": {"style": "ornate", "colors": "dark"}},
    ]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},  # +1.0
        {"reference_id": "r2", "contributor_id": "A", "stars": 1, "tags": {}},  # -1.0
    ]
    scores = aggregate_dimension_scores(rankings, attrs)
    assert scores["style"]["minimal"] == 1.0
    assert scores["style"]["ornate"] == -1.0
    assert scores["colors"]["light"] == 1.0
    assert scores["colors"]["dark"] == -1.0


def test_negative_quick_tag_suppresses_a_dimension_value():
    attrs = [{"reference_id": "r1", "attributes": {"lighting": "dark"}}]
    rankings = [{"reference_id": "r1", "contributor_id": "A", "stars": 4,
                 "tags": {"positive": [], "negative": ["too_dark"]}}]
    scores = aggregate_dimension_scores(rankings, attrs)
    # +0.5 from the 4-star, then -1.0 from the too_dark tag => -0.5
    assert scores["lighting"]["dark"] == -0.5


def test_confidence_is_coverage_ratio_clipped_to_one():
    assert confidence_score(0, 6) == 0.0
    assert confidence_score(3, 6) == 0.5
    assert confidence_score(8, 6) == 1.0
    assert confidence_score(2, 0) == 0.0


def test_detect_conflict_between_two_contributors():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},  # likes dark
        {"reference_id": "r1", "contributor_id": "B", "stars": 1, "tags": {}},  # dislikes dark
    ]
    conflicts = detect_conflicts(rankings, attrs)
    assert len(conflicts) == 1
    c = conflicts[0]
    assert c["dimension"] == "colors" and c["value"] == "dark"
    assert {c["contributor_a"], c["contributor_b"]} == {"A", "B"}


def test_no_conflict_when_contributors_agree():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 5, "tags": {}},
    ]
    assert detect_conflicts(rankings, attrs) == []


def test_check_consistency_flags_against_strong_negative():
    scores = {"colors": {"dark": -1.0}, "style": {}, "materials": {}, "lighting": {}}
    assert check_consistency({"colors": "dark"}, scores)["status"] == "conflict"
    assert check_consistency({"colors": "light"}, scores)["status"] == "consistent"


def test_build_taste_model_assembles_everything():
    attrs = [{"reference_id": "r1", "attributes": {"colors": "dark"}}]
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 1, "tags": {}},
    ]
    model = build_taste_model(rankings, attrs, recommended_count=2)
    assert model["ranked_count"] == 1
    assert model["confidence"] == 0.5  # 1 ranked ref / 2 recommended
    assert model["has_conflict"] is True
    assert model["dimensions"]["colors"]["dark"] == 0.0  # +1.0 + -1.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_taste.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.profiler'`

- [ ] **Step 3: Create the package + reducer** — `app/profiler/__init__.py` (empty file) and `app/profiler/taste.py`:

```python
"""Deterministic taste reducer for the Design Profiler.

PURE functions, NO LLM, NO DB. The trust core: confidence and conflicts are math,
never model output. Operates on plain dicts so it is unit-testable without a database.

Input shapes:
  rankings:   [{"reference_id": str, "contributor_id": str, "stars": int, "tags": {"positive": [...], "negative": [...]}}]
  attributes: [{"reference_id": str, "attributes": {"style": str | [str], "materials": [str], "colors": str | [str], "lighting": str, ...}}]
"""
from __future__ import annotations

STAR_WEIGHT = {1: -1.0, 2: -0.5, 3: 0.0, 4: 0.5, 5: 1.0}

# A negative quick-tag suppresses a specific (dimension, value).
NEGATIVE_TAG_DIMENSION = {
    "too_dark": ("lighting", "dark"),
    "too_busy": ("decorative_density", "busy"),
    "too_expensive": ("cost", "premium"),
    "hard_to_maintain": ("maintenance", "high"),
}

DIMENSIONS = ("style", "materials", "colors", "lighting")
CONFLICT_THRESHOLD = 0.5


def star_weight(stars: int) -> float:
    return STAR_WEIGHT[stars]


def _values(raw) -> list:
    if raw is None:
        return []
    return raw if isinstance(raw, list) else [raw]


def aggregate_dimension_scores(rankings: list[dict], attributes: list[dict]) -> dict:
    """{dimension: {value: summed_star_weight}} over all rankings x attribute values,
    then negative quick-tags applied."""
    attrs_by_ref = {a["reference_id"]: a["attributes"] for a in attributes}
    scores: dict[str, dict[str, float]] = {d: {} for d in DIMENSIONS}
    for r in rankings:
        ref_attrs = attrs_by_ref.get(r["reference_id"])
        if not ref_attrs:
            continue
        w = star_weight(r["stars"])
        for dim in DIMENSIONS:
            for v in _values(ref_attrs.get(dim)):
                scores[dim][v] = scores[dim].get(v, 0.0) + w
    for r in rankings:
        for tag in (r.get("tags") or {}).get("negative", []):
            mapping = NEGATIVE_TAG_DIMENSION.get(tag)
            if mapping:
                dim, v = mapping
                scores.setdefault(dim, {})
                scores[dim][v] = scores[dim].get(v, 0.0) - 1.0
    return scores


def confidence_score(ranked_count: int, recommended_count: int) -> float:
    if recommended_count <= 0:
        return 0.0
    return round(min(1.0, ranked_count / recommended_count), 3)


def detect_conflicts(rankings: list[dict], attributes: list[dict]) -> list[dict]:
    """Per (dimension, value): if one contributor's summed weight >= +threshold and
    another's <= -threshold, emit a conflict pair."""
    attrs_by_ref = {a["reference_id"]: a["attributes"] for a in attributes}
    per: dict[tuple, dict[str, float]] = {}
    for r in rankings:
        ref_attrs = attrs_by_ref.get(r["reference_id"])
        if not ref_attrs:
            continue
        w = star_weight(r["stars"])
        c = r["contributor_id"]
        for dim in DIMENSIONS:
            for v in _values(ref_attrs.get(dim)):
                per.setdefault((dim, v), {})
                per[(dim, v)][c] = per[(dim, v)].get(c, 0.0) + w
    conflicts: list[dict] = []
    for (dim, v), bycontrib in per.items():
        likers = sorted(c for c, s in bycontrib.items() if s >= CONFLICT_THRESHOLD)
        dislikers = sorted(c for c, s in bycontrib.items() if s <= -CONFLICT_THRESHOLD)
        for a in likers:
            for b in dislikers:
                conflicts.append(
                    {"dimension": dim, "value": v, "contributor_a": a, "contributor_b": b}
                )
    return conflicts


def check_consistency(reference_attributes: dict, dimension_scores: dict) -> dict:
    """Compare one reference's attributes to the aggregate taste. Advisory, never blocks."""
    worst = 1.0
    for dim in DIMENSIONS:
        for v in _values(reference_attributes.get(dim)):
            worst = min(worst, dimension_scores.get(dim, {}).get(v, 0.0))
    if worst <= -CONFLICT_THRESHOLD:
        return {"status": "conflict", "reason": "Goes against your stronger preferences"}
    if worst < 0:
        return {"status": "tension", "reason": "A slight departure from your direction"}
    return {"status": "consistent", "reason": "Fits your style"}


def build_taste_model(rankings: list[dict], attributes: list[dict], recommended_count: int) -> dict:
    ranked_count = len({r["reference_id"] for r in rankings})
    conflicts = detect_conflicts(rankings, attributes)
    return {
        "dimensions": aggregate_dimension_scores(rankings, attributes),
        "ranked_count": ranked_count,
        "recommended_count": recommended_count,
        "confidence": confidence_score(ranked_count, recommended_count),
        "conflicts": conflicts,
        "has_conflict": len(conflicts) > 0,
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_taste.py -v`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/profiler/__init__.py app/profiler/taste.py tests/test_profiler_taste.py
git commit -m "feat(profiler): deterministic taste reducer (taste model, confidence, conflicts)"
```

---

## Task 3: Schemas + router (create/get profile, add contributor) + app wiring

**Files:** Create `app/profiler/schemas.py`, `app/profiler/router.py`; Modify `app/main.py`; Test `tests/test_profiler_api.py`.

- [ ] **Step 1: Write the schemas** — `app/profiler/schemas.py`

```python
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.profiler import (
    AreaKind,
    ContributorRole,
    ProfileScope,
    ProfileStatus,
    ReferenceSource,
)


class AreaIn(BaseModel):
    area_kind: AreaKind
    area_key: str = Field(min_length=1, max_length=64)
    space_id: UUID | None = None
    component_id: UUID | None = None
    recommended_count: int = 6


class ContributorIn(BaseModel):
    member_id: UUID | None = None
    user_id: UUID | None = None
    role: ContributorRole
    is_decision_owner: bool = False


class ProfileCreate(BaseModel):
    site_id: UUID
    scope_type: ProfileScope = ProfileScope.whole_house
    areas: list[AreaIn] = Field(default_factory=list)
    contributors: list[ContributorIn] = Field(default_factory=list)


class AreaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_kind: AreaKind
    area_key: str
    recommended_count: int
    status: str
    confidence: float
    has_conflict: bool


class ContributorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: ContributorRole
    is_decision_owner: bool


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    site_id: UUID
    scope_type: ProfileScope
    status: ProfileStatus
    created_at: datetime


class ProfileDetailOut(ProfileOut):
    areas: list[AreaOut] = []
    contributors: list[ContributorOut] = []


class ReferenceIn(BaseModel):
    area_id: UUID
    contributor_id: UUID | None = None
    source_type: ReferenceSource = ReferenceSource.upload
    image_r2_key: str | None = None
    source_url: str | None = None
    preset_id: str | None = None


class ReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    area_id: UUID
    source_type: ReferenceSource
    consistency_status: str | None = None
    created_at: datetime


class RankingIn(BaseModel):
    contributor_id: UUID
    stars: int = Field(ge=1, le=5)
    tags: dict = Field(default_factory=lambda: {"positive": [], "negative": []})
    note: str | None = None
```

- [ ] **Step 2: Write the failing test** — `tests/test_profiler_api.py`

```python
"""Design Profiler API — endpoint + e2e tests."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_create_and_get_profile_with_areas_and_contributors(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)

    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "scope_type": "rooms",
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
            "contributors": [{"role": "co_owner", "is_decision_owner": True}],
        },
        headers=auth(architect),
    )
    assert created.status_code == 201
    pid = created.json()["id"]
    assert created.json()["status"] == "intake_started"

    detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["areas"]) == 1 and body["areas"][0]["area_key"] == "kitchen"
    assert len(body["contributors"]) == 1 and body["contributors"][0]["role"] == "co_owner"


async def test_get_profile_is_company_scoped(client, factory):
    company_a = await factory.company()
    architect_a = await factory.user(company=company_a, role=UserRole.architect)
    site = await factory.site(company_a)
    created = await client.post(
        "/api/v1/design/profiles",
        json={"site_id": str(site.id), "areas": [], "contributors": []},
        headers=auth(architect_a),
    )
    pid = created.json()["id"]

    other = await factory.user(role=UserRole.architect)  # different company
    resp = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(other))
    assert resp.status_code == 404
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py -v`
Expected: FAIL — 404 (route not registered) / ImportError on the router.

- [ ] **Step 4: Write the router** — `app/profiler/router.py`

```python
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import User, UserRole
from app.models.profiler import (
    ProfilerArea,
    ProfilerContributor,
    ProfilerProfile,
    ProfileStatus,
)
from app.profiler.schemas import (
    AreaOut,
    ContributorIn,
    ContributorOut,
    ProfileCreate,
    ProfileDetailOut,
    ProfileOut,
)

router = APIRouter(prefix="/api/v1/design", tags=["design-profiler"])

# Who may create/edit a profile on the contractor side (homeowner-side gating is added in Plan 3).
_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.architect, UserRole.supervisor)


async def _load_owned_profile(session: AsyncSession, profile_id: UUID, user: User) -> ProfilerProfile:
    profile = await session.get(ProfilerProfile, profile_id)
    if profile is None or profile.company_id != user.company_id:
        raise AppError(404, "not_found", "Profile not found")
    return profile


@router.post("/profiles", response_model=ProfileOut, status_code=201)
async def create_profile(
    body: ProfileCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    profile = ProfilerProfile(
        company_id=user.company_id,
        site_id=body.site_id,
        scope_type=body.scope_type,
        created_by=user.id,
        status=ProfileStatus.intake_started,
    )
    session.add(profile)
    await session.flush()
    for a in body.areas:
        session.add(
            ProfilerArea(
                profile_id=profile.id,
                area_kind=a.area_kind,
                area_key=a.area_key,
                space_id=a.space_id,
                component_id=a.component_id,
                recommended_count=a.recommended_count,
            )
        )
    for c in body.contributors:
        session.add(
            ProfilerContributor(
                profile_id=profile.id,
                member_id=c.member_id,
                user_id=c.user_id,
                role=c.role,
                is_decision_owner=c.is_decision_owner,
            )
        )
    await session.commit()
    await session.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.get("/profiles/{profile_id}", response_model=ProfileDetailOut)
async def get_profile(
    profile_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    profile = await _load_owned_profile(session, profile_id, user)
    areas = (
        (await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile_id)))
        .scalars()
        .all()
    )
    contributors = (
        (
            await session.execute(
                select(ProfilerContributor).where(ProfilerContributor.profile_id == profile_id)
            )
        )
        .scalars()
        .all()
    )
    out = ProfileDetailOut.model_validate(profile)
    out.areas = [AreaOut.model_validate(a) for a in areas]
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    return out


@router.post("/profiles/{profile_id}/contributors", status_code=201)
async def add_contributor(
    profile_id: UUID,
    body: ContributorIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    profile = await _load_owned_profile(session, profile_id, user)
    c = ProfilerContributor(
        profile_id=profile.id,
        member_id=body.member_id,
        user_id=body.user_id,
        role=body.role,
        is_decision_owner=body.is_decision_owner,
    )
    session.add(c)
    await session.commit()
    return {"id": str(c.id)}
```

- [ ] **Step 5: Wire the router into the app** — in `app/main.py`, add the import near the other router imports:

```python
from app.profiler.router import router as profiler_router
```

and add the include **inside the existing `if settings.enable_labs:` block** (so it's Labs-gated like dispute-pack/vendor-confirm):

```python
    app.include_router(profiler_router)  # Design Profiler engine (Plan A) — Labs-gated until Phase 2
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py -v`
Expected: PASS (both tests)

- [ ] **Step 7: Commit**

```bash
git add app/profiler/schemas.py app/profiler/router.py app/main.py tests/test_profiler_api.py
git commit -m "feat(profiler): profiles API (create/get with areas+contributors), Labs-gated"
```

---

## Task 4: References + per-contributor rankings

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_api.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_api.py`

```python
async def _profile_with_area_and_two_contributors(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
            "contributors": [{"role": "co_owner", "is_decision_owner": True}, {"role": "co_owner"}],
        },
        headers=auth(architect),
    )
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_ids = [c["id"] for c in detail["contributors"]]
    return architect, pid, area_id, contrib_ids


async def test_add_reference_and_rank_per_contributor(client, factory):
    architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)

    ref = await client.post(
        "/api/v1/design/references",
        json={"area_id": area_id, "contributor_id": contrib_ids[0], "source_type": "upload"},
        headers=auth(architect),
    )
    assert ref.status_code == 201
    ref_id = ref.json()["id"]

    for cid, stars in ((contrib_ids[0], 5), (contrib_ids[1], 1)):
        r = await client.post(
            f"/api/v1/design/references/{ref_id}/rankings",
            json={"contributor_id": cid, "stars": stars},
            headers=auth(architect),
        )
        assert r.status_code == 201

    # re-rank by the same contributor updates (upsert), does not duplicate
    again = await client.post(
        f"/api/v1/design/references/{ref_id}/rankings",
        json={"contributor_id": contrib_ids[0], "stars": 4},
        headers=auth(architect),
    )
    assert again.status_code == 201
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py::test_add_reference_and_rank_per_contributor -v`
Expected: FAIL — 404 (routes not defined).

- [ ] **Step 3: Add the endpoints** — in `app/profiler/router.py`, extend the imports and add the routes. Update the model import line to include the reference/ranking models, and add `ReferenceIn, ReferenceOut, RankingIn` to the schemas import:

```python
from app.models.profiler import (
    ProfilerArea,
    ProfilerContributor,
    ProfilerProfile,
    ProfilerRanking,
    ProfilerReference,
    ProfileStatus,
)
from app.profiler.schemas import (
    AreaOut,
    ContributorIn,
    ContributorOut,
    ProfileCreate,
    ProfileDetailOut,
    ProfileOut,
    RankingIn,
    ReferenceIn,
    ReferenceOut,
)
```

Then add:

```python
@router.post("/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> ReferenceOut:
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    await _load_owned_profile(session, area.profile_id, user)
    ref = ProfilerReference(
        profile_id=area.profile_id,
        area_id=area.id,
        contributor_id=body.contributor_id,
        source_type=body.source_type,
        image_r2_key=body.image_r2_key,
        source_url=body.source_url,
        preset_id=body.preset_id,
    )
    session.add(ref)
    await session.commit()
    await session.refresh(ref)
    return ReferenceOut.model_validate(ref)


@router.post("/references/{reference_id}/rankings", status_code=201)
async def rank_reference(
    reference_id: UUID,
    body: RankingIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    ref = await session.get(ProfilerReference, reference_id)
    if ref is None:
        raise AppError(404, "not_found", "Reference not found")
    await _load_owned_profile(session, ref.profile_id, user)
    existing = (
        await session.execute(
            select(ProfilerRanking).where(
                ProfilerRanking.reference_id == reference_id,
                ProfilerRanking.contributor_id == body.contributor_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.stars = body.stars
        existing.tags = body.tags
        existing.note = body.note
    else:
        session.add(
            ProfilerRanking(
                reference_id=reference_id,
                contributor_id=body.contributor_id,
                stars=body.stars,
                tags=body.tags,
                note=body.note,
            )
        )
    await session.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py -v`
Expected: PASS (all profile/reference/ranking tests).

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py tests/test_profiler_api.py
git commit -m "feat(profiler): reference add + per-contributor ranking (upsert)"
```

---

## Task 5: The deterministic taste read endpoint

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_api.py`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_profiler_api.py`. This inserts attribute rows directly (vision is Task 6) so the taste math is isolated.

```python
from app.models import Space, SpaceKind  # noqa: E402  (top-of-file import in real edit)
from app.models.profiler import ProfilerReferenceAttributes  # noqa: E402


async def test_area_taste_is_deterministic_with_conflict(client, factory, db_session):
    architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)

    # one reference, both contributors rank it oppositely
    ref = await client.post(
        "/api/v1/design/references",
        json={"area_id": area_id, "contributor_id": contrib_ids[0], "source_type": "upload"},
        headers=auth(architect),
    )
    ref_id = ref.json()["id"]
    from uuid import UUID as _UUID
    db_session.add(
        ProfilerReferenceAttributes(reference_id=_UUID(ref_id), attributes={"colors": "dark"})
    )
    await db_session.commit()

    for cid, stars in ((contrib_ids[0], 5), (contrib_ids[1], 1)):
        await client.post(
            f"/api/v1/design/references/{ref_id}/rankings",
            json={"contributor_id": cid, "stars": stars},
            headers=auth(architect),
        )

    taste = await client.get(
        f"/api/v1/design/profiles/{pid}/areas/{area_id}/taste", headers=auth(architect)
    )
    assert taste.status_code == 200
    body = taste.json()
    assert body["confidence"] == 0.5           # 1 ranked ref / recommended 2
    assert body["has_conflict"] is True
    assert body["dimensions"]["colors"]["dark"] == 0.0  # +1.0 (5★) + -1.0 (1★)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py::test_area_taste_is_deterministic_with_conflict -v`
Expected: FAIL — 404 (taste route not defined).

- [ ] **Step 3: Add the endpoint** — in `app/profiler/router.py`, add `ProfilerReferenceAttributes` to the model imports and `from app.profiler.taste import build_taste_model` at the top, then add:

```python
@router.get("/profiles/{profile_id}/areas/{area_id}/taste")
async def get_area_taste(
    profile_id: UUID,
    area_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _load_owned_profile(session, profile_id, user)
    area = await session.get(ProfilerArea, area_id)
    if area is None or area.profile_id != profile_id:
        raise AppError(404, "not_found", "Area not found")

    ref_ids = (
        (await session.execute(select(ProfilerReference.id).where(ProfilerReference.area_id == area_id)))
        .scalars()
        .all()
    )
    rankings, attrs = [], []
    if ref_ids:
        rank_rows = (
            await session.execute(
                select(ProfilerRanking).where(ProfilerRanking.reference_id.in_(ref_ids))
            )
        ).scalars().all()
        attr_rows = (
            await session.execute(
                select(ProfilerReferenceAttributes).where(
                    ProfilerReferenceAttributes.reference_id.in_(ref_ids)
                )
            )
        ).scalars().all()
        rankings = [
            {
                "reference_id": str(r.reference_id),
                "contributor_id": str(r.contributor_id),
                "stars": r.stars,
                "tags": r.tags,
            }
            for r in rank_rows
        ]
        attrs = [{"reference_id": str(a.reference_id), "attributes": a.attributes} for a in attr_rows]

    model = build_taste_model(rankings, attrs, area.recommended_count)
    # Persist the deterministic summary back onto the area (no LLM involved here).
    area.taste_model = model["dimensions"]
    area.confidence = model["confidence"]
    area.has_conflict = model["has_conflict"]
    await session.commit()
    return model
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_api.py -v`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add app/profiler/router.py tests/test_profiler_api.py
git commit -m "feat(profiler): deterministic area taste endpoint (reducer over DB rows)"
```

---

## Task 6: Vision attribute extraction (LLM proposes; FakeLLM in CI)

**Files:** Create `app/profiler/extraction.py`; Modify `app/profiler/router.py` (extract on reference-add); Test `tests/test_profiler_extraction.py`.

- [ ] **Step 1: Write the failing test** — `tests/test_profiler_extraction.py`

```python
"""Vision extraction proposes attributes from an image; a human never sees raw guesses."""
from app.extraction.llm import FakeLLMClient
from app.profiler.extraction import extract_reference_attributes


async def test_extract_passes_image_and_returns_attributes():
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"],
              "lighting": "warm", "confidence": 0.9}
    llm = FakeLLMClient(canned=canned)
    out = await extract_reference_attributes(llm, "data:image/jpeg;base64,AAAA")
    assert out["style"] == "minimal"
    assert llm.calls[-1]["image_url"] == "data:image/jpeg;base64,AAAA"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_extraction.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.profiler.extraction'`

- [ ] **Step 3: Write the extraction helper** — `app/profiler/extraction.py`

```python
"""Vision extraction for the Design Profiler: an inspiration image -> proposed design
attributes. The LLM PROPOSES; the deterministic reducer (taste.py) decides. Leaves
fields null rather than guessing."""
from app.extraction.llm import LLMClient, get_llm_client

PROFILER_VISION_SYSTEM = (
    "You read a single interior or architecture inspiration image for a homeowner's design "
    "profile. Extract only the design attributes that are clearly visible. Never guess; use null "
    "or an empty list when something is not clearly visible. 'style' is the overall look "
    "(e.g. contemporary minimal, warm traditional); 'materials' and 'colors' are short lists; "
    "'lighting' is the light mood; 'decorative_density' is plain|moderate|busy."
)

PROFILER_VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "style": {"type": ["string", "null"]},
        "materials": {"type": "array", "items": {"type": "string"}},
        "colors": {"type": "array", "items": {"type": "string"}},
        "lighting": {"type": ["string", "null"]},
        "decorative_density": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
}


def get_llm() -> LLMClient:
    """Injectable LLM client (overridden in tests with a FakeLLMClient)."""
    return get_llm_client()


async def extract_reference_attributes(llm: LLMClient, image_url: str) -> dict:
    return await llm.complete_vision(
        PROFILER_VISION_SYSTEM,
        "Extract the design attributes from this inspiration image.",
        image_url,
        PROFILER_VISION_SCHEMA,
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_extraction.py -v`
Expected: PASS

- [ ] **Step 5: Wire extraction into reference-add (inline, fail-safe)** — in `app/profiler/router.py`, add imports:

```python
from app.extraction.llm import LLMClient
from app.models.profiler import ProfilerReferenceAttributes
from app.profiler.extraction import extract_reference_attributes, get_llm
from app.profiler.taste import build_taste_model, check_consistency
```

Then change `add_reference` to accept an injected `llm` and, when the reference carries an image, extract + store attributes + compute an advisory consistency status. Replace the existing `add_reference` body's tail (after `await session.refresh(ref)`) so the full function reads:

```python
@router.post("/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceIn,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ReferenceOut:
    area = await session.get(ProfilerArea, body.area_id)
    if area is None:
        raise AppError(404, "not_found", "Area not found")
    await _load_owned_profile(session, area.profile_id, user)
    ref = ProfilerReference(
        profile_id=area.profile_id,
        area_id=area.id,
        contributor_id=body.contributor_id,
        source_type=body.source_type,
        image_r2_key=body.image_r2_key,
        source_url=body.source_url,
        preset_id=body.preset_id,
    )
    session.add(ref)
    await session.flush()

    image_url = body.source_url or body.image_r2_key
    if image_url:
        try:
            attrs = await extract_reference_attributes(llm, image_url)
        except Exception:  # never fail the request on extraction
            attrs = None
        if attrs:
            confidence = float(attrs.get("confidence") or 0.0)
            session.add(
                ProfilerReferenceAttributes(
                    reference_id=ref.id, attributes=attrs, confidence=confidence
                )
            )
            verdict = check_consistency(attrs, area.taste_model or {})
            ref.consistency_status = verdict["status"]
            ref.consistency_note = verdict["reason"]

    await session.commit()
    await session.refresh(ref)
    return ReferenceOut.model_validate(ref)
```

(`build_taste_model` import is already used by Task 5; keep the single import line.)

- [ ] **Step 6: Add an endpoint test with the fake LLM** — append to `tests/test_profiler_extraction.py`:

```python
from app.auth.jwt import create_access_token
from app.main import app
from app.models import UserRole
from app.profiler.extraction import get_llm


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_reference_add_extracts_and_stores_attributes(client, factory):
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"], "confidence": 0.8}
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post(
            "/api/v1/design/profiles",
            json={"site_id": str(site.id),
                  "areas": [{"area_kind": "interior", "area_key": "kitchen"}],
                  "contributors": []},
            headers=_auth(architect),
        )
        pid = created.json()["id"]
        area_id = (await client.get(f"/api/v1/design/profiles/{pid}", headers=_auth(architect))).json()["areas"][0]["id"]

        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/pin.jpg"},
            headers=_auth(architect),
        )
        assert ref.status_code == 201
        assert ref.json()["consistency_status"] == "consistent"  # empty taste -> consistent
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_extraction.py -v`
Expected: PASS (both tests)

- [ ] **Step 8: Commit**

```bash
git add app/profiler/extraction.py app/profiler/router.py tests/test_profiler_extraction.py
git commit -m "feat(profiler): vision attribute extraction on reference-add (LLM proposes, fail-safe)"
```

---

## Task 7: End-to-end engine test + full suite + lint

**Files:** Test append to `tests/test_profiler_api.py`.

- [ ] **Step 1: Write the e2e test** — append to `tests/test_profiler_api.py`. Uses the fake LLM so both references get the same `colors: ["dark"]` attributes, and two co-owners rank them oppositely → a real multi-owner conflict surfaces deterministically.

```python
from app.extraction.llm import FakeLLMClient  # noqa: E402
from app.main import app  # noqa: E402
from app.profiler.extraction import get_llm  # noqa: E402


async def test_e2e_two_owners_conflict_surfaces_in_taste(client, factory):
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(
        canned={"colors": ["dark"], "style": "ornate", "confidence": 0.9}
    )
    try:
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(client, factory)
        ref_ids = []
        for _ in range(2):
            r = await client.post(
                "/api/v1/design/references",
                json={"area_id": area_id, "source_type": "upload",
                      "source_url": "https://example.test/dark.jpg"},
                headers=auth(architect),
            )
            ref_ids.append(r.json()["id"])

        # owner A loves both (5★), owner B dislikes both (1★)
        for ref_id in ref_ids:
            await client.post(f"/api/v1/design/references/{ref_id}/rankings",
                              json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))
            await client.post(f"/api/v1/design/references/{ref_id}/rankings",
                              json={"contributor_id": contrib_ids[1], "stars": 1}, headers=auth(architect))

        taste = (await client.get(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/taste", headers=auth(architect)
        )).json()
        assert taste["has_conflict"] is True
        assert taste["confidence"] == 1.0  # 2 ranked refs / recommended 2
        assert any(c["dimension"] == "colors" and c["value"] == "dark" for c in taste["conflicts"])
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run the full profiler suite**

Run:
```bash
cd constructo/backend
uv run pytest tests/test_profiler_taste.py tests/test_profiler_api.py tests/test_profiler_extraction.py -v
```
Expected: all green.

- [ ] **Step 3: Lint**

Run: `cd constructo/backend && uv run ruff check app/profiler app/models/profiler.py tests/test_profiler_taste.py tests/test_profiler_api.py tests/test_profiler_extraction.py`
Expected: clean. (Move the mid-file imports flagged with `# noqa: E402` to the top of the test files if ruff prefers; keep them grouped.)

- [ ] **Step 4: Commit**

```bash
git add tests/test_profiler_api.py
git commit -m "test(profiler): e2e multi-owner conflict surfaces deterministically in area taste"
```

---

## Self-Review

**Spec coverage (against `docs/superpowers/specs/2026-06-12-design-profiler-engine-design.md`):**
- §4 data model clusters ① scope/contributors + ② inputs/signal → Tasks 1, 3, 4, 6 ✓. (Clusters ③ AI outputs + ④ brief/approval are **Plan 3** by design — out of scope here.)
- §6 deterministic pipeline: extract (Task 6) → aggregate/confidence/conflict reducer (Task 2) → taste read (Task 5) ✓. Theme/brief narration = Plan 3.
- §7 contract: profiles/areas/contributors/references/rankings/taste subset implemented; themes/brief/approval = Plan 3 ✓.
- §8 membrane: `_EDIT_ROLES` + company-scoping + Labs-gating in place; the **homeowner-side capability gate + cross-role visibility matrix is Plan 3** (noted, not silently dropped).
- §10 testing: pure-reducer unit tests, FakeLLM (no Azure spend), e2e multi-owner conflict ✓.
- Determinism: confidence/conflict are reducer math; LLM only proposes attributes; persisted area summary comes from `build_taste_model`, never the model ✓.

**Placeholder scan:** none — every step has runnable code/commands and expected output.

**Type consistency:** reducer input dict shape (`reference_id`/`contributor_id`/`stars`/`tags`, and `attributes`) is identical in `taste.py`, the taste endpoint (Task 5), and tests. `build_taste_model(rankings, attributes, recommended_count)` and `check_consistency(attrs, dimension_scores)` are called with matching signatures everywhere. `get_llm` is the dependency-override key in both the endpoint and the extraction test. Model/enum names match `app/models/profiler.py` throughout.

**Deferred to later plans (explicit, not dropped):** themes / clarifications / conflicts-resolution / brief generation + renderings + approval + state-machine transitions + homeowner capability gates (Plan 3); Pinterest `from-link` oEmbed endpoint (Plan 3 or a fast-follow); RQ async extraction (optimization); the brief→Material/Spec bridge (sub-project C).

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.
