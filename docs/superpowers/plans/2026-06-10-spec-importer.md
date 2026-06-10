# Spec Schedule Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Import a real Material Specification Schedule `.xlsx` (the CivilArch sheet) into the Spec engine — creating `Space`/`Component`/`Material`/`Spec` rows — so the pilot runs on real data.

**Architecture:** Three layers. (1) A **pure parser** that turns a sheet's raw rows into typed `ParsedSpecRow`s, mapping columns **by normalized header name** (the two source sheets order Brand/Description differently, so position-based parsing is wrong). (2) A **pure-ish importer** `import_rows(session, company_id, site_id, parsed)` that idempotently upserts Space→Component→Material→Spec using deterministic `uuid5` ids (re-runnable, no duplicates). (3) A thin **CLI** (`scripts/import_spec_schedule.py`) that opens the workbook with openpyxl and wires parser→importer, **safe by default** (parses + prints a plan; `--run` writes; `--purge` removes), mirroring `scripts/import_whatsapp_export.py`.

**Tech Stack:** Python 3.12, SQLAlchemy 2.0 async, openpyxl, Decimal, pytest-asyncio. Run from `constructo/backend` with `uv`.

**Depends on:** the Spec engine core (`Spec` model, Material/Component fields) — already merged in PR #164 / on `feat/spec-engine`. Branch this work off `feat/spec-engine` (or main once #164 merges).

**Out of scope (follow-ons):** the messy floor-header sheet variant ('Anill Sir-Material Specs' with interspersed "Ground Floor"/"Note:" rows); AI extraction; UI.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/specs/import_parser.py` (create) | `normalize_header`, `ParsedSpecRow` dataclass, `parse_spec_sheet(rows)` |
| `app/specs/importer.py` (create) | `import_rows(session, company_id, site_id, parsed)` → `ImportStats` (idempotent upserts) |
| `scripts/import_spec_schedule.py` (create) | CLI glue: openpyxl + argparse + parser + importer |
| `pyproject.toml` (modify) | add `openpyxl` dependency |
| `tests/test_spec_import_parser.py` (create) | pure parser tests |
| `tests/test_spec_importer.py` (create) | importer DB tests (idempotency, mapping) |

---

## Task 1: The pure sheet parser

**Files:** Create `app/specs/import_parser.py`; Test `tests/test_spec_import_parser.py`

- [ ] **Step 1: Write the failing test** — `tests/test_spec_import_parser.py`

```python
"""Pure parser: Material Specification Schedule sheet rows -> ParsedSpecRow."""
from decimal import Decimal

from app.specs.import_parser import normalize_header, parse_spec_sheet

HEADER = [
    "Item / No.", "Location / Room", "Finish / Element", "Material / Category",
    "Material / Short Code", "Material / Description / Trade Name", "Brand / Manufacturer",
    "Product / Code / SKU", "Colour / Shade Ref", "Texture / Finish Type",
    "Size / Dimension", "Thickness (mm)", "Unit of Measure", "Qty Required",
    "Wastage %", "Qty Ordered", "Unit Rate (₹ / Unit)", "Total Cost (₹)",
    "Approval Status", "Remarks / Notes",
]
ROW = [
    "01", "Living Room", "Floor", "Vitrified Tile", "", "Polished Vitrified Tile 800x800",
    "Kajaria", "ETW-8080", "Ivory Beige", "Matt", "800x800 mm", "9", "Sq Ft",
    "450.0", "10.0", "495.0", "", "", "Pending Approval", "",
]


def test_normalize_header_collapses_noise():
    assert normalize_header("Unit Rate / (₹ / Unit)") == "unit rate unit"
    assert normalize_header("Material / Description / Trade Name") == "material description trade name"


def test_parse_maps_by_header_name():
    rows = [["INTERIOR FINISHING MATERIAL SPECIFICATION SCHEDULE"], ["Project: ___"], HEADER, ROW]
    parsed = parse_spec_sheet(rows)
    assert len(parsed) == 1
    p = parsed[0]
    assert p.room == "Living Room"
    assert p.element == "Floor"
    assert p.category == "Vitrified Tile"
    assert p.brand == "Kajaria"
    assert p.sku == "ETW-8080"
    assert p.colour == "Ivory Beige"
    assert p.qty == Decimal("450.0")
    assert p.wastage_pct == Decimal("10.0")
    assert p.unit_rate is None  # empty cell -> None (honestly unpriced)
    assert p.unit == "Sq Ft"
    assert p.approval_status == "pending"


def test_parse_skips_blank_grandtotal_and_note_rows():
    rows = [
        HEADER,
        ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],  # blank
        ["GRAND TOTAL (₹)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "0.0"],
        ["", "Note:", "All shower partitions to be sliders"],  # note row (no element/material)
        ROW,
    ]
    parsed = parse_spec_sheet(rows)
    assert [p.room for p in parsed] == ["Living Room"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_spec_import_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.specs.import_parser'`

- [ ] **Step 3: Implement the parser** — `app/specs/import_parser.py`

```python
"""Pure parser for a Material Specification Schedule sheet.

Maps columns by NORMALIZED HEADER NAME (not position) because real sheets order
Brand/Description differently. No I/O — operates on a list of row-lists.
"""
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


def normalize_header(text: object) -> str:
    """Lowercase, drop punctuation/symbols (incl. ₹, slashes, parens), collapse spaces."""
    s = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", s).strip()


# normalized-header keyword -> ParsedSpecRow field. First matching keyword wins.
_FIELD_BY_KEYWORD: list[tuple[str, str]] = [
    ("location", "room"),
    ("finish element", "element"),
    ("material category", "category"),
    ("description", "name"),
    ("brand", "brand"),
    ("product code", "sku"),
    ("colour", "colour"),
    ("texture", "finish"),
    ("size", "size"),
    ("thickness", "thickness"),
    ("unit of measure", "unit"),
    ("qty required", "qty"),
    ("wastage", "wastage_pct"),
    ("unit rate", "unit_rate"),
    ("approval", "approval_status"),
    ("remarks", "notes"),
]

_APPROVAL_MAP = {"pending approval": "pending", "approved": "approved", "rejected": "rejected"}


@dataclass
class ParsedSpecRow:
    room: str
    element: str | None = None
    category: str | None = None
    name: str | None = None
    brand: str | None = None
    sku: str | None = None
    colour: str | None = None
    finish: str | None = None
    size: str | None = None
    thickness: str | None = None
    unit: str | None = None
    qty: Decimal | None = None
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    approval_status: str = "pending"
    notes: str | None = None


def _clean(v: object) -> str | None:
    s = str(v).strip() if v is not None else ""
    if s in ("", "—", "-", "NA", "N/A"):
        return None
    return s


def _dec(v: object) -> Decimal | None:
    s = _clean(v)
    if s is None:
        return None
    s = re.sub(r"[,%₹\s]", "", s)
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _find_header(rows: list[list]) -> int | None:
    for i, row in enumerate(rows):
        norms = {normalize_header(c) for c in row}
        if any("location" in n for n in norms) and any("approval" in n for n in norms):
            return i
    return None


def parse_spec_sheet(rows: list[list]) -> list[ParsedSpecRow]:
    """Find the header row, map columns by name, return one ParsedSpecRow per real line."""
    h = _find_header(rows)
    if h is None:
        return []
    col_to_field: dict[int, str] = {}
    for idx, cell in enumerate(rows[h]):
        norm = normalize_header(cell)
        for keyword, field in _FIELD_BY_KEYWORD:
            if keyword in norm:
                col_to_field.setdefault(idx, field)
                break

    out: list[ParsedSpecRow] = []
    for row in rows[h + 1:]:
        values: dict[str, object] = {}
        for idx, field in col_to_field.items():
            if idx < len(row):
                values[field] = row[idx]
        room = _clean(values.get("room"))
        element = _clean(values.get("element"))
        # A real line needs a room AND (an element or a material/category). Skips blanks,
        # GRAND TOTAL rows (no room), and Note rows (room/element empty).
        if not room or not (element or _clean(values.get("category")) or _clean(values.get("name"))):
            continue
        approval = _APPROVAL_MAP.get(normalize_header(values.get("approval_status")), "pending")
        out.append(
            ParsedSpecRow(
                room=room,
                element=element,
                category=_clean(values.get("category")),
                name=_clean(values.get("name")),
                brand=_clean(values.get("brand")),
                sku=_clean(values.get("sku")),
                colour=_clean(values.get("colour")),
                finish=_clean(values.get("finish")),
                size=_clean(values.get("size")),
                thickness=_clean(values.get("thickness")),
                unit=_clean(values.get("unit")),
                qty=_dec(values.get("qty")),
                wastage_pct=_dec(values.get("wastage_pct")),
                unit_rate=_dec(values.get("unit_rate")),
                approval_status=approval,
                notes=_clean(values.get("notes")),
            )
        )
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_spec_import_parser.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/specs/import_parser.py tests/test_spec_import_parser.py
git commit -m "feat(specs): pure Material-Spec sheet parser (header-name mapping)"
```

---

## Task 2: The idempotent importer

**Files:** Create `app/specs/importer.py`; Test `tests/test_spec_importer.py`

- [ ] **Step 1: Write the failing test** — `tests/test_spec_importer.py`

```python
"""Importer: ParsedSpecRow -> Space/Component/Material/Spec, idempotently."""
from decimal import Decimal

from sqlalchemy import func, select

from app.models import Component, Material, Space, Spec
from app.specs.import_parser import ParsedSpecRow
from app.specs.importer import import_rows


def _rows() -> list[ParsedSpecRow]:
    return [
        ParsedSpecRow(room="Living Room", element="Floor", category="Vitrified Tile",
                      name="Polished Vitrified Tile", brand="Kajaria", sku="ETW-8080",
                      colour="Ivory Beige", qty=Decimal("450"), wastage_pct=Decimal("10"),
                      unit="Sq Ft", approval_status="pending"),
        ParsedSpecRow(room="Living Room", element="Ceiling", category="Gypsum Board",
                      brand="Saint-Gobain", sku="SG-GYP-13", qty=Decimal("500"), unit="Sq Ft"),
        ParsedSpecRow(room="Master Bedroom", element="Floor", category="Engineered Wood",
                      brand="Pergo", sku="PG-OAK-38", qty=Decimal("320"), unit="Sq Ft"),
    ]


async def test_import_creates_spaces_components_materials_specs(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await db_session.commit()

    stats = await import_rows(db_session, company.id, site.id, _rows())
    await db_session.commit()

    assert stats.specs == 3
    assert stats.spaces == 2          # Living Room, Master Bedroom
    assert stats.components == 3       # Floor, Ceiling (LR) + Floor (MB)
    assert stats.materials == 3        # 3 distinct SKUs
    assert (await db_session.scalar(select(func.count()).select_from(Spec))) == 3
    spec = await db_session.scalar(
        select(Spec).join(Material, Material.id == Spec.material_id).where(Material.sku == "ETW-8080")
    )
    assert spec.qty == Decimal("450.00")
    assert spec.label == "Floor"


async def test_import_is_idempotent(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await db_session.commit()

    await import_rows(db_session, company.id, site.id, _rows())
    await db_session.commit()
    stats2 = await import_rows(db_session, company.id, site.id, _rows())  # second run
    await db_session.commit()

    assert stats2.specs == 0  # nothing new on re-run
    assert (await db_session.scalar(select(func.count()).select_from(Spec))) == 3
    assert (await db_session.scalar(select(func.count()).select_from(Space))) == 2
    assert (await db_session.scalar(select(func.count()).select_from(Material))) == 3
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_spec_importer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.specs.importer'`

- [ ] **Step 3: Implement the importer** — `app/specs/importer.py`

```python
"""Idempotent import of parsed spec rows into Space/Component/Material/Spec.

Deterministic uuid5 ids keyed on natural keys, so re-running the same sheet never
duplicates. Caller commits.
"""
from dataclasses import dataclass
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Component, ComponentStatus, Material, Space, SpaceKind, Spec
from app.specs.import_parser import ParsedSpecRow

_NS = uuid5(NAMESPACE_URL, "constructo.spec-import")


def _id(*parts: object) -> UUID:
    return uuid5(_NS, "|".join(str(p) for p in parts))


@dataclass
class ImportStats:
    spaces: int = 0
    components: int = 0
    materials: int = 0
    specs: int = 0


async def import_rows(
    session: AsyncSession, company_id: UUID, site_id: UUID, parsed: list[ParsedSpecRow]
) -> ImportStats:
    stats = ImportStats()

    async def _get_or_add(model, pk: UUID, **fields):
        existing = await session.get(model, pk)
        if existing is not None:
            return existing, False
        obj = model(id=pk, **fields)
        session.add(obj)
        await session.flush()
        return obj, True

    for r in parsed:
        # Space (room) — keyed by site + room name
        space_id = _id("space", site_id, r.room)
        _space, created = await _get_or_add(
            Space, space_id, site_id=site_id, name=r.room, kind=SpaceKind.room, order=0
        )
        stats.spaces += created

        # Component (finish element / wall) — keyed by space + element
        element = r.element or (r.category or "Item")
        comp_id = _id("component", space_id, element)
        _comp, created = await _get_or_add(
            Component, comp_id, space_id=space_id, name=element, kind=r.category,
            status=ComponentStatus.not_started,
        )
        stats.components += created

        # Material (catalog) — keyed by company + brand + sku (or name when sku missing)
        material_id = None
        if r.brand or r.sku or r.name:
            mat_id = _id("material", company_id, r.brand, r.sku or r.name)
            _mat, created = await _get_or_add(
                Material, mat_id, company_id=company_id, name=r.name or r.category or element,
                category=r.category, brand=r.brand, sku=r.sku, colour=r.colour, finish=r.finish,
                size=r.size, thickness=r.thickness,
            )
            stats.materials += created
            material_id = mat_id

        # Spec (the line item) — keyed by component + label(element) + sku
        spec_id = _id("spec", comp_id, element, r.sku or "")
        _spec, created = await _get_or_add(
            Spec, spec_id, company_id=company_id, site_id=site_id, component_id=comp_id,
            material_id=material_id, label=element, qty=r.qty, unit=r.unit,
            wastage_pct=r.wastage_pct, unit_rate=r.unit_rate, approval_status=r.approval_status,
            notes=r.notes,
        )
        stats.specs += created

    return stats
```

Note: `Spec.approval_status` accepts the string value (e.g. `"pending"`) — SQLAlchemy's `SAEnum(SpecApprovalStatus)` coerces the matching string. If a test shows it doesn't, wrap with `SpecApprovalStatus(r.approval_status)`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_spec_importer.py -v`
Expected: PASS (2 tests). If the enum coercion fails, apply the note above and re-run.

- [ ] **Step 5: Commit**

```bash
git add app/specs/importer.py tests/test_spec_importer.py
git commit -m "feat(specs): idempotent Space/Component/Material/Spec importer"
```

---

## Task 3: The CLI script

**Files:** Create `scripts/import_spec_schedule.py`; Modify `pyproject.toml` (add openpyxl)

- [ ] **Step 1: Add the openpyxl dependency**

Run:
```bash
cd constructo/backend
uv add openpyxl
```
Verify `openpyxl` appears under `[project] dependencies` in `pyproject.toml` and `uv.lock` updated.

- [ ] **Step 2: Write the CLI** — `scripts/import_spec_schedule.py`

```python
"""Import a Material Specification Schedule .xlsx into the Spec engine.

SAFE BY DEFAULT — a bare run only parses and prints a plan (no DB writes). Add
``--run`` to write. ``--purge`` removes everything a prior import created for the
site. Idempotent (deterministic uuid5), so re-running never duplicates.

Examples
--------
# Dry-run — parse + print what would be created:
    uv run python -m scripts.import_spec_schedule \
        --file "/path/Interior Material Specification Template-Anil Sir.xlsx" \
        --sheet "Material Specifications" --company <COMPANY_UUID> --site <SITE_UUID>

# Actually import:
    uv run python -m scripts.import_spec_schedule --file "..." --sheet "Material Specifications" \
        --company <COMPANY_UUID> --site <SITE_UUID> --run

# Wipe what this import created for the site:
    uv run python -m scripts.import_spec_schedule --company <COMPANY_UUID> --site <SITE_UUID> --purge
"""
from __future__ import annotations

import argparse
import asyncio
from uuid import UUID

from sqlalchemy import delete, select

from app.db import SessionLocal
from app.models import Component, Material, Space, Spec
from app.specs.import_parser import parse_spec_sheet
from app.specs.importer import import_rows


def _read_sheet(path: str, sheet: str) -> list[list]:
    import openpyxl  # imported here so parser/importer tests don't need openpyxl

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[sheet] if sheet in wb.sheetnames else wb.worksheets[0]
    rows = [[c for c in row] for row in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


async def _purge(company_id: UUID, site_id: UUID) -> None:
    async with SessionLocal() as session:
        await session.execute(delete(Spec).where(Spec.site_id == site_id))
        space_ids = (await session.execute(select(Space.id).where(Space.site_id == site_id))).scalars().all()
        if space_ids:
            await session.execute(delete(Component).where(Component.space_id.in_(space_ids)))
        await session.execute(delete(Space).where(Space.site_id == site_id))
        # Materials are company-wide catalog; leave them (shared). Comment in if you want them gone:
        # await session.execute(delete(Material).where(Material.company_id == company_id))
        await session.commit()
    print(f"Purged specs/components/spaces for site {site_id}.")


async def _main() -> None:
    ap = argparse.ArgumentParser(description="Import a Material Specification Schedule .xlsx")
    ap.add_argument("--file")
    ap.add_argument("--sheet", default="Material Specifications")
    ap.add_argument("--company", required=True, type=UUID)
    ap.add_argument("--site", required=True, type=UUID)
    ap.add_argument("--run", action="store_true", help="write to DB (default: dry-run)")
    ap.add_argument("--purge", action="store_true", help="remove this import for the site")
    args = ap.parse_args()

    if args.purge:
        await _purge(args.company, args.site)
        return
    if not args.file:
        ap.error("--file is required unless --purge")

    parsed = parse_spec_sheet(_read_sheet(args.file, args.sheet))
    print(f"Parsed {len(parsed)} spec rows from '{args.sheet}'.")
    by_room: dict[str, int] = {}
    for p in parsed:
        by_room[p.room] = by_room.get(p.room, 0) + 1
    for room, n in by_room.items():
        print(f"  {room}: {n} lines")

    if not args.run:
        print("\nDRY RUN — no DB writes. Re-run with --run to import.")
        return

    async with SessionLocal() as session:
        stats = await import_rows(session, args.company, args.site, parsed)
        await session.commit()
    print(f"\nImported: {stats.spaces} spaces, {stats.components} components, "
          f"{stats.materials} materials, {stats.specs} specs.")


if __name__ == "__main__":
    asyncio.run(_main())
```

- [ ] **Step 3: Smoke-test the dry-run against the real file**

Find a real company + site id from the seeded dev DB (or the CivilArch import), then:
```bash
cd constructo/backend
export DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
# get a company + site id:
uv run python -c "import asyncio; from sqlalchemy import select; from app.db import SessionLocal; from app.models import Company, Site
async def m():
    async with SessionLocal() as s:
        c=(await s.execute(select(Company))).scalars().first(); st=(await s.execute(select(Site))).scalars().first(); print(c.id, st.id)
asyncio.run(m())"
# dry-run the importer (no writes):
uv run python -m scripts.import_spec_schedule \
  --file "/Users/aryantripathi/Downloads/Interior Material Specification Template-Anil Sir.xlsx" \
  --sheet "Material Specifications" --company <COMPANY_ID> --site <SITE_ID>
```
Expected: prints "Parsed N spec rows" + a per-room breakdown, then "DRY RUN — no DB writes." (No exception. N should be > 0.)

- [ ] **Step 4: Run the full spec + importer test suite + ruff**

Run:
```bash
cd constructo/backend
export DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
uv run pytest tests/test_spec_import_parser.py tests/test_spec_importer.py tests/test_specs.py tests/test_spec_costing.py -q
uv run ruff check app/specs scripts/import_spec_schedule.py tests/test_spec_import_parser.py tests/test_spec_importer.py
```
Expected: all green, ruff clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/import_spec_schedule.py pyproject.toml uv.lock
git commit -m "feat(specs): xlsx Material-Spec importer CLI (safe dry-run by default)"
```

---

## Self-Review

**Spec coverage:** parse-by-header-name (Task 1) ✓ · skip blank/grand-total/note rows (Task 1) ✓ · empty rate → None / honest unpriced (Task 1, asserted) ✓ · idempotent Space/Component/Material/Spec upsert via uuid5 (Task 2) ✓ · CLI safe-by-default + --run + --purge mirroring the WhatsApp importer (Task 3) ✓ · openpyxl dep (Task 3) ✓.

**Placeholder scan:** none — full code + exact commands throughout.

**Type consistency:** `ParsedSpecRow` fields used identically in parser, importer, and tests. `import_rows(session, company_id, site_id, parsed) -> ImportStats` signature matches across importer, tests, and CLI. Decimals throughout (qty/wastage/rate). `approval_status` is the normalized string ("pending"/"approved"/"rejected") produced by the parser and accepted by the model enum (with the documented fallback if coercion fails).

**Ambiguity check:** "real line" rule made explicit (room present AND element/category/name present). Materials kept company-wide on purge (documented). Default sheet name is "Material Specifications" (the clean BOQ variant).
