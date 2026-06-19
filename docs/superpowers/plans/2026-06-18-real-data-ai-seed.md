# Real-Data AI Seed (All Roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the real Tripathi Dream Home WhatsApp export into a fully populated, loginnable Constructo company where every product surface for all 4 focus roles (homeowner, owner, supervisor/site-engineer, architect) shows real, AI-extracted data — including the in-app chat — running on real Azure LLMs with tiered 4o/4o-mini routing.

**Architecture:** Keep the existing importer's world-building; evolve its message stage to seed the in-app chat (`app_chat`) split into crew `site` + curated `homeowner` threads; add tiered model routing + confidence escalation + a vision module; then run idempotent per-surface enrichment generators that read the whole corpus (events + threads + the 167 PDFs). Build + locally validate on a cheap slice (real Azure), then purge the old June-3 prod import and run into prod Neon + R2.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Alembic, Azure OpenAI (`gpt-4o-mini` + `gpt-4o`), Azure DocIntel, Sarvam STT, Cloudflare R2 (S3 API), Neon Postgres (pgvector). Mobile: Expo / React Native / TypeScript. Tooling: `uv` (backend), `npm` (mobile). Tests: `pytest`, `ruff`; mobile `npm run typecheck`/jest.

**Conventions:**
- Backend commands run from `constructo/backend/` with `export PATH="$HOME/.local/bin:$PATH"`.
- Run a single test: `uv run pytest tests/path/test_x.py::test_name -v`.
- Lint gate before commit: `uv run ruff check app scripts tests`.
- All seeded rows use deterministic `uuid5` ids for idempotency (helper `_id(*parts)` in the importer).
- Tests use the injected `FakeLLMClient`/`FakeOCR`/`FakeSTT` — never the network.

---

## File Structure

**Backend — modify**
- `app/extraction/llm.py` — tiered `get_llm_client(tier)` + `AzureOpenAILLMClient` reused per deployment.
- `app/extraction/extract.py` — confidence/unknown escalation in `_build_event`.
- `app/chat/router.py` — `sender_name`/`sender_role` on `ChatMessageOut` + batch resolution.
- `scripts/import_whatsapp_export.py` — message stage seeds `app_chat` chat messages.
- `.env` — add `AZURE_OPENAI_DEPLOYMENT_SMART=gpt-4o`.

**Backend — create**
- `app/extraction/vision.py` — `caption_photo()` + `classify_image()` (vision-tier).
- `app/extraction/pdf_read.py` — `read_pdf()` (DocIntel text + rasterize→vision for plans).
- `app/ingestion/chat_seed.py` — conversation get-or-create + channel classifier + `seed_chat_message()`.
- `scripts/enrich_documents.py` — 167 PDFs → Spaces/Components/Specs/PublishedDrawing.
- `scripts/enrich_decisions.py`, `enrich_specs.py`, `enrich_profiler.py`, `enrich_audits.py`, `enrich_dpr.py`, `enrich_action_items.py`, `enrich_payments.py`, `enrich_site_changes.py`, `enrich_quiet_periods.py` — one generator each.
- `scripts/enrich_all.py` — ordered driver for all generators.
- `scripts/census_roles.py` — per-role surface census + quality thresholds.

**Mobile — modify**
- `src/api/chat.ts` — add `sender_name`/`sender_role` to the message type.
- `src/chat/MessageView.tsx` — render sender name on multi-sender incoming bubbles.

**Tests — create**
- `tests/extraction/test_llm_routing.py`, `tests/extraction/test_escalation.py`, `tests/extraction/test_vision.py`
- `tests/chat/test_sender_attribution.py`
- `tests/ingestion/test_chat_seed.py`
- `tests/test_enrich_documents.py` + `tests/test_enrich_<surface>.py` per generator

**Verified model locations (for generator tasks — read these first, do not guess fields):**
- `Decision` → `app/models/decision.py`; `Spec` → `app/models/spec.py`; `Material` → `app/models/material.py`
- `Component` → `app/models/homeowner_property.py`; `Audit`/`AuditSection`/`AuditFinding` → `app/models/audit.py`
- `Dpr` → `app/models/dpr.py`; `ActionItem` → `app/models/action_item.py`; `Payment` → `app/models/payment.py`
- `SiteChange` → `app/models/site_change.py`; `QuietPeriod` → `app/models/homeowner_quiet.py`
- `ProfilerProfile`/`ProfilerBrief`/… → `app/models/profiler.py`; `PublishedDrawing` → grep `app/models/`

---

## Phase P0 — Foundations (routing, escalation, vision) — all local, TDD

### Task P0.1: Tiered model routing

**Files:**
- Modify: `app/extraction/llm.py` (the `get_llm_client` factory near line 374)
- Test: `tests/extraction/test_llm_routing.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/extraction/test_llm_routing.py
import os
import pytest
from app.extraction.llm import get_llm_client, AzureOpenAILLMClient, FakeLLMClient


def _azure_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "k")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://x.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_SMART", "gpt-4o")
    monkeypatch.setenv("AZURE_OPENAI_API_VERSION", "2024-10-21")


def test_cheap_tier_uses_mini(monkeypatch):
    _azure_env(monkeypatch)
    c = get_llm_client("cheap")
    assert isinstance(c, AzureOpenAILLMClient)
    assert c.deployment == "gpt-4o-mini"


def test_smart_and_vision_tier_uses_4o(monkeypatch):
    _azure_env(monkeypatch)
    assert get_llm_client("smart").deployment == "gpt-4o"
    assert get_llm_client("vision").deployment == "gpt-4o"


def test_default_is_back_compat_cheap(monkeypatch):
    _azure_env(monkeypatch)
    assert get_llm_client().deployment == "gpt-4o-mini"


def test_smart_falls_back_to_mini_when_unset(monkeypatch):
    _azure_env(monkeypatch)
    monkeypatch.delenv("AZURE_OPENAI_DEPLOYMENT_SMART", raising=False)
    # No smart deployment configured → degrade to the cheap deployment, not crash.
    assert get_llm_client("smart").deployment == "gpt-4o-mini"


def test_no_creds_returns_fake(monkeypatch):
    for k in ("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT", "OPENAI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "azure")
    assert isinstance(get_llm_client("smart"), FakeLLMClient)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.local/bin:$PATH" && uv run pytest tests/extraction/test_llm_routing.py -v`
Expected: FAIL — `get_llm_client()` currently takes no arguments (TypeError) / no smart deployment handling.

- [ ] **Step 3: Implement tiered routing**

Replace the `get_llm_client` factory in `app/extraction/llm.py` with a tier-aware version (keep `AzureOpenAILLMClient`/`OpenAILLMClient`/`FakeLLMClient` unchanged):

```python
def get_llm_client(tier: str = "cheap") -> LLMClient:
    """Return an LLMClient for a routing tier.

    tier: "cheap" → AZURE_OPENAI_DEPLOYMENT (gpt-4o-mini);
          "smart"/"vision" → AZURE_OPENAI_DEPLOYMENT_SMART (gpt-4o),
          falling back to the cheap deployment when SMART is unset.
    Back-compat: no-arg call returns the cheap/default client.
    """
    provider = os.environ.get("LLM_PROVIDER", "openai").lower()
    if provider == "azure":
        key = os.environ.get("AZURE_OPENAI_API_KEY")
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        cheap = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
        smart = os.environ.get("AZURE_OPENAI_DEPLOYMENT_SMART") or cheap
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
        deployment = smart if tier in ("smart", "vision") else cheap
        if key and endpoint and deployment:
            return AzureOpenAILLMClient(
                api_key=key, endpoint=endpoint,
                deployment=deployment, api_version=api_version,
            )
    elif provider == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if key:
            cheap = os.environ.get("LLM_MODEL", "gpt-4o-mini")
            smart = os.environ.get("LLM_MODEL_SMART") or cheap
            model = smart if tier in ("smart", "vision") else cheap
            return OpenAILLMClient(api_key=key, model=model)
    return FakeLLMClient()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/extraction/test_llm_routing.py -v` → Expected: PASS (5 passed).
Then `uv run pytest tests/extraction -q` to confirm no regression in existing extraction tests.

- [ ] **Step 5: Commit**

```bash
git add app/extraction/llm.py tests/extraction/test_llm_routing.py
git commit -m "feat(extraction): tiered Azure model routing (cheap/smart/vision)"
```

### Task P0.2: Confidence/unknown escalation to the smart tier

**Files:**
- Modify: `app/extraction/extract.py` (`_build_event`, near line 343; add `ESCALATE_BELOW` const near `CLARIFY_THRESHOLD`)
- Test: `tests/extraction/test_escalation.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/extraction/test_escalation.py
import pytest
from uuid import uuid4
from datetime import datetime, UTC
from app.contracts.events import RawMessage, MediaType, EventType
from app.extraction.extract import extract


class TierLLM:
    """Records which tier 'completed' by returning a low-conf unknown on the
    first (cheap) call and a confident result on the second (smart) call."""
    def __init__(self):
        self.calls = 0
    async def complete(self, system, user, json_schema):
        self.calls += 1
        if self.calls == 1:
            return {"event_type": "unknown", "summary": user, "fields": {}, "confidence": 0.2}
        return {"event_type": "progress_update", "summary": user,
                "fields": {"description": user}, "confidence": 0.95}
    async def complete_vision(self, system, user, image_url, json_schema):
        return await self.complete(system, user, json_schema)


def _raw(text):
    return RawMessage(id=uuid4(), source="app_chat", external_group_id="app:x",
                      sender_id="p", sender_name="Lokesh", media_type=MediaType.text,
                      text=text, media_url=None, media_mime=None,
                      sent_at=datetime.now(UTC), received_at=datetime.now(UTC), raw={})


@pytest.mark.asyncio
async def test_low_confidence_escalates_and_improves(monkeypatch):
    # Force the smart client used on escalation to be the SAME recording instance.
    shared = TierLLM()
    monkeypatch.setattr("app.extraction.extract.get_llm_client", lambda tier="cheap": shared)
    [ev] = await extract(_raw("ek aur baat clarify karni thi"), uuid4(), llm=shared)
    assert shared.calls == 2          # escalated once
    assert ev.event_type is EventType.progress_update
    assert ev.confidence >= 0.6
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/extraction/test_escalation.py -v`
Expected: FAIL — no escalation today; `shared.calls == 1` and the event stays `unknown`.

- [ ] **Step 3: Implement escalation in `_build_event`**

Add near the top of `extract.py`: `ESCALATE_BELOW = 0.6`. In `_build_event`, after computing `event_type`, `fields`, `summary`, `confidence` from the first (`llm`) call and BEFORE building the `SiteEvent`, insert:

```python
    # Escalate weak reads (low confidence or still-unknown) to the smart tier
    # once. The injected `llm` is treated as the cheap tier; the smart client is
    # resolved via the factory (in tests, monkeypatched to the same recorder).
    if forced_type is None and (confidence < ESCALATE_BELOW or event_type is EventType.unknown):
        smart = get_llm_client("smart")
        smart_out = await smart.complete(
            system=_SYSTEM_PROMPT,
            user=_with_reply_context(text, raw),
            json_schema=_llm_schema(event_type),
        )
        smart_type = _coerce_event_type(smart_out.get("event_type"))
        smart_conf = smart_out.get("confidence")
        if isinstance(smart_conf, (int, float)) and float(smart_conf) >= confidence:
            if smart_type is not None and smart_type is not EventType.unknown:
                event_type = smart_type
            fields = smart_out.get("fields") or fields
            summary = (smart_out.get("summary") or summary).strip()[:500] or summary
            confidence = max(0.0, min(1.0, float(smart_conf)))
    needs_clarification = confidence < CLARIFY_THRESHOLD
```

(Replace the existing `needs_clarification = confidence < CLARIFY_THRESHOLD` line with the block above so it's computed after escalation.)

- [ ] **Step 4: Run test + regression**

Run: `uv run pytest tests/extraction/test_escalation.py tests/extraction -q` → Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/extraction/extract.py tests/extraction/test_escalation.py
git commit -m "feat(extraction): escalate low-confidence/unknown reads to gpt-4o"
```

### Task P0.3: Vision module (photo caption + classify)

**Files:**
- Create: `app/extraction/vision.py`
- Test: `tests/extraction/test_vision.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/extraction/test_vision.py
import pytest
from app.extraction.vision import classify_image, caption_photo
from app.extraction.llm import FakeLLMClient


@pytest.mark.asyncio
async def test_caption_photo_returns_text_and_passes_url():
    fake = FakeLLMClient(canned={"caption": "RCC slab shuttering in progress",
                                 "category": "progress", "room_hint": "first floor"})
    out = await caption_photo("https://r2/x.jpg", llm=fake)
    assert out["caption"]
    assert out["category"] in {"progress", "design_option", "drawing", "document", "other"}
    assert fake.calls[-1]["image_url"] == "https://r2/x.jpg"


@pytest.mark.asyncio
async def test_classify_image_defaults_other_on_blank():
    fake = FakeLLMClient(canned={})
    assert (await classify_image("https://r2/y.jpg", llm=fake)) in {
        "progress", "design_option", "drawing", "document", "other"}
```

- [ ] **Step 2: Run to verify fail** — `uv run pytest tests/extraction/test_vision.py -v` → FAIL (module missing).

- [ ] **Step 3: Implement `app/extraction/vision.py`**

```python
"""Vision helpers: caption + classify a photo with the vision-tier LLM.

Network-free in tests (inject a FakeLLMClient). Uses complete_vision so the
model actually reads the image at the given (presigned) URL.
"""
from __future__ import annotations

from app.extraction.llm import LLMClient, get_llm_client

_CATEGORIES = {"progress", "design_option", "drawing", "document", "other"}

_CAPTION_SYSTEM = (
    "You are reading a photo from an Indian home-construction WhatsApp group. "
    "Caption what is physically shown in one factual sentence (no opinions), "
    "classify it, and name the room/area if identifiable. Return strict JSON."
)
_CAPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "caption": {"type": "string"},
        "category": {"type": "string", "enum": sorted(_CATEGORIES)},
        "room_hint": {"type": ["string", "null"]},
    },
    "required": ["caption", "category"],
}


async def caption_photo(image_url: str, *, llm: LLMClient | None = None,
                        user_hint: str = "") -> dict:
    """Return {"caption", "category", "room_hint"} for a photo."""
    llm = llm or get_llm_client("vision")
    out = await llm.complete_vision(
        system=_CAPTION_SYSTEM,
        user=user_hint or "Describe and classify this construction photo.",
        image_url=image_url,
        json_schema=_CAPTION_SCHEMA,
    )
    cat = out.get("category")
    return {
        "caption": (out.get("caption") or "").strip(),
        "category": cat if cat in _CATEGORIES else "other",
        "room_hint": out.get("room_hint"),
    }


async def classify_image(image_url: str, *, llm: LLMClient | None = None) -> str:
    """Just the category (cheap caller convenience)."""
    return (await caption_photo(image_url, llm=llm))["category"]
```

- [ ] **Step 4: Run test** — `uv run pytest tests/extraction/test_vision.py -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/extraction/vision.py tests/extraction/test_vision.py
git commit -m "feat(extraction): vision module (caption + classify photos)"
```

### Task P0.4: Add the smart deployment env var

- [ ] **Step 1:** Append to `constructo/backend/.env`: `AZURE_OPENAI_DEPLOYMENT_SMART=gpt-4o` (the user confirmed the deployment is named `gpt-4o`). Verify with `grep AZURE_OPENAI_DEPLOYMENT .env`.
- [ ] **Step 2:** No commit needed (`.env` is gitignored). Confirm it's ignored: `git check-ignore .env`.

---

## Phase P1 — In-app chat seeding + sender attribution

### Task P1.1: `sender_name`/`sender_role` on the chat API

**Files:**
- Modify: `app/chat/router.py` — `ChatMessageOut` (line 168), `list_messages` (line 981-991 loop), `send_message` response, `post_agent_message`.
- Test: `tests/chat/test_sender_attribution.py`

- [ ] **Step 1: Write the failing test** — seed a `site` conversation with two messages from two different users; GET `/chat/messages` and assert each `sender_name` matches the author and a nivaan/system row has `sender_name is None`. (Model the test on existing chat tests in `tests/` — find one with `grep -rl "chat/messages" tests`.)

```python
# tests/chat/test_sender_attribution.py  (skeleton — mirror existing chat test setup/fixtures)
import pytest

@pytest.mark.asyncio
async def test_list_messages_includes_sender_name(client, seed_site_conversation_two_authors):
    convo_id, alice_id, bob_id = seed_site_conversation_two_authors
    r = await client.get(f"/api/v1/chat/messages?conversation_id={convo_id}")
    assert r.status_code == 200
    rows = r.json()
    names = {row["sender_id"]: row["sender_name"] for row in rows if row["sender_id"]}
    assert names[str(alice_id)] == "Alice"
    assert names[str(bob_id)] == "Bob"
    assert all("sender_role" in row for row in rows)
```

- [ ] **Step 2: Run to verify fail** — `uv run pytest tests/chat/test_sender_attribution.py -v` → FAIL (`KeyError: sender_name`).

- [ ] **Step 3: Implement**
  - Add to `ChatMessageOut` (after `sender_kind`): `sender_name: str | None = None` and `sender_role: str | None = None`.
  - In `list_messages`, after fetching `rows` and before the output loop, batch-resolve authors:
    ```python
    sender_ids = {r.sender_id for r in rows if r.sender_id is not None}
    users_by_id: dict[UUID, tuple[str | None, str | None]] = {}
    if sender_ids:
        urows = (await session.execute(
            select(User.id, User.name, User.role).where(User.id.in_(sender_ids))
        )).all()
        users_by_id = {u.id: (u.name, u.role.value if u.role else None) for u in urows}
    ```
    Then inside the `for r in rows` loop, after `model_validate`:
    ```python
    name, role = users_by_id.get(r.sender_id, (None, None))
    msg_out.sender_name = name
    msg_out.sender_role = role
    ```
    (Ensure `User` and `select` are imported in the module — `select` already is.)
  - In `send_message`, after building `out = ChatMessageOut.model_validate(msg)`, set `out.sender_name = user.name` and `out.sender_role = user.role.value`.

- [ ] **Step 4: Run test + regression** — `uv run pytest tests/chat -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/chat/router.py tests/chat/test_sender_attribution.py
git commit -m "feat(chat): expose sender_name/sender_role on messages"
```

### Task P1.2: Mobile bubble shows the sender name

**Files:**
- Modify: `src/api/chat.ts` (line ~33, the message type) — add `sender_name?: string | null; sender_role?: string | null;`
- Modify: `src/chat/MessageView.tsx` — render the name on incoming, multi-sender, human bubbles.
- Run typecheck from `constructo/mobile/`.

- [ ] **Step 1:** Add the two fields to the `ChatMessage` API type in `src/api/chat.ts`.
- [ ] **Step 2:** In `MessageView.tsx`, when `sender_kind === 'user'`, the message is NOT mine (`sender_id !== myUserId`), and the conversation is multi-sender (`site`/`group` — pass a `showSenderName` prop from the feed, true for site/group, false for the 1:1 homeowner channel), render a small name label above the bubble:
  ```tsx
  {showSenderName && !mine && item.sender_kind === 'user' && item.sender_name ? (
    <Text style={styles.senderName}>{item.sender_name}</Text>
  ) : null}
  ```
  Add a `senderName` style (small, semibold, muted, marginBottom 2). Pass `showSenderName` down from `MessageFeed.tsx`/the screen based on `conversation.kind`.
- [ ] **Step 3:** Run: `cd ../mobile && npm run typecheck` → Expected: no errors. If the repo has chat component tests (`grep -rl MessageView src/**/__tests__`), update/add one asserting the name renders for a non-mine site message and not for the homeowner channel.
- [ ] **Step 4: Commit**

```bash
git add src/api/chat.ts src/chat/MessageView.tsx src/chat/MessageFeed.tsx
git commit -m "feat(chat-ui): show sender name on multi-sender bubbles"
```

### Task P1.3: `chat_seed` library (conversations + channel + seed message)

**Files:**
- Create: `app/ingestion/chat_seed.py`
- Test: `tests/ingestion/test_chat_seed.py`

Interface to build:
```python
async def get_or_create_conversations(session, *, company_id, site_id) -> tuple[Conversation, Conversation]:
    """Return (site_conv, homeowner_conv) singletons, uuid5-keyed, idempotent."""

def classify_channel(*, sender_role: str, text: str | None, media_kind: str | None,
                     llm_label: str | None = None) -> str:
    """Return "site" or "homeowner". Deterministic shortcuts:
       homeowner-authored → "homeowner"; site-engineer/on-site daily photo or
       material/labor logistics → "site"; else use llm_label ("homeowner_facing"
       → "homeowner", else "site")."""

async def seed_chat_message(session, *, conv, user, text, media_url, media_mime,
                            media_type, sent_at, client_msg_id, sender_side) -> ChatMessage:
    """Create a ChatMessage (gap-free chronological seq, created_at=sent_at,
       deterministic client_msg_id), mint RawMessage(source='app_chat',
       external_group_id=f'app:{conv.site_id}', raw={chat_message_id,sender_side}),
       set raw_message_id, return the message. Idempotent: if a ChatMessage with
       this (conversation_id, client_msg_id) exists, return it unchanged."""
```

- [ ] **Step 1:** Write `tests/ingestion/test_chat_seed.py` (use the transactional session fixture from existing `tests/`): assert `get_or_create_conversations` is idempotent (same ids on re-call), `classify_channel` routes a homeowner-authored message to `"homeowner"` and a site-engineer photo to `"site"`, and `seed_chat_message` creates a ChatMessage + a bridged `RawMessage(source="app_chat")` with monotonic `seq`, and is idempotent on the same `client_msg_id`.
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement `app/ingestion/chat_seed.py`. Reuse the seq pattern (`locked.last_seq + 1` under a row lock — see `app/chat/router.py:263`). Conversation ids = `uuid5(NS, "site-conv"|"homeowner-conv")` from the importer namespace (import or replicate `_id`).
- [ ] **Step 4:** Run → PASS; `uv run ruff check app/ingestion`.
- [ ] **Step 5: Commit** `feat(ingestion): chat_seed library for WhatsApp→in-app chat`.

### Task P1.4: Evolve the importer message stage to seed `app_chat`

**Files:**
- Modify: `scripts/import_whatsapp_export.py` — `build_world` (add conversation creation), `import_messages` (route each message through `chat_seed` instead of writing a bare `RawMessage(source="whatsapp_export")`), keep media upload + `PublishedPhoto`.

- [ ] **Step 1:** Update `SENDER_ROLES` to the verified cast (Anamika/Mansi/Vikas → `architect`; `HOMEOWNER_PRIMARY = "Anil Tripathi"`).
- [ ] **Step 2:** In `build_world`, after the site exists, call `get_or_create_conversations(...)` and stash the two conversation ids in the returned `world` dict.
- [ ] **Step 3:** In `import_messages`, for each real message: upload media (existing logic) → compute `media_type`/`media_url`/`media_mime` → `channel = classify_channel(...)` (cheap LLM only for ambiguous firm/architect messages; deterministic otherwise) → `conv = site_conv if channel=="site" else homeowner_conv` → `seed_chat_message(...)` (deterministic `client_msg_id=_id("cmsg", str(line_no))`). Extraction runs via the existing `handle_ingested(raw.id)` path the seed minted. Keep the `PublishedPhoto` publish for images.
- [ ] **Step 4:** Keep the `WhatsappGroup` mapping row (forward-compat) but DO NOT also create `whatsapp_export` raw rows (no double extraction).
- [ ] **Step 5:** Update the dry-run report to show per-channel message counts. Run a dry run: `uv run python -m scripts.import_whatsapp_export --zip "<vault>/WhatsApp Chat - CADS_LKO_24-25_101_TRIPATHI DREAM HOME.zip"` → eyeball the cast + channel split.
- [ ] **Step 6: Commit** `feat(import): seed WhatsApp history as in-app chat (site+homeowner)`.

### Task P1.5: Local cheap-slice validation (real Azure)

- [ ] **Step 1:** Ensure local Postgres is up and `.env` has `LLM_PROVIDER=azure`, `AZURE_OPENAI_DEPLOYMENT_SMART=gpt-4o`, `STORAGE_BACKEND=local` (NOT s3 — keep local for this dry validation), `DATABASE_URL=<localhost>`.
- [ ] **Step 2:** Run a recent slice with media + vision against LOCAL:
  `uv run python -m scripts.import_whatsapp_export --zip "<vault-zip>" --since 2026-05-01 --run`
- [ ] **Step 3:** Census: `uv run python -m scripts.census_roles` (built in P4.1) OR the ad-hoc census query. Verify: `site_events` `unknown` share < ~15%, both conversations have messages, photos have captions, sender names resolve. Eyeball 10 random events for quality.
- [ ] **Step 4:** If quality is off, tune prompts/escalation and re-run the slice (idempotent). Do NOT proceed to prod until the slice looks right. No commit (operational), but note results in the plan/PR.

---

## Phase P2 — Document intelligence (the 167 PDFs)

### Task P2.1: PDF reader

**Files:** Create `app/extraction/pdf_read.py`; Test `tests/extraction/test_pdf_read.py`.

- [ ] Build `async def read_pdf(pdf_url_or_path, *, llm=None) -> dict` returning `{"text": str, "kind": "floor_plan"|"layout"|"render"|"other", "rooms": [..], "notes": str}`.
  - Text layer: prefer **Azure DocIntel** (`AZURE_DOCINTEL_ENDPOINT/KEY/API_VERSION` in `.env`) via a new thin `DocIntelClient`; if unavailable, rasterize the first N pages with `pymupdf` (check `uv run python -c "import fitz"`; add dep if missing) and send page images to `caption_photo`/vision.
  - Plan understanding: rasterize page→image→vision-tier `complete_vision` with a floor-plan prompt to list rooms/areas + key dimensions mentioned.
  - Guard the 50 MB render: cap pages read (e.g. first 3) and downscale.
- [ ] Test with `FakeLLMClient` + a tiny fixture (or monkeypatched DocIntel) — assert it returns the dict shape and never raises on a missing text layer.
- [ ] Commit `feat(extraction): PDF reader (DocIntel + rasterize→vision)`.

### Task P2.2: `enrich_documents.py`

**Files:** Create `scripts/enrich_documents.py`; Test `tests/test_enrich_documents.py`.

- [ ] For each `RawMessage`/`ChatMessage` whose media is a PDF (the 167), call `read_pdf`. Map results idempotently (`uuid5`):
  - floor-plan/layout → upsert `Space` (floors/rooms) + `Component`s (read `app/models/homeowner_property.py` for fields) for the site, and a `PublishedDrawing` register row.
  - render → a `PublishedDrawing` + a design-intent note feeding the profiler (P3.3).
- [ ] Test with fakes: a fake `read_pdf` returns two rooms → assert two `Space` rows upserted, re-run upserts (no dupes).
- [ ] Run command (local first): `uv run python -m scripts.enrich_documents` then census drawings/spaces.
- [ ] Commit `feat(enrich): documents → spaces/components/specs/drawings`.

---

## Phase P3 — Derived product surfaces (one generator per surface)

**Each generator task follows the same shape** (do these in order; each is independently committable):
1. Read the target model file (paths in File Structure) — use the real columns; do not guess.
2. Write a FakeLLM/fixture unit test in `tests/test_enrich_<surface>.py` asserting: (a) it derives the expected rows from a small seeded corpus, (b) it is idempotent (`uuid5`), (c) it never fabricates when there's no signal (empty corpus → 0 rows).
3. Implement `scripts/enrich_<surface>.py` with an `async def run(session_factory=SessionLocal)` entry + `if __name__=="__main__"` asyncio runner.
4. Run locally, census, commit.

- [ ] **P3.1 `enrich_decisions.py`** — scan homeowner-channel threads + `approval`/`drawing_shared` events for approval/change moments ("do vertical bricks", "move shower…", "98% there", "yes/approved"); smart-tier LLM extracts each into a `Decision` (read `app/models/decision.py` for `kind`/`state`/`spec_id`). Link to the homeowner user as asker where applicable. Feeds owner/architect/homeowner approvals inbox.
- [ ] **P3.2 `enrich_specs.py`** — from `enrich_documents` spaces/components + `material_delivery` events + finish-choice messages, upsert `Spec` + `Material` (+ `Component` links). Set routing_status across draft/out_for_approval/released so the architect Selections schedule has variety. Read `app/models/spec.py`, `app/models/material.py`.
- [ ] **P3.3 `enrich_profiler.py`** — from the design-phase threads + reference photos + render notes, create one `ProfilerProfile` with areas/themes/references and a generated `ProfilerBrief` (smart tier). Read `app/models/profiler.py`.
- [ ] **P3.4 `enrich_audits.py`** — cluster site-condition/issue updates into 2-3 `Audit`s with `AuditSection`/`AuditFinding`. Read `app/models/audit.py`.
- [ ] **P3.5 `enrich_dpr.py`** — group construction-phase site updates by day into `Dpr` rows (headcount + work-done summary from that day's events). Read `app/models/dpr.py`.
- [ ] **P3.6 `enrich_action_items.py`** — task-bearing messages ("share new layout with clearances", "make changes and share") → `ActionItem` (+ `ActionItemEvent`). Read `app/models/action_item.py`.
- [ ] **P3.7 `enrich_payments.py`** — deterministic: each `invoice_received` event → a `Payment` row (amount/vendor/date from the event fields; status from any matching payment_request). Read `app/models/payment.py`.
- [ ] **P3.8 `enrich_site_changes.py`** — revision/scope-change threads (the "increase shower width", "reduce passage") → `SiteChange`. Read `app/models/site_change.py`.
- [ ] **P3.9 `enrich_quiet_periods.py`** — deterministic (no LLM): detect ≥N-day gaps with no events and upsert `QuietPeriod`. Read `app/models/homeowner_quiet.py`.
- [ ] **P3.10 `enrich_all.py`** — driver that runs P2.2 then P3.1→P3.9 in order, printing a count summary. Commit `feat(enrich): ordered enrichment driver`.

---

## Phase P4 — Verification + production run

### Task P4.1: `census_roles.py`

**Files:** Create `scripts/census_roles.py`.

- [ ] Print per-table counts scoped to the CivilArch company/site (companies, users-by-role, conversations + chat_messages per kind, site_events by type with the `unknown` %, published_photos with caption coverage %, published_drawings, decisions, specs, materials, profiler, audits, dprs, action_items, payments, site_changes, quiet_periods) plus a per-focus-role "surfaces non-empty?" checklist. Exit non-zero if any focus-role surface is empty or `unknown` % > 15.
- [ ] Run locally after the P1.5 slice + enrichment to confirm the gates pass. Commit `feat(scripts): per-role census + quality gates`.

### Task P4.2: Production run into Neon + R2 (GATED)

> **STOP — requires the user at kickoff:** the current prod **Neon `DATABASE_URL`**, confirmation `.env` S3/R2 is the prod bucket, and explicit **purge** approval. Remind the user to **rotate the previously-pasted Neon password**. Do not run any prod-mutating command without this.

- [ ] **Step 1 — Purge old import (destructive, confirmed):**
  `DATABASE_URL="<neon>" STORAGE_BACKEND=s3 uv run python -m scripts.import_whatsapp_export --purge`
- [ ] **Step 2 — Free dry-run on prod env:** same env, no `--run` → confirm cast + channel split + counts.
- [ ] **Step 3 — Cheap slice on prod:** add `--since 2026-05-01 --run`; census; eyeball.
- [ ] **Step 4 — Full import:** `DATABASE_URL="<neon>" STORAGE_BACKEND=s3 uv run python -m scripts.import_whatsapp_export --zip "<vault-zip>" --run` (resumable; re-run on any drop).
- [ ] **Step 5 — Enrichment on prod:** `DATABASE_URL="<neon>" STORAGE_BACKEND=s3 uv run python -m scripts.enrich_all`.
- [ ] **Step 6 — Census gate on prod:** `DATABASE_URL="<neon>" uv run python -m scripts.census_roles` → all focus-role surfaces non-empty, `unknown` < 15%.
- [ ] **Step 7 — Per-role login smoke:** log in (phone + OTP `000000`) as Anil (homeowner), Saurabh Pandey (owner), Er Lokesh (supervisor), Anamika (architect); confirm each app surface incl. chat-with-sender-names + cards. Record the credential list + census in the PR.

---

## Self-Review notes

- **Spec coverage:** §5.1 routing→P0.1; §5.2 chat seeding→P1.3/P1.4; §5.3 sender attribution→P1.1/P1.2; §5.4 vision→P0.3/P2; §5.5 derived surfaces→P3; §5.6 cast→P1.4; prod safety §6→P4.2; verification §7→P4.1/P4.2.
- **No network in tests:** every test injects Fakes; real Azure only in the operational P1.5/P4 runs.
- **Idempotency:** all seed/enrich rows are `uuid5`-keyed; re-runs upsert.
- **Honest-empty:** generators emit 0 rows on no signal (asserted in tests); permits/vendor-confirm/disputes have no dedicated generator (no reliable real signal) — documented, not faked.
