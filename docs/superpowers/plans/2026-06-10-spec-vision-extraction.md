# Spec Vision Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the Architect photograph a laminate sample-book page and get gpt-4o to **propose** a structured Spec (brand / code / colour / finish / category) that she then confirms — AI proposes, human commits.

**Architecture:** The vision client (`AzureOpenAILLMClient.complete_vision`) is already correctly wired (sends a `[text, image_url]` multimodal message to gpt-4o) — it just needs *using* + *testing*. We add (1) a pure-ish extraction helper that builds the sample-book prompt/schema and calls `complete_vision`, and (2) a `POST /api/v1/specs/extract` endpoint that takes an uploaded photo, runs the helper, and creates a **proposed** `Material` + `Spec` (`approval_status=pending`) for the Architect to confirm via the existing PATCH/approve endpoints. Tests use `FakeLLMClient(canned=…)` via a dependency override — **no Azure spend in CI**. A final manual step proves it on a real photo against real Azure.

**Tech Stack:** FastAPI multipart, the existing `app.extraction.llm` clients, gpt-4o (Azure), Pydantic, pytest-asyncio. Run from `constructo/backend` with `uv`. Branch: `feat/spec-vision-extraction` off `main`.

**Determinism/trust:** gpt-4o only **proposes**; the Spec is created `pending` and never auto-approved. The prompt instructs the model to leave a field `null` rather than guess. Image is sent as a base64 **data URL** (no presigned-URL dependency).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/specs/extraction.py` (create) | vision prompt + schema, `get_llm` dependency, `extract_material_from_image(llm, image_url)` |
| `app/specs/schemas.py` (modify) | `ExtractedSpecOut` (the spec + the raw extracted fields) |
| `app/specs/router.py` (modify) | `POST /api/v1/specs/extract` endpoint |
| `tests/test_spec_extraction.py` (create) | extraction-helper + endpoint tests (fake LLM) |

---

## Task 1: The vision extraction helper

**Files:** Create `app/specs/extraction.py`; Test `tests/test_spec_extraction.py`

- [ ] **Step 1: Write the failing test** — `tests/test_spec_extraction.py`

```python
"""Spec vision extraction — gpt-4o proposes material fields from a photo."""
from app.extraction.llm import FakeLLMClient
from app.specs.extraction import extract_material_from_image


async def test_extract_returns_fields_and_passes_image():
    canned = {
        "brand": "WELMICA", "product_code": "EB-MR-856", "name": "Radiant Charm",
        "colour": "Mirror Gloss", "finish": "Gloss", "category": "Laminate",
        "size": "1220x2440", "thickness": "1.0", "confidence": 0.9,
    }
    llm = FakeLLMClient(canned=canned)
    out = await extract_material_from_image(llm, "data:image/jpeg;base64,AAAA")

    assert out["brand"] == "WELMICA"
    assert out["product_code"] == "EB-MR-856"
    # the image URL was actually passed to the vision call
    assert llm.calls[-1]["image_url"] == "data:image/jpeg;base64,AAAA"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_spec_extraction.py::test_extract_returns_fields_and_passes_image -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.specs.extraction'`

- [ ] **Step 3: Implement the helper** — `app/specs/extraction.py`

```python
"""Vision extraction for the Spec engine: a photo of a material sample-book page
-> proposed material fields. gpt-4o PROPOSES; a human commits. Leaves fields null
rather than guessing."""
from app.extraction.llm import LLMClient, get_llm_client

SPEC_VISION_SYSTEM = (
    "You are a material-spec extraction engine for an interior fit-out firm. "
    "You are shown a photo of a material sample-book page or a printed material spec. "
    "Extract ONLY what is clearly legible — never guess. Leave any field null if it is "
    "not clearly visible. 'product_code' is the SKU/code printed on the sample "
    "(e.g. 'OS-9006-02', 'EB-MR-856'); 'name' is the trade/collection name; 'category' "
    "is the material kind (Laminate / Louver / Paint / Tile / Veneer / Stone / ...)."
)

SPEC_VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "brand": {"type": ["string", "null"]},
        "product_code": {"type": ["string", "null"]},
        "name": {"type": ["string", "null"]},
        "colour": {"type": ["string", "null"]},
        "finish": {"type": ["string", "null"]},
        "category": {"type": ["string", "null"]},
        "size": {"type": ["string", "null"]},
        "thickness": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
}


def get_llm() -> LLMClient:
    """Injectable LLM client (overridden in tests with a FakeLLMClient)."""
    return get_llm_client()


async def extract_material_from_image(llm: LLMClient, image_url: str) -> dict:
    """Ask gpt-4o to read a sample-book page and propose material fields."""
    return await llm.complete_vision(
        SPEC_VISION_SYSTEM,
        "Extract the material spec from this sample-book page.",
        image_url,
        SPEC_VISION_SCHEMA,
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_spec_extraction.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/specs/extraction.py tests/test_spec_extraction.py
git commit -m "feat(specs): vision extraction helper (sample-book photo -> material fields)"
```

---

## Task 2: The `POST /specs/extract` endpoint

**Files:** Modify `app/specs/schemas.py`, `app/specs/router.py`; Test `tests/test_spec_extraction.py`

- [ ] **Step 1: Add the response schema** — append to `app/specs/schemas.py`

```python
class ExtractedSpecOut(BaseModel):
    spec: SpecOut
    extracted: dict
```

- [ ] **Step 2: Write the failing endpoint test** — append to `tests/test_spec_extraction.py`

```python
from app.auth.jwt import create_access_token
from app.models import Component, Space, SpaceKind, UserRole
from app.specs.extraction import get_llm
from main_app_helpers import nothing  # placeholder removed below
```

Replace the placeholder import line above with nothing — instead add this test (it reuses fixtures + a dependency override):

```python
from app.auth.jwt import create_access_token
from app.main import app
from app.models import Component, Space, SpaceKind, UserRole
from app.specs.extraction import get_llm


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_extract_endpoint_creates_pending_spec(client, factory, db_session):
    canned = {
        "brand": "WELMICA", "product_code": "EB-MR-856", "name": "Radiant Charm",
        "colour": "Mirror Gloss", "finish": "Gloss", "category": "Laminate",
        "size": "1220x2440", "thickness": "1.0", "confidence": 0.9,
    }
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        room = Space(site_id=site.id, name="Daughter's Room", kind=SpaceKind.room)
        db_session.add(room)
        await db_session.flush()
        comp = Component(space_id=room.id, name="Wardrobe", location="Wall A")
        db_session.add(comp)
        await db_session.flush()
        await db_session.commit()

        resp = await client.post(
            "/api/v1/specs/extract",
            data={"site_id": str(site.id), "component_id": str(comp.id)},
            files={"image": ("page.jpg", b"\xff\xd8\xff\xe0fake-jpeg-bytes", "image/jpeg")},
            headers=_auth(architect),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["extracted"]["brand"] == "WELMICA"
        assert body["spec"]["approval_status"] == "pending"
        assert body["spec"]["material_id"] is not None
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_spec_extraction.py::test_extract_endpoint_creates_pending_spec -v`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 4: Add the endpoint** — in `app/specs/router.py`, add imports and the endpoint. Add to the top imports: `import base64`; `from fastapi import File, Form, UploadFile`; `from app.extraction.llm import LLMClient`; `from app.models import Material`; `from app.specs.extraction import extract_material_from_image, get_llm`; `from app.specs.schemas import ExtractedSpecOut`. Place this endpoint **above** the `@router.get("/{spec_id}")` route (so "extract" is never matched as a spec_id):

```python
@router.post("/extract", response_model=ExtractedSpecOut, status_code=201)
async def extract_spec(
    site_id: UUID = Form(...),
    component_id: UUID = Form(...),
    image: UploadFile = File(...),
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ExtractedSpecOut:
    raw = await image.read()
    mime = image.content_type or "image/jpeg"
    data_url = f"data:{mime};base64,{base64.b64encode(raw).decode()}"
    fields = await extract_material_from_image(llm, data_url)

    material = Material(
        company_id=user.company_id,
        name=fields.get("name") or fields.get("brand") or "Proposed material",
        category=fields.get("category"),
        brand=fields.get("brand"),
        sku=fields.get("product_code"),
        colour=fields.get("colour"),
        finish=fields.get("finish"),
        size=fields.get("size"),
        thickness=fields.get("thickness"),
    )
    session.add(material)
    await session.flush()

    spec = Spec(
        company_id=user.company_id,
        site_id=site_id,
        component_id=component_id,
        material_id=material.id,
        label=fields.get("category") or "Proposed",
        notes="Proposed from a photo — confirm.",
    )
    session.add(spec)
    await session.commit()
    await session.refresh(spec)
    return ExtractedSpecOut(spec=SpecOut.model_validate(spec), extracted=fields)
```

(Also add `from app.extraction.llm import FakeLLMClient` to the test file's imports if not present.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_spec_extraction.py -v`
Expected: PASS (both tests)

- [ ] **Step 6: Full spec suite + ruff**

Run:
```bash
cd constructo/backend
export DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
uv run pytest tests/test_spec_extraction.py tests/test_specs.py tests/test_spec_costing.py tests/test_spec_importer.py tests/test_spec_import_parser.py -q
uv run ruff check app/specs tests/test_spec_extraction.py
```
Expected: all green, ruff clean.

- [ ] **Step 7: Commit**

```bash
git add app/specs/router.py app/specs/schemas.py tests/test_spec_extraction.py
git commit -m "feat(specs): POST /specs/extract — gpt-4o proposes a pending Spec from a photo"
```

---

## Task 3: Real-Azure proof (manual — controller runs this, not a subagent)

Requires a real sample-book photo (the founder will provide one, e.g. dropped in `~/Downloads/`). NOT a unit test — it spends real Azure.

- [ ] Un-freeze the doc comments: in `app/extraction/llm.py`, update the two real `complete_vision` docstrings from "frozen stub, H6.6" to note it's now live (keep `# pragma: no cover` — unit tests use the fake, so the network path is still uncovered by CI). Commit: `docs(llm): mark complete_vision live (used by /specs/extract)`.
- [ ] With the real photo at `<PATH>`, run the live extraction (real Azure gpt-4o) and print the proposed fields. (The controller writes a small one-off using `get_llm_client()` + `extract_material_from_image` against a base64 data URL of the real photo.) Confirm gpt-4o returns sensible brand/code/colour.

---

## Self-Review

**Spec coverage:** vision helper + prompt/schema (Task 1) ✓ · endpoint that proposes a pending Spec from an upload (Task 2) ✓ · injectable `get_llm` so CI never spends (Tasks 1–2) ✓ · `/extract` ordered before `/{spec_id}` (Task 2 Step 4) ✓ · real-Azure proof gated behind a manual step (Task 3) ✓.

**Placeholder scan:** Task 2 Step 2 contains a deliberately-flagged placeholder import that the same step tells you to replace — do not leave it.

**Type consistency:** `extract_material_from_image(llm, image_url) -> dict` used identically in helper, tests, and endpoint. `get_llm` is the dependency override key in both the endpoint and the test. `ExtractedSpecOut{spec: SpecOut, extracted: dict}` matches the endpoint return and the test asserts.

**Trust/determinism:** Spec created `pending` (default), never auto-approved; prompt forbids guessing; CI uses the fake client (no spend).
