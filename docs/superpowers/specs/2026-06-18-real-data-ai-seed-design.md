# Real-Data, AI-Extracted Seed Across All 4 Roles — Design

**Date:** 2026-06-18
**Status:** Approved for planning
**Target:** Prod Neon + Cloudflare R2
**Source data:** The real WhatsApp export `CADS/LKO/24-25/101/TRIPATHI DREAM HOME`
(`/Users/aryantripathi/Downloads/WhatsApp Chat - CADS_LKO_24-25_101_TRIPATHI DREAM HOME/`):
`_chat.txt` (3,945 real messages, 2024-04-16 → 2026-06-03), 2,319 photos, 167
architectural PDFs (every floor-plan iteration + the 50 MB render), 561 videos (skipped).

## 1. Goal

Turn the founder's real home-construction WhatsApp group into a fully populated,
loginnable Constructo company where **every product surface, for all four focus
roles, shows real, AI-extracted data** — including the in-app chat. Run all
extraction through the real Azure LLMs, routing between `gpt-4o-mini` and
`gpt-4o` by task.

The four focus roles: **homeowner, owner (contractor principal),
supervisor/site-engineer, architect/designer**.

## 2. Guiding principles

1. **Derive only from real signal — never fabricate.** Every seeded row traces
   back to a real message, photo, or PDF. Surfaces with no real data (e.g. formal
   permits) stay honestly empty rather than invented.
2. **Idempotent.** Deterministic `uuid5` ids + skip-if-exists everywhere, so a
   dropped Neon connection mid-run resumes cleanly on re-run.
3. **Prod-safe.** Free dry-run → cheap slice-validate → full run. Purge of the
   prior import is an explicit, confirmed gate.
4. **One extraction per message.** Each WhatsApp message becomes exactly one
   in-app `ChatMessage` → one `RawMessage(source="app_chat")` → one extraction.
   No double-booking of events.

## 3. Current state (verified)

- **Importer exists** (`scripts/import_whatsapp_export.py`): builds
  company/site/users/roles/members/group-mapping, replays messages as
  `RawMessage(source="whatsapp_export")` → extraction → `SiteEventModel`, uploads
  media to R2, publishes photos, scaffolds the homeowner view (Property/Space/
  Milestone/Update), builds briefs + search index. Idempotent (`uuid5`).
- **Extraction pipeline** (`app/extraction/`): classify → extract (LLM JSON mode)
  → events; OCR via Azure DocIntel; STT via Sarvam; embeddings via Azure
  `text-embedding-3-large`. `complete_vision` exists on the LLM clients but the
  import never calls it for images.
- **Azure wired** (`.env`): `LLM_PROVIDER=azure`, `AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini`,
  `EXTRACTION_SYNC=True`, `STORAGE_BACKEND=s3` (R2), Sarvam STT, Azure DocIntel.
  **No `gpt-4o` / vision deployment var yet** — model routing is net-new.
- **Prior import** (2026-06-03, prod Neon, gpt-4o-mini only) was weak: ~47%
  `unknown` events, no vision on plans/photos, ~12 product surfaces left empty.
  Must be purged and rebuilt.
- **In-app chat** (`app/chat/`): per-site **singleton** `site` (crew/Blueprint)
  and `homeowner` (curated/Calm-Cockpit) conversations. Membership derived from
  site scope. Live send mints `RawMessage(source="app_chat",
  external_group_id="app:{site_id}")`, bridges via `ChatMessage.raw_message_id`,
  enqueues extraction, and the worker upgrades the bubble into an AI card.
  Access: homeowner reads ONLY the homeowner thread; crew reads both.

## 4. Target state — what each role sees after the seed

| Role | App surfaces that become non-empty |
|---|---|
| **Homeowner** (Anil) | Home, Updates/Milestones/Changes, **Messages (homeowner chat with real cards)**, Design (profile/selections/conflicts), Decisions + approvals inbox, Drawings, Photos (captioned, room-tagged), Notifications, Property/rooms |
| **Owner** (Saurabh Pandey) | Brief/Home, Approvals inbox, Sites + detail + events, Audit, Specs, Design, Disputes, Permits, Foresight/forecast, Sentinel, **Chat (site + homeowner)**, Team, Search, Payments |
| **Supervisor / Site Engineer** (Er Lokesh) | Home, My Sites, Site detail + events, Audit, DPR, Capture/Photos, Drawings, Action Items, **Chat (site)**, Disputes |
| **Architect** (Anamika) | Selections (spec routing schedule), Home/brief, Changes, Design site (property/rooms/components), **Chat**, Profile, Profiler workflow + brief |

## 5. Architecture

Approach **A**: keep world-building from the existing importer; evolve the
**message stage** to seed the in-app chat; add an **enrichment layer** of small,
idempotent, per-surface generators that read the whole corpus (events + message
threads + documents) for cross-message-context derivations.

### 5.1 Tiered model routing — `app/extraction/llm.py`

- New env: `AZURE_OPENAI_DEPLOYMENT_SMART=gpt-4o` (mini stays
  `AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini`).
- `get_llm_client(tier="cheap")` returns an Azure client bound to the right
  deployment: `cheap`→mini, `smart`→4o, `vision`→4o. Back-compat: existing
  no-arg `get_llm_client()` keeps returning the cheap/default client.
- **Escalation:** `extract()` runs `cheap` first; if `confidence < 0.6` or
  `event_type == unknown`, it retries once on `smart`. This is the primary lever
  against the prior 47%-unknown rate. Escalation is logged + counted.

### 5.2 In-app chat seeding (the WhatsApp → chat requirement)

Seed the real conversation **as in-app chat**, replacing the old
`whatsapp_export` raw path:

- **Conversations:** create the two per-site singletons — `site` (crew) and
  `homeowner` (curated) — `uuid5`-keyed.
- **Channel routing per message** (which conversation a message lands in):
  - Deterministic shortcuts: homeowner-authored (Anil/Ashok) → homeowner thread;
    site-engineer/on-site daily site-photo & material/labor logistics → site thread.
  - Ambiguous firm/architect messages: a **cheap (4o-mini)** one-shot classifier
    labels `homeowner_facing` vs `crew_internal`. Homeowner-facing → homeowner
    thread; else site thread.
  - Each message lands in **exactly one** conversation.
- **Per message:** create `ChatMessage` (deterministic `client_msg_id`=uuid5(line),
  chronological gap-free `seq` per conversation, `created_at`=real `sent_at`,
  `sender_id`, `sender_side` = homeowner|contractor, `body`, media
  `attachment_key`/`attachment_mime`/`media_type`, `media_sha256`). Then mint
  `RawMessage(source="app_chat", external_group_id="app:{site_id}",
  raw={chat_message_id, sender_side})`, set `raw_message_id`, run extraction.
  Mirrors the live send flow exactly → events + inline AI cards, no worker change.
- **Media:** images + PDFs uploaded to R2 (existing `get_storage().put_bytes`),
  attached to the chat message AND surfaced as `PublishedPhoto` (images) /
  `PublishedDrawing` (plans) where appropriate.
- **No `whatsapp_export` duplication:** the `WhatsappGroup` mapping row is still
  created (forward-compat for live WhatsApp bridging) but history is seeded via
  `app_chat`, so events are produced once.

### 5.3 Vision pipeline — new `app/extraction/vision.py`

- **Photos (2,319):** `cheap` (4o-mini) vision captions + classifies routine site
  photos → caption + room tag → `progress_update`/`issue` event +
  `PublishedPhoto`. `smart` (4o) vision for design-option photos and anything
  flagged drawing/plan.
- **PDFs (167):** Azure DocIntel for the text layer + `vision` (4o) for
  floor-plans/layouts/renders → rooms (`Space`), `Component`s, design specs, and
  the `PublishedDrawing` register. Multi-page PDFs read page-by-page; the 50 MB
  render handled with care (downscale/first-pages).
- Routing keeps cost down: mini for the photo bulk, 4o for the ~167 plans + the
  design-option subset.

### 5.4 Derived-surface generators — `scripts/enrich_*.py` (idempotent, uuid5)

| Surface | Real signal → | Target tables | Tier |
|---|---|---|---|
| Decisions / Approvals | homeowner approval & change threads ("do vertical bricks", "move shower…", "98% there") | `Decision` (homeowner_question/approval) | smart |
| Specs + Components + Materials | design PDFs + material-delivery events + finish choices | `Spec`, `Component`, `Material` | smart + vision |
| Design Profiler + Brief | design-phase threads + reference photos | `ProfilerProfile`/area/theme/reference/clarification + `ProfilerBrief` | smart |
| Audits | site-condition update threads/photos | `Audit`, `AuditSection`, `AuditFinding` | cheap |
| DPR | construction-phase daily site updates | `Dpr` | cheap |
| Action items | task-bearing messages ("share new layout with clearances") | `ActionItem`, `ActionItemEvent` | cheap |
| Payments | `invoice_received` events | `Payment` | deterministic |
| Site changes | revision/scope-change threads | `SiteChange` | cheap |
| Quiet periods | event-gap analysis (no LLM) | `QuietPeriod` | deterministic |
| Permits / vendor-confirm / disputes | derive only if real signal exists; else honest-empty | — | — |

### 5.5 Role mapping / cast (written into importer `SENDER_ROLES`)

| Sender | Msgs | Role | Notes |
|---|---|---|---|
| Er Lokesh Kumar Sharma | 2,135 | supervisor | site engineer, daily photos |
| Anil Tripathi | 591 | homeowner (**primary_owner**) | drives all decisions |
| Saurabh CivilArchGroup | 340 | pm | firm |
| Anamika Civilarc | 316 | **architect** | lead designer |
| Saurabh Pandey | 238 | owner | created group, principal |
| Mansi Kanojia | 134 | architect | design team |
| +91 89603 69529 | 106 | supervisor | on-site |
| Vikas Civilarch | 60 | architect | design team |
| Ashok | 15 | homeowner (co_owner) | named client (father) |
| prabha Civilarch | 5 | accountant | kept as real user; not a focus role |
| Rahul Priyadarshi | 4 | procurement | kept as real user; not a focus role |
| Adarsh | 1 | labor_contractor | kept as real user; not a focus role |

Login: phone + dev OTP `000000`. All 12 kept as real users (faithful
attribution); seeding/verification focuses on the 4 focus roles.

## 6. Prod-Neon safety, sequencing & cost

1. **Inputs required at kickoff:** the current prod **Neon `DATABASE_URL`** and
   confirmation R2 creds in `.env` are the prod bucket. Per the founder's own
   note: **rotate the previously-pasted Neon password**.
2. **Purge gate (explicit confirm):** run `--purge` to remove the 2026-06-03
   import (DB rows + R2 `wa-tripathi/` objects) before rebuilding.
3. **Validate cheap before full:** free dry-run → slice (`--since 2026-05-01`,
   ~$0.20) to eyeball extraction/chat/vision quality → full run.
4. **Cost:** ~$20–60 Azure (vision-dominated), ~$0 Neon/R2. Within credits.
5. **Resumability:** all `uuid5` + skip-if-exists; per-item try/except so a
   dropped connection skips one item and re-run retries it.

## 7. Verification (per-role, before "done")

Log in (phone + OTP `000000`) as homeowner (Anil), owner (Saurabh Pandey),
supervisor (Er Lokesh), architect (Anamika) and confirm each app's surfaces are
non-empty: events, photos (captioned), drawings, **chat with real cards**,
approvals/decisions, specs, design brief, audits, DPR, timeline. Capture a
counts census (`site_events` by type with `unknown` < ~15%, chat_messages per
conversation, decisions, specs, etc.). Fix any thin surface.

## 8. Implementation phases

- **P0 — Foundations:** tiered model routing + escalation; `vision.py`; prod prep
  (Neon URL, purge, dry-run).
- **P1 — Core import as in-app chat:** evolve message stage → conversations +
  `app_chat` seeding + extraction; media → R2 + photos/drawings; briefs + index;
  homeowner scaffold.
- **P2 — Document intelligence:** the 167 PDFs → rooms/components/specs/drawings.
- **P3 — Derived surfaces:** decisions, specs, profiler+brief, audits, DPR,
  action items, payments, site changes, quiet periods.
- **P4 — Per-role verification:** login + surface census for all 4 roles; fix gaps.

## 9. Risks / open items

- **Neon URL + purge confirmation** needed at kickoff (destructive on prod).
- **Channel classification** (homeowner vs crew) is heuristic + cheap-LLM; a few
  misroutes are acceptable (crew can read both threads anyway).
- **PDF vision cost/latency** on the 50 MB render — handle defensively
  (first-pages / downscale).
- **Honest-empty** surfaces (permits/vendor-confirm/disputes) if no real signal —
  documented, not fabricated.

## 10. Out of scope

- Videos (561 mp4) — not used by the app.
- Live WhatsApp bridging (the `WhatsappGroup` row is created for forward-compat
  only).
- Net-new product features — this is data population + the minimal routing/vision
  plumbing required to populate well.
