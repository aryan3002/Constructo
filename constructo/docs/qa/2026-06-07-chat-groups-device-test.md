# QA Report — Multi-Role Chat & Groups (Doc 18, All 4 Phases)
**Date:** 2026-06-07  
**Engineer:** Automated QA Session (Senior QA / Release Verification)  
**Feature:** Doc 18 — Multi-Role Chat & Groups (Phases 1–4)

---

> ⚠️ **RE-VERIFICATION ADDENDUM (2026-06-07, maintainer).** The two "bugs" below were
> re-checked against the source + test suite and are **BOTH FALSE POSITIVES** — no code
> change was made or is needed (fixing either would break correct, tested behavior). The
> real verdict is **SHIP**. Details in the amended Bug #1 / Bug #2 sections. The original
> QA text is retained for the record but is superseded by this addendum.

## 1. Summary Verdict

**SHIP** (revised from SHIP-WITH-CAVEATS after re-verification).

The core feature is solid. All 91 automated backend tests pass clean. The critical
access-control invariants hold: homeowners cannot see `kind=site` threads, non-owners
cannot create groups, the last-admin guard fires (409) on **both** DELETE and PATCH-demote,
and the company-wide talk-only pipeline correctly suppresses extraction events.

**The two reported "bugs" are not bugs:**
1. **Bug #1 is a malformed-request artifact.** The repro sent `{"member_user_id", "role"}` at
   the top level, but the API schema is `{"member_role": {"user_id", "role"}}`. Pydantic
   ignores the unknown fields → no-op → 200. With the **correct** body the endpoint returns
   **409 `last_admin`** (proven by `test_demote_last_admin_conflict`, which passes). The real
   mobile client sends the correct shape.
2. **Bug #2 is intended, tested behavior.** Silently skipping an ineligible user (a homeowner
   on a company-wide group) and returning the authoritative roster is the deliberate design
   (`test_company_wide_add_members_skips_homeowner` asserts exactly 200 + homeowner absent).
   The security invariant holds; the UI never offers a homeowner for a company-wide group.

**Remaining real follow-ups (non-blocking):**
1. ✅ **Live device sign-off DONE** (maintainer, via computer-use driving the Simulator —
   the `xcrun simctl tap` limitation was bypassed with real pixel taps). O1/O2/O4/H1/H2 all
   PASS live; see **§1b**. One new edge-case finding surfaced (homeowner inbox depends on
   `siteId`; see §1b Finding F1).
2. (Optional) `seed_demo.py` idempotency by phone (dev-experience; see Gap 2).

---

## 1b. Live Simulator Verification (maintainer addendum, 2026-06-07)

The original session could not drive the simulator (`xcrun simctl tap` is gone in Xcode 26.5).
A follow-up pass drove the **booted iPhone 17 Pro simulator directly via computer-use** (real
pixel taps + clipboard-paste for text entry — synthetic keystrokes don't reach the iOS text
layer, so login used the Mac→iOS pasteboard sync). Backend on `:8001`, app `.env` pointed there,
Metro restarted with `-c`. Dev OTP `000000` (`app/auth/router.py` `STUB_OTP`).

**Boot check (E1):** Metro bundled clean — **no `[Layout children]: No route named "messages"/"chat"`
warning** (the route-name bug that hid the tabs is gone). The only route warnings are benign
helper-module (`_components.tsx` / `_util.ts`) "missing default export" notices.

**Owner (logged in as `+919800000001`, OTP `000000`):**
- **O1 ✅ live** — bottom tabs render **Brief · Chat · Sites · Approvals · More** (Search moved into More).
- **O2 ✅ live** — the **Chat inbox** renders four conversations with unread badges + recency:
  `Homeowner · Green Valley Villa` (person glyph), `QA TEST Company-Wide` (**◈ Company-wide** tag),
  `Green Valley Villa` crew thread (**◆ Client in this thread** cue), `QA TEST Site Group`.
  (This single screen also live-confirms the Phase-3 homeowner-row label, the Phase-4 company-wide
  tag, and the Phase-1/3 client-present cue.)
- **O4 ✅ live** — the amber **“+ New group”** button is present for the owner. Tapping it opens the
  **New group** sheet showing a **“Company-wide (no site)”** scope option above the site list, with
  the hint **“Choose a site, or make it company-wide.”** (Phase-2 create sheet + Phase-4 option live).

**Homeowner (Daylight):**
- **H1 ✅ live** — bottom tabs render **Home · Photos · Updates · Messages · Design**; the **Messages**
  tab (the one originally reported missing) is present after the route fix. The Messages screen
  renders Daylight-themed (“Talk to your builder and site team”).
- **H2 ✅ live** — the **Your builder** thread renders the homeowner’s message
  (“QA TEST homeowner talk-only”) as a **green Calm-Pine own-bubble with white text** on warm paper —
  Daylight styling, NOT Blueprint amber. The inbox row shows a green **“● 1 new”** unread pill.

**Finding F1 (NEW, edge-case, medium-low):** the homeowner Messages **inbox shows the “Your builder”
channel only when `useAuth().siteId` is populated.** Verified directly: logging in via **phone+OTP**
(which does not persist `siteId`) showed an **empty inbox** even though the channel exists and the
backend returns it from `/chat/conversations`; logging in via the **join-code flow** (which sets
`siteId`) showed the channel correctly. Normal homeowners join via code, so `siteId` is set in
practice — but the inbox is not resilient: it derives the builder row solely from the
`siteId`-keyed get-or-create, not from the `kind=homeowner` row already present in
`/chat/conversations`. **Suggested fix:** surface the `kind=homeowner` conversation from
`conversations()` as the builder row (fallback / in addition to the get-or-create) so it appears
regardless of `siteId`. Not a blocker; no security impact.

**Net:** every UI row that was previously code-only is now **PASS live**. O4-negative (New-group
hidden for supervisor) remains code-confirmed (`isOwner = me?.role === 'owner'`) — not separately
re-driven, low risk.

---

## 2. Environment

### 2a. Backend
| Property | Value |
|---|---|
| Host | `http://localhost:8001` (local Docker Postgres on port 5433) |
| Git commit | `ed498c411dee1c704904d2a89fa3a8659c72fc3e` (short: `ed498c4`) |
| Python | 3.12, `uv` package manager |
| Migration | Applied up to `a7c1f2d3b4e5` (Groups subsystem migration) |
| DB | `postgresql+asyncpg://constructo:constructo@localhost:5433/constructo` |
| Redis | `redis://localhost:6379/0` |

### 2b. Setup Commands Run
```bash
# Migration
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run alembic upgrade head
# → Applied through a7c1f2d3b4e5 (Groups subsystem)

# Seed partial: seed_demo.py failed (UniqueViolationError on phone upsert)
# Users +919800000001/002/003 already existed with role=owner.
# Manual fixup applied via Python script:
#   - Fixed +919800000003 → role=supervisor
#   - Fixed +919800000002 → role=pm
#   - Created site_assignment for supervisor → Green Valley Villa
#   - Created homeowner_members row with join_code=SUNRISE-HOME

# Backend on port 8001
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  EXTRACTION_SYNC=True REDIS_URL=redis://localhost:6379/0 \
  uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### 2c. Roles Used
| Role | Phone | User ID |
|---|---|---|
| Owner | +919800000001 | `dde5ee40-af42-418f-8951-09d43d2d8f63` |
| PM | +919800000002 | `704d3e44-e475-4d27-9c51-87d74c7a554d` |
| Supervisor | +919800000003 | `bc8ad04f-af3c-42df-a26a-48ab96318891` |
| Homeowner | +919855000099 (join_code=SUNRISE-HOME) | `a680e2b2-f11e-4cc9-b8bc-0e60b44ca003` |

### 2d. Simulator / Device
| Property | Value |
|---|---|
| Device | iPhone 17 Pro (Simulator) |
| UDID | `D14F8043-CE43-4AC6-A2E4-4660AA900CD4` |
| State | Booted |
| Xcode | 26.5 (Build 17F42) |
| Mobile app | Expo Go 54.0.7 + Metro on port 8081 |
| Screen | 1206×2622 px |

---

## 3. Automated Results — Track A

### A1. Backend Test Suite

```
91 passed, 24 warnings in 5.93s
```

**Test files run:**
- `tests/test_chat_api.py`
- `tests/test_chat_access.py`
- `tests/test_groups_api.py`
- `tests/test_homeowner_channel.py`
- `tests/test_groups_model.py`

**Result:** **91/91 PASS** ✓  
Warnings are pre-existing `RuntimeWarning: coroutine 'Connection._cancel' was never awaited` from asyncpg and a `DeprecationWarning` from pydantic's `datetime.utcnow()`. None are new failures.

---

### A2. Key API Calls — Evidence

#### A2.1 Owner inbox (GET /chat/conversations) — PASS
Shows site thread + homeowner channel + groups, sorted by last_message_at:
```json
[
  {"id": "affaf5cb-...", "kind": "homeowner", "site_name": "Green Valley Villa",
   "last_message_at": "2026-06-07T22:45:41Z", "unread_count": 1, "has_homeowner": true},
  {"id": "1f0ec564-...", "kind": "group", "title": "QA TEST Company-Wide",
   "site_id": null, "last_message_at": "2026-06-07T22:45:22Z", "unread_count": 1},
  {"id": "acc010a2-...", "kind": "site", "site_name": "Green Valley Villa",
   "last_message_at": "2026-06-07T22:44:32Z", "unread_count": 1, "has_homeowner": true},
  {"id": "de5e0a82-...", "kind": "group", "title": "QA TEST Site Group",
   "site_id": "0ea7d211-...", "last_message_at": null, "unread_count": 0}
]
```

#### A2.2 Homeowner inbox — PASS (no kind=site rows)
```json
[
  {"id": "affaf5cb-...", "kind": "homeowner", "site_name": "Green Valley Villa",
   "last_message_at": "2026-06-07T22:45:41Z", "unread_count": 1, "has_homeowner": true}
]
// Homeowner site-kind rows (MUST be empty): []  ✓
```

#### A2.3 Create homeowner channel (get-or-create) — PASS
```json
{
  "id": "affaf5cb-fb41-4546-94d9-57c461339804",
  "kind": "homeowner",
  "site_id": "0ea7d211-c949-487c-a26c-c453749b763d",
  "site_name": "Green Valley Villa",
  "has_homeowner": true
}
```

#### A2.4 Addable users (no site_id) — PASS (crew only, no homeowner)
```
All roles returned: ['owner', 'owner', 'owner', 'supervisor', 'owner', 'pm']
Homeowner in company-wide addable: []  ✓
```

#### A2.5 Addable users (with site_id) — PASS (homeowner included)
```
... crew roles + {"user_id": "a680e2b2-...", "role": "homeowner", "already_member": false}
```

#### A2.6 Create site group (owner) — PASS (201)
```json
{
  "id": "de5e0a82-26d5-4823-9981-325740467ac6",
  "name": "QA TEST Site Group",
  "site_id": "0ea7d211-c949-487c-a26c-c453749b763d",
  "archived": false,
  "members": [{"user_id": "dde5ee40-...", "name": "Rajesh Gupta (Owner)", "role": "admin"}]
}
```
HTTP 201 Created ✓

#### A2.7 Create group as supervisor — PASS (403)
```
HTTP Status: 403 (expected: 403) ✓
```

#### A2.8 Create company-wide group (no site_id) — PASS
```json
{
  "id": "1f0ec564-7c1e-4b62-962d-1b31ebd1a621",
  "name": "QA TEST Company-Wide",
  "site_id": null,
  "archived": false,
  "members": [{"user_id": "dde5ee40-...", "role": "admin"}]
}
```

#### A2.9 Company-wide message (talk-only) — PASS
```json
{
  "id": "9aa428d5-...",
  "conversation_id": "1f0ec564-...",
  "body": "QA TEST talk-only message",
  "events": []
}
// events: [] confirms NO extraction ✓
```

#### A2.10 Dashboard brief — NOT-RUN (endpoint mismatch)
The task referenced `GET /dashboard/brief?site_id=...` which returns **404 Not Found**. The actual endpoint is `GET /api/v1/chat/brief?site_id=...` which returns correctly:
```json
{"site_id": "0ea7d211-...", "risk_count": 1, "headline": "1 thing need you", "risks": [...]}
```
The company-wide group message correctly produced **zero events** in the chat brief — confirmed by `CW group events in site brief (must be empty): []` ✓.

#### A2.11 Last-admin guard — DELETE — PASS (409)
```
DELETE HTTP Status: 409 (expected: 409) ✓
```

#### A2.12 Last-admin guard — PATCH demote — **BUG #1 (FAIL)**
```
PATCH HTTP Status: 200 (expected: 409)
// Response body shows role is still "admin" (operation was silently rejected)
```
See Bug #1 in Section 5.

#### A2.13 Homeowner message to builder channel — PASS
```json
{
  "id": "58e52a8a-...",
  "conversation_id": "affaf5cb-...",
  "sender_side": "homeowner",
  "body": "QA TEST homeowner talk-only",
  "events": []
}
// events: [] confirms NO site extraction from homeowner channel ✓
```

#### A2.14 Homeowner inbox scoping — PASS
```
Site-kind rows in homeowner inbox (MUST be empty): []  ✓
Only kind=homeowner row visible to homeowner ✓
```

#### A2.15 Add homeowner to company-wide group — **BUG #2 (FAIL)**
```
HTTP Status: 200 (expected: 403)
// Members list after call: still only [owner] — homeowner silently NOT added
```
See Bug #2 in Section 5.

#### A2.16 Two-way check: owner inbox after homeowner posts — PASS
```
kind=homeowner  label="Homeowner · Green Valley Villa"  ✓
kind=group      QA TEST Company-Wide  site_id=None
kind=site       Green Valley Villa
kind=group      QA TEST Site Group    site_id=0ea7d211-...
```
The homeowner channel surfaces in the owner inbox with `kind=homeowner` after the homeowner posts ✓.

---

## 4. Results Matrix

| Test ID | Name | Result | Note | Evidence |
|---|---|---|---|---|
| E1 | No "No route named" Metro warnings | **PASS** | All 4 chat routes exist: `owner/chat.tsx`, `owner/chat/[id].tsx`, `homeowner/messages.tsx`, `homeowner/messages/[id].tsx`. Metro running clean on port 8081. | Route file listing §3 |
| O1 | Owner tabs: Brief·Chat·Sites·Approvals·More | **PASS** | `_layout.tsx` confirms: brief(◆), chat(✉), sites(▦), approvals(✓), more(☰). Search hidden (`href: null`). | Code inspection §3 |
| O2 | Owner Chat inbox shows conversations + unread badges | **PASS** | API confirmed inbox with `unread_count` per conversation. Code uses `<ConversationRow>` with badge rendering. | A2.1 JSON + code |
| O4 | "+ New group" visible for owner | **PASS (live)** | Driven on-device: owner sees the “+ New group” button; sheet opens with the “Company-wide (no site)” option. Supervisor-hidden case still code-confirmed (`isOwner`). | §1b |
| H1 | Homeowner tabs: Home·Photos·Updates·Messages·Design | **PASS** | Simulator screenshot + `_layout.tsx` confirms all 5 tabs. | Screenshot qa_H1; code |
| H2 | Messages tab Daylight green own-bubbles | **PASS (live)** | Driven on-device: the “Your builder” thread renders a green Calm-Pine own-bubble (white text) on warm paper — not amber. | §1b |
| O2(live) | Owner Chat inbox renders on device | **PASS (live)** | 4 conversation rows with unread badges; homeowner-row label + ◈ Company-wide tag + ◆ Client cue all visible. | §1b |
| H1(live) | Homeowner Messages tab present on device | **PASS (live)** | 5 tabs incl. Messages; the originally-missing tab now renders after the route fix. | §1b |
| F1 | Homeowner inbox shows builder channel when siteId set | **FINDING** | Empty inbox on phone-login (siteId null); populated on join-code login. Edge-case robustness gap, non-blocking. | §1b |
| A2.1 | Owner inbox shows site+homeowner+group rows | **PASS** | 4 conversations returned in correct order | A2.1 JSON |
| A2.2 | Homeowner inbox has no kind=site rows | **PASS** | `[]` for site-kind filter on homeowner token | A2.2 JSON |
| A2.3 | GET-or-create homeowner channel | **PASS** | Returns 200 with `kind=homeowner` row | A2.3 JSON |
| A2.4 | Addable-users (no site_id) = crew only | **PASS** | No homeowner role in response | A2.4 check |
| A2.5 | Addable-users (with site_id) includes homeowner | **PASS** | Homeowner present in site-scoped list | A2.5 JSON |
| A2.6 | Create site group (owner) → 201 | **PASS** | 201 Created, owner as admin | A2.6 JSON |
| A2.7 | Create group (supervisor) → 403 | **PASS** | 403 Forbidden returned | A2.7 status |
| A2.8 | Create company-wide group (no site_id) | **PASS** | Created with site_id=null | A2.8 JSON |
| A2.9 | Company-wide msg → events:[] (talk-only) | **PASS** | events array empty, no extraction | A2.9 JSON |
| A2.10 | Site brief: no company-wide event | **PASS** | chat/brief returns 0 CW events for site | A2.10 note |
| A2.11 | DELETE last admin → 409 | **PASS** | 409 Conflict returned | A2.11 status |
| A2.12 | PATCH demote last admin → 409 | **PASS** (re-verified) | Original FAIL was a malformed body (`member_user_id`/`role` vs `member_role:{user_id,role}`). Correct body → 409 `last_admin`; `test_demote_last_admin_conflict` passes. | Bug #1 §5 (amended) |
| A2.13 | Homeowner msg → events:[] (membrane) | **PASS** | events:[] confirmed | A2.13 JSON |
| A2.14 | Homeowner inbox scoped (no site rows) | **PASS** | site-kind filter = [] | A2.14 check |
| A2.15 | Add homeowner to CW group skipped | **PASS** (re-verified) | 200 + homeowner NOT added is the intended silent-skip (matches `test_company_wide_add_members_skips_homeowner`); 403 was the report's own expectation, not the spec. Security invariant holds. | Bug #2 §5 (amended) |
| A2.16 | Two-way: owner sees homeowner channel | **PASS** | kind=homeowner row visible in owner inbox | A2.16 output |
| A1 | Backend test suite 91 tests | **PASS** | 91/91 passed, 5.93s | §3 A1 |

---

## 5. Defects Found

### Bug #1 — ❌ NOT A BUG (malformed request shape in the repro)
**Status:** RESOLVED — false positive. No code change.
**Endpoint:** `PATCH /api/v1/chat/groups/{id}`

**Why it's not a bug:** the repro sent the body `{"member_user_id": "<owner_id>", "role": "member"}`,
but the request schema is `GroupPatchIn{ name?, archived?, member_role: {user_id, role} }`
(see `app/chat/groups_router.py` `GroupPatchIn` / `MemberRoleChange`). The top-level
`member_user_id` / `role` are **unknown fields** — Pydantic ignores them, so `member_role`
is `None`, the handler's role block never runs, and it returns the unchanged group (200).
That is a malformed request producing a no-op, **not** a broken guard.

**Proof the guard works:** `patch_group` (groups_router.py:382–395) raises
`AppError(409, "last_admin", ...)` when demoting an admin with `_admin_count() <= 1`. The test
`tests/test_groups_api.py::test_demote_last_admin_conflict` sends the **correct** body
`{"member_role": {"user_id": owner, "role": "member"}}` and asserts **409 + code `last_admin`** —
and it PASSES (re-run 2026-06-07: 4/4 guard tests green). The real mobile client
(`mobile/src/api/groups.ts:73`) sends `member_role: { user_id, role }`, so the app never hits
the malformed path.

**Optional hardening (not done):** adding `model_config = ConfigDict(extra="forbid")` to
`GroupPatchIn` would turn a typo'd body into an explicit 422 instead of a silent no-op. Marginal
(the only client is correct); left out to avoid an inconsistent convention. Opt-in if desired.

---

### Bug #2 — ❌ NOT A BUG (intended, tested silent-skip)
**Status:** RESOLVED — working as designed. No code change.
**Endpoint:** `POST /api/v1/chat/groups/{id}/members`

**Why it's not a bug:** `add_members` (and `create_group`) deliberately **silently skip**
ineligible users and return the authoritative roster — the same "roster is the truth" pattern
used for foreign-company / unknown user ids. For a company-wide group it skips homeowner-role
users (`if conv.site_id is None and member_user.role == homeowner: continue`). Returning the
new roster (homeowner absent) at 200, rather than 403, is the chosen design — it's the only
defence-in-depth layer behind a UI that already excludes homeowners from a company-wide group's
addable-users (crew-only). The test `tests/test_groups_api.py::test_company_wide_add_members_skips_homeowner`
asserts **exactly 200 with the homeowner not in `members`**, and it PASSES.

**Security:** the invariant holds — the homeowner is **not** added. Changing this to 403 would
break the passing test and diverge from how every other ineligible user is handled. The client
re-renders from the returned roster, so it is not misled (the homeowner simply isn't there).

---

## 6. Known-Issues Confirmation

| # | Known Issue | Reproduced? | Notes |
|---|---|---|---|
| KI-1 | Homeowner Home screen may show raw phone number in Update card (membrane leak, out of scope) | NOT REPRODUCED | Could not fully navigate homeowner Home tab due to simctl tap limitation; the Design tab was active on first screenshot. Marked as not-yet-confirmed for this session. |
| KI-2 | get-or-create race condition on concurrent homeowner channel open | NOT REPRODUCED (known acceptable) | Single-threaded test; race condition requires concurrent requests. Pilot-acceptable per design. |
| KI-3 | Homeowner channel is intentionally PLAIN (digits not stripped) | CONFIRMED ✓ | Homeowner message response: `events: []`, no extraction pipeline invoked. The channel functions as a plain human conversation. Correct behavior per design §6. |

---

## 7. Coverage Gaps

### Gap 1: Simulator UI Interaction Blocked
**`xcrun simctl io booted tap <x> <y>` does not exist in Xcode 26.5 (Build 17F42).** The `simctl io` subcommand only supports `screenshot`, `recordVideo`, `enumerate`, `poll`, and `screenConfig`. No touch/tap injection is available via the CLI.

**Alternative attempts made:**
- AppleScript via `System Events` — timed out (-1712 AppleEvent timeout), likely accessibility permission not granted to the terminal
- `idb` (Facebook's iOS Device Bridge) — not installed
- `xcrun devicectl` — no UI automation subcommands
- Chrome DevTools MCP — only blank page available (no Expo JS debugger connection)

**Tests BLOCKED by this gap:** Live screenshots for O2 (Chat inbox rendering), O4 (New Group button visible in owner session), H2 (green own-bubbles in homeowner Messages tab). All three were verified via code inspection instead.

**What's needed to close:** Either grant accessibility permissions to terminal for AppleScript, install `idb`, or use `xcrun simctl` from a version that supports `tap` (earlier Xcode versions had this).

### Gap 2: Seeding Failure
The `seed_demo.py` script failed with `UniqueViolationError` because users +919800000001/002/003 were pre-existing in the local DB with `role=owner` (created through a different path, incompatible UUIDs with the script's deterministic `uuid5` IDs). Manual fixup was applied via direct SQL. The seed script should be made idempotent by phone number (not UUID) as a follow-up.

### Gap 3: Dashboard Brief Endpoint Path
The task referenced `GET /dashboard/brief?site_id=...` which does not exist (404). The correct endpoint is `GET /chat/brief?site_id=...`. The company-wide extraction isolation was verified via the chat/brief endpoint instead. The dashboard/brief 404 is a documentation gap in the test spec, not a product bug.

### Gap 4: Supervisor + PM Group Participation
The spec allows supervisors and PMs to be added to groups (but not create them). This was verified only at the API level (correct 403 on create). Testing of message-send as a group member (non-admin) and the `can_access` check for added supervisors was covered by the test suite (91 tests pass) but not manually exercised via API calls in this session.

### Gap 5: WebSocket / Real-time
The WS broadcast path (`/chat/ws`) was not tested in this session (requires a WebSocket client). Covered by the test suite (unit-level) but not end-to-end.

### Gap 6: Site-Group Extraction Pipeline
A site-group message should mint a `RawMessage(external_group_id=f"app:{site_id}")` and invoke extraction. The `events: []` in the API response for the site-group (no message was sent to the QA TEST Site Group in this session) is expected (no message = no events). This was tested by `test_group_message_mints_event_to_site` in the test suite (passes).

---

## 8. Screenshots

### Initial Homeowner App State (Daylight theme, Design tab)
This screenshot was captured when the simulator was first observed. It shows the homeowner Daylight app with the Design tab active, confirming the Daylight theme (warm beige background, green icons, no amber/Blueprint tones).

![H1 — Homeowner Daylight app, Design tab active](/tmp/qa_H1_homeowner_tabs.png)

**Evidence for H1:** Tab bar bottom row shows: Home · Photos · Updates · Messages · Design — all 5 tabs present. Design is highlighted in Calm Pine green (`#155c4a`). Floating nav bar (Calm Cockpit) confirmed.

---

### Login / Role Selection Screen
After Expo deep-link reload, the app shows the "Who are you?" role selector. This confirms the app loads correctly and presents the two-path login flow.

![Login / role selection — "Who are you?"](/tmp/qa_login_screen.png)

---

## Appendix: Route Registration (E1 Evidence)

All chat/groups routes registered in Expo Router:
```
/(contractor)/owner/chat.tsx         — Owner Chat inbox
/(contractor)/owner/chat/[id].tsx    — Owner Chat conversation detail
/(homeowner)/messages.tsx            — Homeowner Messages inbox
/(homeowner)/messages/[id].tsx       — Homeowner message/group thread detail
```

Metro process (PID 36013) running on port 8081, no "No route named" warnings observed in available logs. Route file existence confirmed via filesystem check.

---

## Appendix: Full Test Suite Command + Output

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run pytest tests/test_chat_api.py tests/test_chat_access.py \
    tests/test_groups_api.py tests/test_homeowner_channel.py \
    tests/test_groups_model.py -q --tb=short
```

```
........................................................................ [ 79%]
...................                                                      [100%]
91 passed, 24 warnings in 5.93s
```
