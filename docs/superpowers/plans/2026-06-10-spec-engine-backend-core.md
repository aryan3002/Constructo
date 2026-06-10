# Spec Engine (Backend Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the contractor's Material Specification Schedule into live, deterministic backend data — a `Spec` line-item (material × component) with quantities, rates, approval, and a costing rollup — so the spreadsheet becomes one queryable source of truth.

**Architecture:** Add one new model (`Spec`) that binds an existing `Component` (room→wall work item) to an existing `Material` (catalog row), plus per-instance fields (qty, wastage, rate, approval, assignee). Extend `Material` with catalog attributes (brand/sku/colour/finish/size/thickness/catalog_url) and `Component` with site-audit granularity (location, assignee, progress_pct). Costing is a **pure deterministic reducer** over `Spec` rows — the LLM never produces a number. Everything is contractor-internal (company-scoped), mirroring the existing `materials` feature.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, Postgres, pytest-asyncio. Run from `constructo/backend/` with `uv`.

**Scope:** This plan is the **backend data core only** (model + CRUD + approval + costing). It is self-contained and testable. Follow-on plans (write separately, in this order): (1) `.xlsx` importer to seed from the real CivilArch sheet; (2) AI spec-line extraction (photo/voice → proposed Spec); (3) web "spec desk" UI; (4) homeowner room-slice surfacing + client-approval wiring via `Decision`.

**Roles (confirmed 2026-06-10):** for the CivilArch interior-fit-out profile the spec is maintained by the **Architect** (Anamika — owns the Material Spec + design decisions) + the **Site Engineer** (Vikas — execution/capture), with design **approved by the Architect** then signed off by the **Client** (homeowner). The `architect` role is **not in the `UserRole` enum yet** — adding it is a small separate change (first check whether `users.role` is a Postgres ENUM needing `ALTER TYPE ... ADD VALUE` or a plain `String`). **Interim for this plan:** the edit gate uses the existing `owner, pm, supervisor` (Site Engineer == `supervisor`; Architect maps to `pm` until its own role lands) and the approve gate uses `owner, pm`. Swap `pm → architect` in `_EDIT_ROLES`/`_APPROVE_ROLES` once the role exists. The homeowner/Client client-approval is wired in follow-on plan (4) via `Decision`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/spec.py` (create) | The `Spec` ORM model + `SpecApprovalStatus` enum |
| `app/models/material.py` (modify) | Add catalog columns (brand, sku, colour, finish, size, thickness, catalog_url) |
| `app/models/homeowner_property.py` (modify) | Add to `Component`: location, assignee_id, progress_pct |
| `app/models/__init__.py` (modify) | Export `Spec`, `SpecApprovalStatus` |
| `alembic/versions/<rev>_spec_engine.py` (create, via autogenerate) | Migration: `specs` table + `spec_approval_status` enum + new columns |
| `app/specs/__init__.py` (create) | Package marker |
| `app/specs/schemas.py` (create) | Pydantic request/response models |
| `app/specs/costing.py` (create) | Pure deterministic costing reducer |
| `app/specs/router.py` (create) | CRUD + approve + rollup endpoints |
| `app/main.py` (modify) | Register `specs_router` |
| `tests/test_specs.py` (create) | CRUD + approval + scoping tests |
| `tests/test_spec_costing.py` (create) | Pure reducer unit tests |

---

## Task 1: The `Spec` model + Material/Component extensions + migration

**Files:**
- Create: `app/models/spec.py`
- Modify: `app/models/material.py` (after line 34, inside class)
- Modify: `app/models/homeowner_property.py` (Component class)
- Modify: `app/models/__init__.py`
- Create (via autogenerate): `alembic/versions/<rev>_spec_engine.py`
- Test: `tests/test_specs.py`

- [ ] **Step 1: Write the failing test** — `tests/test_specs.py`

```python
"""Spec engine — Material Specification line items (Spec)."""
from decimal import Decimal

from app.auth.jwt import create_access_token
from app.models import (
    Component,
    Property,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _room_with_component(factory, db_session, company, site):
    """Seed a Space (room) + Component (wall work item) for the site."""
    room = Space(site_id=site.id, name="Master Bedroom", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()
    comp = Component(space_id=room.id, name="Bed Head Wall", location="Wall A")
    db_session.add(comp)
    await db_session.flush()
    return room, comp


async def test_spec_row_persists(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        label="Laminate-1",
        qty=Decimal("5"),
        unit="sheets",
        unit_rate=Decimal("1200"),
    )
    db_session.add(spec)
    await db_session.commit()
    await db_session.refresh(spec)

    assert spec.approval_status is SpecApprovalStatus.pending
    assert spec.client_final_code is None
    assert spec.qty == Decimal("5")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_spec_row_persists -v`
Expected: FAIL — `ImportError: cannot import name 'Spec' from 'app.models'`

- [ ] **Step 3: Create the model** — `app/models/spec.py`

```python
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SpecApprovalStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Spec(Base):
    """One row of the Material Specification Schedule: a material instance bound
    to a specific component/wall. AI may propose; a human commits. Costing is
    summed deterministically from these rows — never produced by an LLM.
    """

    __tablename__ = "specs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    component_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("components.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("materials.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Laminate-1", "Louvers"
    qty: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)
    wastage_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    unit_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # rupees/unit
    approval_status: Mapped[SpecApprovalStatus] = mapped_column(
        SAEnum(SpecApprovalStatus, name="spec_approval_status"),
        nullable=False,
        server_default=SpecApprovalStatus.pending.value,
    )
    client_final_code: Mapped[str | None] = mapped_column(String, nullable=True)
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 4: Extend `Material`** — add to `app/models/material.py` inside `class Material`, immediately after the `notes` column (around line 30):

```python
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    sku: Mapped[str | None] = mapped_column(String, nullable=True)
    colour: Mapped[str | None] = mapped_column(String, nullable=True)
    finish: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[str | None] = mapped_column(String, nullable=True)
    thickness: Mapped[str | None] = mapped_column(String, nullable=True)
    catalog_url: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 5: Extend `Component`** — in `app/models/homeowner_property.py`, add `Integer` to the existing `sqlalchemy` import line if not present, then add inside `class Component` after the `status` column:

```python
    location: Mapped[str | None] = mapped_column(String, nullable=True)  # wall / sub-location
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
```

- [ ] **Step 6: Export the model** — in `app/models/__init__.py`, add `from app.models.spec import Spec, SpecApprovalStatus` (matching the existing import style) and add `"Spec"` and `"SpecApprovalStatus"` to `__all__` if the file defines one.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_spec_row_persists -v`
Expected: PASS (the test DB builds tables from model metadata, so the new model is picked up automatically)

- [ ] **Step 8: Generate the real-DB migration**

Run:
```bash
cd constructo/backend
DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo" \
  uv run alembic revision --autogenerate -m "spec engine: specs table + material/component fields"
```
Open the generated file under `alembic/versions/`. Confirm `upgrade()` contains: `op.create_table("specs", ...)`, the `spec_approval_status` ENUM, and `op.add_column(...)` for the 7 material columns + 3 component columns. Confirm `downgrade()` reverses them (drop table, drop the enum with `postgresql.ENUM(name="spec_approval_status").drop(op.get_bind(), checkfirst=True)`, drop the added columns). If autogenerate missed the enum drop, add it by hand (see `alembic/versions/f8a9b0c1d2e3_action_items.py` for the exact pattern).

- [ ] **Step 9: Apply and verify the migration**

Run:
```bash
DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo" \
  uv run alembic upgrade head
```
Expected: no error; `specs` table created.

- [ ] **Step 10: Commit**

```bash
git add app/models/spec.py app/models/material.py app/models/homeowner_property.py app/models/__init__.py alembic/versions tests/test_specs.py
git commit -m "feat(specs): Spec model + Material/Component fields + migration"
```

---

## Task 2: Spec schemas + create/list/get endpoints

**Files:**
- Create: `app/specs/__init__.py` (empty)
- Create: `app/specs/schemas.py`
- Create: `app/specs/router.py`
- Modify: `app/main.py`
- Test: `tests/test_specs.py`

- [ ] **Step 1: Write the failing test** — append to `tests/test_specs.py`

```python
async def test_supervisor_creates_owner_lists_specs(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company)  # role defaults to owner
    sup = await factory.user(company=company, role=__import__("app.models", fromlist=["UserRole"]).UserRole.supervisor)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={
            "site_id": str(site.id),
            "component_id": str(comp.id),
            "label": "Laminate-1",
            "qty": "5",
            "unit": "sheets",
            "unit_rate": "1200",
        },
        headers=auth(sup),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["label"] == "Laminate-1"
    assert body["approval_status"] == "pending"

    listed = await client.get(f"/api/v1/specs?site_id={site.id}", headers=auth(owner))
    assert listed.status_code == 200
    assert [s["label"] for s in listed.json()] == ["Laminate-1"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_supervisor_creates_owner_lists_specs -v`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Write the schemas** — `app/specs/schemas.py`

```python
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import SpecApprovalStatus


class SpecCreate(BaseModel):
    site_id: UUID
    component_id: UUID
    material_id: UUID | None = None
    label: str = Field(min_length=1, max_length=200)
    qty: Decimal | None = None
    unit: str | None = Field(default=None, max_length=32)
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    client_final_code: str | None = Field(default=None, max_length=200)
    assignee_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SpecUpdate(BaseModel):
    material_id: UUID | None = None
    label: str | None = Field(default=None, min_length=1, max_length=200)
    qty: Decimal | None = None
    unit: str | None = Field(default=None, max_length=32)
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    client_final_code: str | None = Field(default=None, max_length=200)
    assignee_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SpecApprove(BaseModel):
    status: SpecApprovalStatus
    client_final_code: str | None = Field(default=None, max_length=200)


class SpecOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    site_id: UUID
    component_id: UUID
    material_id: UUID | None
    label: str
    qty: Decimal | None
    unit: str | None
    wastage_pct: Decimal | None
    unit_rate: Decimal | None
    approval_status: SpecApprovalStatus
    client_final_code: str | None
    assignee_id: UUID | None
    notes: str | None
    created_at: datetime
```

- [ ] **Step 4: Write create/list/get in the router** — `app/specs/router.py`

```python
"""Material Specification line items (the Spec engine).

A Spec is a material instance bound to a component/wall. Reads are open to any
company member; create/edit is owner/pm/supervisor; approval is owner/pm.
Company-scoped, mirroring app/materials/router.py.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import Spec, User, UserRole
from app.specs.schemas import SpecApprove, SpecCreate, SpecOut, SpecUpdate

router = APIRouter(prefix="/api/v1/specs", tags=["specs"])

_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.supervisor)
_APPROVE_ROLES = (UserRole.owner, UserRole.pm)


@router.get("", response_model=list[SpecOut])
async def list_specs(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SpecOut]:
    stmt = (
        select(Spec)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
        .order_by(Spec.created_at)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [SpecOut.model_validate(s) for s in rows]


@router.post("", response_model=SpecOut, status_code=201)
async def create_spec(
    body: SpecCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = Spec(company_id=user.company_id, **body.model_dump())
    session.add(spec)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.get("/{spec_id}", response_model=SpecOut)
async def get_spec(
    spec_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    return SpecOut.model_validate(spec)
```

- [ ] **Step 5: Register the router** — in `app/main.py`, add the import near the other router imports: `from app.specs.router import router as specs_router`, and add `app.include_router(specs_router)` in the registration block (after `materials_router`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_supervisor_creates_owner_lists_specs -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/specs tests/test_specs.py app/main.py
git commit -m "feat(specs): create/list/get spec endpoints"
```

---

## Task 3: Update + approve endpoints

**Files:**
- Modify: `app/specs/router.py`
- Test: `tests/test_specs.py`

- [ ] **Step 1: Write the failing tests** — append to `tests/test_specs.py`

```python
from app.models import UserRole


async def test_update_and_approve_spec(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Louvers"},
        headers=auth(owner),
    )
    spec_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/specs/{spec_id}",
        json={"qty": "12", "unit_rate": "300", "unit": "rft"},
        headers=auth(owner),
    )
    assert updated.status_code == 200
    assert updated.json()["qty"] == "12.00"

    approved = await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved", "client_final_code": "OS-9006-02"},
        headers=auth(owner),
    )
    assert approved.status_code == 200
    assert approved.json()["approval_status"] == "approved"
    assert approved.json()["client_final_code"] == "OS-9006-02"


async def test_supervisor_cannot_approve(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()
    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Paint"},
        headers=auth(owner),
    )
    spec_id = created.json()["id"]
    resp = await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved"},
        headers=auth(sup),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py -k "update_and_approve or supervisor_cannot_approve" -v`
Expected: FAIL — 405/404 (no PATCH or /approve route)

- [ ] **Step 3: Add update + approve to the router** — append to `app/specs/router.py`

```python
@router.patch("/{spec_id}", response_model=SpecOut)
async def update_spec(
    spec_id: UUID,
    body: SpecUpdate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(spec, field, value)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.post("/{spec_id}/approve", response_model=SpecOut)
async def approve_spec(
    spec_id: UUID,
    body: SpecApprove,
    user: User = Depends(require_role(*_APPROVE_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    spec.approval_status = body.status
    if body.client_final_code is not None:
        spec.client_final_code = body.client_final_code
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py -k "update_and_approve or supervisor_cannot_approve" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/specs/router.py tests/test_specs.py
git commit -m "feat(specs): update + approve endpoints (approval gated to owner/pm)"
```

---

## Task 4: Deterministic costing rollup

**Files:**
- Create: `app/specs/costing.py`
- Modify: `app/specs/router.py`, `app/specs/schemas.py`
- Test: `tests/test_spec_costing.py`, `tests/test_specs.py`

- [ ] **Step 1: Write the failing unit test for the pure reducer** — `tests/test_spec_costing.py`

```python
"""Deterministic costing reducer — the LLM never produces these numbers."""
from decimal import Decimal

from app.specs.costing import line_total, rollup_by_room


def test_line_total_applies_wastage():
    assert line_total(Decimal("10"), Decimal("100"), Decimal("10")) == Decimal("1100.00")


def test_line_total_none_when_incomplete():
    assert line_total(None, Decimal("100"), None) is None
    assert line_total(Decimal("10"), None, None) is None


def test_line_total_no_wastage():
    assert line_total(Decimal("5"), Decimal("200"), None) == Decimal("1000.00")


def test_rollup_groups_by_room_and_counts_excluded():
    lines = [
        {"room": "Master Bedroom", "qty": Decimal("10"), "unit_rate": Decimal("100"), "wastage_pct": Decimal("10")},
        {"room": "Master Bedroom", "qty": Decimal("2"), "unit_rate": Decimal("50"), "wastage_pct": None},
        {"room": "Kitchen", "qty": None, "unit_rate": Decimal("999"), "wastage_pct": None},  # excluded
    ]
    result = rollup_by_room(lines)
    rooms = {r["room"]: r for r in result["rooms"]}
    assert rooms["Master Bedroom"]["total"] == Decimal("1200.00")  # 1100 + 100
    assert rooms["Kitchen"]["total"] == Decimal("0.00")
    assert rooms["Kitchen"]["excluded"] == 1
    assert result["grand_total"] == Decimal("1200.00")
    assert result["excluded_total"] == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_spec_costing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.specs.costing'`

- [ ] **Step 3: Write the reducer** — `app/specs/costing.py`

```python
"""Pure, deterministic costing over Spec rows. No I/O, no LLM. Auditable."""
from decimal import Decimal


def line_total(
    qty: Decimal | None, unit_rate: Decimal | None, wastage_pct: Decimal | None
) -> Decimal | None:
    """qty * unit_rate * (1 + wastage%/100), or None if qty/rate missing."""
    if qty is None or unit_rate is None:
        return None
    total = qty * unit_rate
    if wastage_pct is not None:
        total = total * (Decimal(1) + wastage_pct / Decimal(100))
    return total.quantize(Decimal("0.01"))


def rollup_by_room(lines: list[dict]) -> dict:
    """Group {room, qty, unit_rate, wastage_pct} lines into per-room totals.

    Lines missing qty or unit_rate are excluded from the sum and counted, so the
    rollup is honest about what it could not price.
    """
    rooms: dict[str, dict] = {}
    excluded_total = 0
    for ln in lines:
        room = ln["room"]
        bucket = rooms.setdefault(room, {"room": room, "total": Decimal("0.00"), "lines": 0, "excluded": 0})
        bucket["lines"] += 1
        lt = line_total(ln.get("qty"), ln.get("unit_rate"), ln.get("wastage_pct"))
        if lt is None:
            bucket["excluded"] += 1
            excluded_total += 1
        else:
            bucket["total"] += lt
    grand_total = sum((b["total"] for b in rooms.values()), Decimal("0.00"))
    return {
        "rooms": list(rooms.values()),
        "grand_total": grand_total,
        "excluded_total": excluded_total,
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_spec_costing.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the rollup response schema** — append to `app/specs/schemas.py`

```python
class RoomRollup(BaseModel):
    room: str
    total: Decimal
    lines: int
    excluded: int


class RollupOut(BaseModel):
    rooms: list[RoomRollup]
    grand_total: Decimal
    excluded_total: int
```

- [ ] **Step 6: Write the failing endpoint test** — append to `tests/test_specs.py`

```python
async def test_costing_rollup_endpoint(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()
    await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Laminate-1",
              "qty": "10", "unit_rate": "100", "wastage_pct": "10"},
        headers=auth(owner),
    )
    resp = await client.get(f"/api/v1/specs/rollup?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["grand_total"] == "1100.00"
    assert body["rooms"][0]["room"] == "Master Bedroom"
```

- [ ] **Step 7: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_costing_rollup_endpoint -v`
Expected: FAIL — 404 (no /rollup route)

- [ ] **Step 8: Add the rollup endpoint** — append to `app/specs/router.py` (add imports `from app.models import Component, Space` and `from app.specs.costing import rollup_by_room` and `from app.specs.schemas import RollupOut` at the top with the others):

```python
@router.get("/rollup", response_model=RollupOut)
async def costing_rollup(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RollupOut:
    stmt = (
        select(Spec, Space.name)
        .join(Component, Component.id == Spec.component_id)
        .join(Space, Space.id == Component.space_id)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
    )
    rows = (await session.execute(stmt)).all()
    lines = [
        {"room": room_name, "qty": s.qty, "unit_rate": s.unit_rate, "wastage_pct": s.wastage_pct}
        for s, room_name in rows
    ]
    return RollupOut.model_validate(rollup_by_room(lines))
```

> NOTE: register `/rollup` BEFORE the `/{spec_id}` GET route in the file, or FastAPI will match "rollup" as a spec_id. Move the `costing_rollup` function above `get_spec`, or rename the path to `/rollup` is fine as long as its decorator is declared before `@router.get("/{spec_id}")`. Ensure ordering in the final file.

- [ ] **Step 9: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_specs.py::test_costing_rollup_endpoint -v`
Expected: PASS

- [ ] **Step 10: Run the full spec suite + lint**

Run:
```bash
cd constructo/backend
uv run pytest tests/test_specs.py tests/test_spec_costing.py -v
uv run ruff check app/specs app/models/spec.py tests/test_specs.py tests/test_spec_costing.py
```
Expected: all green, ruff clean.

- [ ] **Step 11: Commit**

```bash
git add app/specs tests/test_specs.py tests/test_spec_costing.py
git commit -m "feat(specs): deterministic per-room costing rollup endpoint"
```

---

## Self-Review

**Spec coverage:** Spec model (Task 1) ✓ · Material catalog fields (Task 1) ✓ · Component site-audit fields (Task 1) ✓ · migration (Task 1) ✓ · CRUD (Tasks 2–3) ✓ · approval gate owner/pm (Task 3) ✓ · deterministic costing (Task 4) ✓. Deferred to follow-on plans (explicitly out of scope, noted in header): xlsx importer, AI extraction, web desk UI, homeowner room-slice + `Decision`-based client approval. No silent gaps.

**Placeholder scan:** none — every step has real code and exact commands.

**Type consistency:** `SpecApprovalStatus` (pending/approved/rejected) used consistently across model, schema, tests. `line_total(qty, unit_rate, wastage_pct)` and `rollup_by_room(lines)` signatures match between `costing.py`, the unit tests, and the endpoint. Money/qty are `Decimal` end-to-end (Numeric columns → Pydantic `Decimal` → JSON string like `"1100.00"`); tests assert the string form, which is correct for Pydantic v2 Decimal serialization.

**Known gotcha flagged in-plan:** the `/rollup` route must be declared before `/{spec_id}` (Task 4 Step 8 note).

---

## Notes for the implementer

- Run the backend stack first: `cd constructo && docker compose up -d`, then `cd backend && DATABASE_URL=... uv run alembic upgrade head`.
- The test DB builds tables from model metadata, so model-only tests pass without the migration; the migration (Task 1, Steps 8–9) is for the real/dev DB and CI.
- Keep money/quantity as `Decimal` everywhere — never float. This is the determinism contract.
- After this plan lands, the next plan to write is the **xlsx importer** (seed `Material`/`Component`/`Spec` from the real CivilArch sheet) — it makes the first demo run on real data.
