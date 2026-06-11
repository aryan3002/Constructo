# Homeowner Finishes Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the homeowner a calm, read-only, room-by-room view of the material finishes going into their home — the homeowner side of the spec two-sided loop — with every cost field firewalled out.

**Architecture:** One read endpoint + one Calm-Cockpit screen. `GET /api/v1/homeowner/finishes` reuses the contractor desk's Spec→Component→Space→Material join but **strips all costing** (`unit_rate`/`wastage_pct`/`line_total` never enter the schema), excludes `rejected` specs, projects `approval_status` to a calm `status`, and respects room-narrowed members (`HomeownerMember.design_space_id`). The mobile app adds a `finishes()` client call, a pushed screen reached from a Home card, rendering rooms as `CalmCard`s with gentle finish lines. Read-only; nothing the homeowner does writes back.

**Tech Stack:** Backend = FastAPI + async SQLAlchemy + Postgres (pytest, ruff line-100); Mobile = Expo/React Native + Expo Router (jest, tsc). Dev DB: `postgresql+asyncpg://constructo:constructo@localhost:5433/constructo`.

**Branch:** `feat/homeowner-finishes`.

**Verification baselines:** backend `uv run ruff check` (whole tree, from `constructo/backend`) + `uv run pytest`; mobile `npm run typecheck && npx jest` (from `constructo/mobile`).

**Design:** approved in-session — read-only finishes, dedicated screen from Home. No money ever crosses to the homeowner.

---

### Task 1: Backend — `GET /api/v1/homeowner/finishes` (the firewalled read)

**Files:**
- Modify: `constructo/backend/app/homeowner/schemas.py` (add the 3 response models) — *read the file first to match its Pydantic style.*
- Modify: `constructo/backend/app/homeowner/router.py` (add the endpoint near the other GET reads, e.g. by `/property`)
- Test: the homeowner test module — find it (`ls constructo/backend/tests | grep -i homeowner`); read a sibling test for the `require_homeowner`/member fixtures + auth helper, and co-locate (or a new `tests/test_homeowner_finishes.py`).

**Contract (the firewall is the point):**
```python
class FinishItem(BaseModel):
    element: str                 # Component.name (e.g. "Floor")
    category: str | None         # Material.category or Spec.label
    brand: str | None
    colour: str | None
    finish: str | None
    qty: Decimal | None
    unit: str | None
    status: str                  # "chosen" (approved) | "deciding" (pending)
    client_final_code: str | None
    # NO unit_rate, NO wastage_pct, NO line_total — never on this schema.

class RoomFinishes(BaseModel):
    room: str                    # Space.name
    items: list[FinishItem]

class FinishesOut(BaseModel):
    rooms: list[RoomFinishes]
```

Endpoint behaviour:
- Auth/scope: depend on the existing `require_homeowner` + `resolve_site` (read `GET /property` in router.py to copy the exact dependency wiring + how it gets the member + site).
- Query: select `Spec`, `Component.name`, `Space.name`, `Space.id`, `Material` — `join Component on Spec.component_id`, `join Space on Component.space_id`, `outerjoin Material on Spec.material_id`; `where Spec.site_id == <resolved site> AND Spec.approval_status != SpecApprovalStatus.rejected`; order by `Space.name`, `Spec.created_at`.
- **Room narrowing:** if the member is room-scoped (`HomeownerMember.design_space_id is not None`), add `AND Space.id == member.design_space_id`. (Read `app/homeowner/authority.py` / how `/design/selections` reads the member's `design_space_id` and mirror it — the same narrowing the design endpoints already enforce.)
- Status: `approved → "chosen"`, `pending → "deciding"` (rejected already filtered out).
- Group rows by `Space.name` preserving order → `RoomFinishes` list → `FinishesOut`.

- [ ] **Step 1: Write the failing tests** (`tests/test_homeowner_finishes.py`). Read a sibling homeowner test first for the exact fixtures (member creation, `require_homeowner` auth header, `resolve_site`). Cover:
  1. `test_finishes_grouped_by_room_no_cost_fields`: seed a site with a Space "Living Room" + Component "Floor" + Material(brand="Kajaria", colour="Ivory Beige", finish="Matt", category="Tile") + an **approved** Spec(qty=10, unit="Sq Ft", unit_rate=120, client_final_code="FL-A3"). GET `/api/v1/homeowner/finishes?site_id=…` as an active homeowner member. Assert 200; `body["rooms"][0]["room"]=="Living Room"`; the item has `element=="Floor"`, `brand=="Kajaria"`, `status=="chosen"`, `client_final_code=="FL-A3"`; and assert the serialized JSON contains **no** `unit_rate`/`wastage_pct`/`line_total` keys.
  2. `test_pending_is_deciding_and_rejected_hidden`: one `pending` spec → `status=="deciding"`; one `rejected` spec → absent from the response.
  3. `test_room_narrowed_member_sees_only_their_room`: a member with `design_space_id = <kitchen space>` sees only kitchen finishes, not living-room ones.
  4. `test_non_member_forbidden`: a user who isn't a homeowner member of the site gets 401/403 (whatever `require_homeowner` returns).

- [ ] **Step 2: Run them, confirm they FAIL** (404 — endpoint missing).
Run: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_homeowner_finishes.py -v`

- [ ] **Step 3: Implement** the 3 schemas + the endpoint per the contract above.

- [ ] **Step 4: Run them, confirm they PASS**; then the homeowner regression: `uv run pytest tests/ -k homeowner -q`.

- [ ] **Step 5: Whole-tree ruff + commit**
```bash
cd constructo/backend && uv run ruff check
git add app/homeowner/schemas.py app/homeowner/router.py tests/test_homeowner_finishes.py
git commit -m "feat(homeowner): GET /homeowner/finishes — room-grouped, cost-firewalled, room-narrowed"
```

---

### Task 2: Mobile — API client `finishes()` + types

**Files:**
- Modify: `constructo/mobile/src/api/types.ts` (add `FinishItem`, `RoomFinishes`, `FinishesResponse`)
- Modify: `constructo/mobile/src/api/client.ts` (add `finishes(siteId?)` mirroring `property(siteId?)`)
- Test: the api client test if one exists (`ls constructo/mobile/src/api/__tests__ 2>/dev/null` or grep); else a light jest test for the method shape.

- [ ] **Step 1:** Read `client.ts` `property(siteId?)` (≈line 139) + the `Property`/`Space` types in `types.ts` (≈225–234) to match the exact pattern (site_id query param, return typing).
- [ ] **Step 2:** Add TS types mirroring the backend schema (snake_case; `qty` arrives as string|null — Decimal serializes to string):
```ts
export interface FinishItem {
  element: string
  category: string | null
  brand: string | null
  colour: string | null
  finish: string | null
  qty: string | null
  unit: string | null
  status: 'chosen' | 'deciding'
  client_final_code: string | null
}
export interface RoomFinishes { room: string; items: FinishItem[] }
export interface FinishesResponse { rooms: RoomFinishes[] }
```
- [ ] **Step 3:** Add `finishes(siteId?: string): Promise<FinishesResponse>` calling `GET /api/v1/homeowner/finishes` with the `site_id` param (copy `property()` exactly).
- [ ] **Step 4:** `cd constructo/mobile && npm run typecheck` — clean. Commit:
```bash
git add constructo/mobile/src/api/client.ts constructo/mobile/src/api/types.ts
git commit -m "feat(homeowner): mobile finishes() api client + types"
```

---

### Task 3: Mobile — the calm Finishes screen + Home entry card

**Files:**
- Create: `constructo/mobile/app/(homeowner)/finishes.tsx`
- Modify: `constructo/mobile/app/(homeowner)/home.tsx` (add a card/link that pushes to `/finishes`)
- Reuse: `src/ui/CalmCard.tsx`, `StatusPill.tsx`, `Screen.tsx`, the Daylight theme tokens, `src/api/client.ts` `finishes()`.
- Test: `constructo/mobile/app/(homeowner)/__tests__/finishes.test.tsx` (or wherever homeowner screen tests live — match an existing one, e.g. the `home`/`updates` screen test).

- [ ] **Step 1:** Read an existing homeowner screen (`updates.tsx` or `photos.tsx`) + its test to match the data-fetch pattern (how they call the client, loading/empty/error states, the `Screen` wrapper, the Daylight theme, Devanagari-first copy), and how Home links to pushed screens (Expo Router `router.push`).
- [ ] **Step 2:** Build `finishes.tsx`:
  - Header (Eczar display): "Your home, room by room" (+ a Hindi-first label consistent with the app's i18n approach).
  - Fetch `finishes(siteId)`; render each `RoomFinishes` as a `CalmCard` titled with the room; inside, each `FinishItem` as a gentle line: **element** (bold-ish) + `brand · colour · finish` (muted) + `qty unit`, with a small status chip — `chosen → "✓ Chosen"` (sage/ok), `deciding → "Being decided"` (calm warn/neutral). **Never** render a price.
  - States: calm loading, a positive empty state ("Finishes will appear here as they're chosen for your home"), and an error state — match the app's existing patterns.
- [ ] **Step 3:** Add a Home entry: a `CalmCard`/row on `home.tsx` ("Your finishes" / Devanagari label) that `router.push('/(homeowner)/finishes')` (match how Home links to other pushed screens).
- [ ] **Step 4:** Test (jest + RNTL): mock `finishes()` to return 1 room with 1 item; assert the room title + element + brand render and **no price text** appears; assert the empty state renders for `{rooms: []}`.
- [ ] **Step 5:** `cd constructo/mobile && npm run typecheck && npx jest <finishes test>` — green. Commit:
```bash
git add "constructo/mobile/app/(homeowner)/finishes.tsx" "constructo/mobile/app/(homeowner)/home.tsx" <test file>
git commit -m "feat(homeowner): calm room-by-room Finishes screen + Home entry"
```

---

### Task 4: Verify the slice + open the PR

- [ ] **Step 1:** Backend CI: `cd constructo/backend && uv run ruff check && DATABASE_URL=…:5433/constructo uv run pytest -q` — green.
- [ ] **Step 2:** Mobile CI: `cd constructo/mobile && npm run typecheck && npx jest` — green.
- [ ] **Step 3:** Sanity-verify the endpoint against the real local DB: as an active homeowner member of the CivilArch Tripathi site, `GET /homeowner/finishes` returns the rooms with **no cost fields** (the orchestrator will seed a homeowner member + curl it). If the homeowner app can be run in the simulator/Expo, screenshot the calm screen; otherwise rely on the jest render test.
- [ ] **Step 4:** Push + PR "feat(homeowner): read-only room-by-room finishes (Calm Cockpit)". Body: the firewall (no cost fields), room-narrowing, the calm screen. Watch CI green, merge.

---

## Out of scope (deferred, by design)
- Homeowner **confirming** a final selection (write to `client_final_code`) — v1 is read-only.
- Material **photos/swatches** — no image field yet; text-only v1.
- **Quiet-period / notification** wiring on spec changes — show current state only.
- Web homeowner surface — mobile is where the homeowner lives.

## Self-review
- Coverage: firewall (T1 asserts no cost keys), room-narrowing (T1.3), status projection + rejected-hidden (T1.2), the calm screen + Home entry (T3). Matches the approved design.
- Type consistency: `status` is `'chosen' | 'deciding'` on both backend projection and TS type; `qty` is string|null on the wire (Decimal→str).
- The endpoint deliberately reuses the desk join but never imports/returns `costing` — the firewall is structural, not cosmetic.
