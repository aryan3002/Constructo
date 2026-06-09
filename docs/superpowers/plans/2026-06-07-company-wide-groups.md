# Company-Wide Groups — Implementation Plan (Doc 18, Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner create **company-wide groups** — named talk-only rooms not tied to any site (e.g. "All supervisors", "Office + accounts") — by lifting the Phase-2 `site_id`-required rules and adding a "Company-wide" option + label on mobile.

**Architecture:** Almost everything already exists. The schema permits `conversations.site_id = NULL` for `group` rows (the partial unique index + CHECK were built for it); the send path is already talk-only when `target_site_id is None` (no `RawMessage`, no extraction); `can_access` gates groups purely by membership + a company-id guard; the inbox `_group_rows` already returns group rows by membership with `site_name=None`. Phase 4 only: (1) make `GroupCreateIn.site_id` optional and skip the site-visibility check for `site_id=None`; (2) make `addable-users` accept no `site_id` → return **crew only** (homeowners excluded — company-wide is cross-site, founder decision); (3) mobile: a "Company-wide" choice in the New-group sheet, null-site handling in the manage sheet, and a "Company-wide" tag on the inbox row.

**Tech Stack:** FastAPI + SQLAlchemy async (Python 3.12, `uv`); React Native + Expo Router + TanStack Query + TypeScript (owner app = Blueprint). pytest / jest. **No migration.**

**Locked decisions (founder 2026-06-07):**
- **Crew-only** — company-wide groups exclude homeowners (eligibility = all non-homeowner company users). Homeowners are per-site and membrane-curated; a cross-site room would expose context they have no relationship to.
- **Owner-create-only** (unchanged from Phase 2; no co-owner role). PMs participate via per-group admin delegation.
- **Talk-only** — a company-wide group has no site, so messages run no capture/extraction (already enforced by the existing `target_site_id is None` guard).

---

## Scope & Non-Goals

**In scope:** company-wide group creation (`site_id=null`); crew-only company-wide eligibility; the New-group "Company-wide" option; the manage sheet working for a site-less group; a "Company-wide" inbox label.

**Explicitly deferred / out of scope:**
- **Per-message "file this to site X"** for company-wide groups (talk-only stays talk-only).
- **Homeowners in company-wide groups** (decided out).
- **Company-wide as a homeowner-app surface** (homeowners can't be members, so it never appears in her Messages).
- A dedicated inbox *section/grouping* for company-wide vs site groups — they just sort by recency with a "Company-wide" tag (doc 18 §10.4 mentions "inbox grouping" as nice-to-have; a tag is sufficient and simpler).

---

## File Structure

**Backend (`constructo/backend/`):**
- Modify `app/chat/groups_router.py` — `GroupCreateIn.site_id` optional; `create_group` company-wide path; `addable_users` optional `site_id` (crew-only when absent).
- Test: `tests/test_groups_api.py` (additions).

**Mobile (`constructo/mobile/`):**
- Modify `src/api/groups.ts` — `create` body `site_id: string | null`; `addableUsers(siteId?: string, groupId?)`.
- Modify `app/(contractor)/owner/_group_sheets.tsx` — `NewGroupSheet` "Company-wide" choice; `ManageGroupSheet` null-site add-members.
- Modify `app/(contractor)/owner/_chat_components.tsx` — "Company-wide" tag on a `kind==='group'` row with `site_id == null`.
- Test: `src/api/groups.test.ts` (shape) if a pure change warrants it; otherwise covered by typecheck.

---

## PR Sequencing (each branch → PR → merge ONLY when CI all-green)

- **PR 1 — Backend: company-wide create + eligibility** (Tasks 1–2).
- **PR 2 — Mobile: New-group "Company-wide" + manage + inbox label** (Tasks 3–5).

> **Working agreement (memory / vault doc 16 §4):** local gate before each push — backend `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check . && DATABASE_URL=... uv run pytest` (5 storage-env failures expected); mobile `cd constructo/mobile && npm run typecheck && npm test`. Feature branch → PR → `gh pr merge N --merge --delete-branch` only when CI green. **Never commit to main.** Explicit `git add <paths>` (never `-A`; never stage `app/(homeowner)/updates.tsx`, `tmp/`, `.env.bak`, `docs/`). Invoke `constructo-design-system` (Blueprint) before each UI task (Tasks 3–5). **No migration.**

---

## Task 1: Backend — optional `site_id` on create

**Files:**
- Modify: `constructo/backend/app/chat/groups_router.py`
- Test: `constructo/backend/tests/test_groups_api.py`

- [ ] **Step 1: Make `GroupCreateIn.site_id` optional**

```python
class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    site_id: UUID | None = None   # None = company-wide (talk-only, crew-only). Phase 4.
    member_user_ids: list[UUID] = Field(default_factory=list)
```

- [ ] **Step 2: Skip the site-visibility check for company-wide in `create_group`**

Replace the unconditional visibility check:
```python
    visible = await effective_visible_site_ids(session, owner)
    if body.site_id not in visible:
        raise AppError(403, "forbidden", "Site not visible to you")
```
with:
```python
    if body.site_id is not None:
        visible = await effective_visible_site_ids(session, owner)
        if body.site_id not in visible:
            raise AppError(403, "forbidden", "Site not visible to you")
    # body.site_id is None => company-wide group (no site, talk-only).
```
The `Conversation(..., site_id=body.site_id, ...)` line already passes `None` through correctly (the column is nullable; the CHECK permits a `group` row with null `site_id`). No other change to `create_group`.

- [ ] **Step 3: Tests** — add to `tests/test_groups_api.py`

```python
async def test_owner_creates_company_wide_group(client, factory, world):
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post(
        "/api/v1/chat/groups",
        json={"name": "All supervisors", "member_user_ids": [str(sup.id)]},  # no site_id
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    g = resp.json()
    assert g["site_id"] is None
    roles = {m["user_id"]: m["role"] for m in g["members"]}
    assert roles[str(owner.id)] == "admin"
    assert roles[str(sup.id)] == "member"


async def test_company_wide_group_appears_in_owner_inbox(client, factory, world):
    company, owner, site = world
    gid = (await client.post("/api/v1/chat/groups", json={"name": "Office", "member_user_ids": []}, headers=auth(owner))).json()["id"]
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    row = next(r for r in inbox.json() if r["id"] == gid)
    assert row["kind"] == "group"
    assert row["site_id"] is None


async def test_company_wide_group_message_is_talk_only(client, db_session, factory, world):
    from app.models.raw_message import RawMessageModel
    from sqlalchemy import select, func
    company, owner, site = world
    gid = (await client.post("/api/v1/chat/groups", json={"name": "Office", "member_user_ids": []}, headers=auth(owner))).json()["id"]
    before = await db_session.scalar(select(func.count()).select_from(RawMessageModel))
    await client.post("/api/v1/chat/messages", json={"conversation_id": gid, "client_msg_id": str(__import__('uuid').uuid4()), "body": "team meeting at 5"}, headers=auth(owner))
    after = await db_session.scalar(select(func.count()).select_from(RawMessageModel))
    assert after == before   # no RawMessage minted for a site-less group


async def test_non_owner_cannot_create_company_wide_group(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm)
    resp = await client.post("/api/v1/chat/groups", json={"name": "X", "member_user_ids": []}, headers=auth(pm))
    assert resp.status_code == 403   # require_role(owner) unchanged
```
Run `pytest tests/test_groups_api.py -v` — green (existing + 4 new). (Commit with Task 2 as PR 1.)

---

## Task 2: Backend — `addable-users` without a site (crew-only)

**Files:**
- Modify: `constructo/backend/app/chat/groups_router.py`
- Test: `constructo/backend/tests/test_groups_api.py`

- [ ] **Step 1: Make `site_id` optional + skip homeowners when absent**

Change the signature:
```python
@router.get("/groups/addable-users", response_model=list[AddableUserOut])
async def addable_users(
    site_id: UUID | None = Query(None),
    group_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AddableUserOut]:
```
The gate is unchanged (`if group_id is not None: require_group_admin; elif user.role is not owner: 403`) — it doesn't depend on `site_id`. The crew query is unchanged. Guard the **homeowner** sub-query so it only runs for a site group:
```python
    homeowners: list[User] = []
    if site_id is not None:
        homeowners = (
            await session.execute(
                select(User)
                .join(HomeownerMember, HomeownerMember.user_id == User.id)
                .where(
                    HomeownerMember.site_id == site_id,
                    HomeownerMember.user_id.is_not(None),
                    User.role == UserRole.homeowner,
                    User.company_id == user.company_id,
                )
                .distinct()
            )
        ).scalars().all()
```
Everything else (the `already_member` set, the dedup loop over `[*crew, *homeowners]`) is unchanged. For a company-wide picker (`site_id=None`), `homeowners` stays empty → **crew-only**.
> Update the docstring to note: "Without `site_id` (company-wide group), only company crew are returned — homeowners are excluded (company-wide groups are crew-only)."

- [ ] **Step 2: Tests** — add to `tests/test_groups_api.py`

```python
async def test_addable_users_company_wide_is_crew_only(client, db_session, factory, world):
    from app.models import MemberStatus
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active, join_code="CW1"))
    await db_session.flush()
    # No site_id => company-wide eligibility
    resp = await client.get("/api/v1/chat/groups/addable-users", headers=auth(owner))
    assert resp.status_code == 200
    ids = {u["user_id"] for u in resp.json()}
    assert str(sup.id) in ids          # crew included
    assert str(ho.id) not in ids       # homeowner excluded


async def test_addable_users_site_group_still_includes_homeowner(client, db_session, factory, world):
    from app.models import MemberStatus
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active, join_code="CW2"))
    await db_session.flush()
    resp = await client.get(f"/api/v1/chat/groups/addable-users?site_id={site.id}", headers=auth(owner))
    ids = {u["user_id"] for u in resp.json()}
    assert str(ho.id) in ids           # site group still includes the site's homeowner
```
Run the full `tests/test_groups_api.py` — all green (the existing site-group addable-users tests must still pass; the homeowner-inclusion path is unchanged for `site_id` given).

- [ ] **Step 3: Local gate + PR 1**

```bash
cd constructo/backend
DATABASE_URL=...:5433/constructo uv run ruff check . && DATABASE_URL=...:5433/constructo uv run pytest
cd /Users/aryantripathi/Developer/contructionAI
git checkout main && git pull --ff-only && git checkout -b feat/company-wide-groups-api
git add constructo/backend/app/chat/groups_router.py constructo/backend/tests/test_groups_api.py
git commit -m "feat(chat): company-wide groups — optional site_id on create + crew-only eligibility (doc 18 Phase 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Push, PR "PR 1/2", CI green, merge.

---

## Task 3: Mobile — groups API optional site

**Files:**
- Modify: `constructo/mobile/src/api/groups.ts`

- [ ] **Step 1: `create` accepts a null site; `addableUsers` accepts no site**

```ts
  /** Create a group: a `site_id` scopes capture to that site; `null` = company-wide (talk-only, crew-only). Caller becomes admin. */
  create(body: { name: string; site_id: string | null; member_user_ids: string[] }): Promise<Group> {
    return request<Group>('/api/v1/chat/groups', { method: 'POST', body: JSON.stringify(body) })
  },
  ...
  /** Users addable to a group. Omit `siteId` for a company-wide group (crew only). */
  addableUsers(siteId?: string, groupId?: string): Promise<AddableUser[]> {
    const q = new URLSearchParams()
    if (siteId) q.set('site_id', siteId)
    if (groupId) q.set('group_id', groupId)
    const qs = q.toString()
    return request<AddableUser[]>(`/api/v1/chat/groups/addable-users${qs ? `?${qs}` : ''}`)
  },
```
> Sending `site_id: null` in the create body is accepted by the backend (`GroupCreateIn.site_id: UUID | None`). `addableUsers()` with no args is valid for the company-wide pre-create picker. (Commit with Tasks 4–5 as PR 2.)

---

## Task 4: Mobile — New-group "Company-wide" choice + manage null-site

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/_group_sheets.tsx`

> **Pre-task:** invoke `constructo-design-system` (Blueprint). ≥48px, amber-fill-only, status color+shape, bilingual, never emoji.

- [ ] **Step 1: `NewGroupSheet` — add a "Company-wide (no site)" option to the site picker**

Current state: `const [siteId, setSiteId] = useState<string | null>(null)`; the picker renders `sitesQ = owner.sites()` rows with `on = siteId === s.id`; `addableQ` is `enabled: visible && !!siteId` and queries `groupsApi.addableUsers(siteId!)`; `create` sends `site_id: siteId!`; `canCreate = !!name.trim() && !!siteId`.

Introduce a `companyWide` boolean and a `scopeChosen` derived flag:
```tsx
const [siteId, setSiteId] = useState<string | null>(null)
const [companyWide, setCompanyWide] = useState(false)
const scopeChosen = companyWide || !!siteId
```
- In the site picker list, render a **"Company-wide (no site)"** row at the top (a selectable row like the site rows): tapping it sets `companyWide = true`, `siteId = null`; tapping a real site sets `companyWide = false`, `siteId = s.id`. The selected row (`companyWide` OR `siteId === s.id`) gets the existing amber-selected styling. Add a bilingual `companyWide` STR (EN "Company-wide (no site)" / HI e.g. "कंपनी-व्यापी (कोई साइट नहीं)").
- `addableQ`:
  ```tsx
  queryKey: ['groups', 'addable', companyWide ? 'company' : siteId],
  queryFn: () => groupsApi.addableUsers(companyWide ? undefined : siteId ?? undefined),
  enabled: visible && scopeChosen,
  ```
- The member-section guard `{siteId ? (...) : null}` → `{scopeChosen ? (...) : null}`.
- `create`:
  ```tsx
  groupsApi.create({ name: name.trim(), site_id: companyWide ? null : siteId, member_user_ids: [...selected] })
  ```
  and in `onSuccess`, the nav params: `siteId: group.site_id ?? ''` (already handles null), `title: group.name`, `kind: 'group'`.
- `canCreate = !!name.trim() && scopeChosen && !create.isPending`.
- When the user switches scope (site ↔ company-wide), reset `selected` to avoid carrying members from a different eligibility set.

- [ ] **Step 2: `ManageGroupSheet` — add members on a site-less group**

Current: `ManageGroupSheet({ ..., siteId: string })`; `addableQ` is `enabled: visible && !!siteId && !!groupId`, queries `groupsApi.addableUsers(siteId, groupId)`. For a company-wide group the `siteId` param is `''` → add-members is disabled.

Fix:
- Type the prop `siteId: string` but treat `''` as "no site". Compute `const siteParam = siteId || undefined`.
- `addableQ`:
  ```tsx
  queryKey: ['groups', 'addable', siteId || 'company', groupId],
  queryFn: () => groupsApi.addableUsers(siteParam, groupId),
  enabled: visible && !!groupId,
  ```
  (drop the `!!siteId` requirement — a company-wide group still has eligible crew). Update the `invalidateQueries` keys to match (`['groups','addable', siteId || 'company', groupId]`).
- Everything else (rename, remove, role change, archive, last-admin error) is unchanged.

- [ ] **Step 3:** `npm run typecheck`. (Commit with Task 5.)

---

## Task 5: Mobile — "Company-wide" tag on the inbox row

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/_chat_components.tsx`

> **Pre-task:** invoke `constructo-design-system` (Blueprint).

- [ ] **Step 1:** In `ConversationRow`, for a `conversation.kind === 'group'` row, show a small tag/subtitle: **"Company-wide"** when `conversation.site_id == null`, else the existing group treatment (the inbox doesn't carry the site name for groups, so a site group keeps its current label). Pair the tag with a shape (e.g. a small glyph) + a neutral/`--info` color (not color-alone), consistent with the homeowner-row cue added in Phase 3. Add a bilingual `companyWide` STR (EN "Company-wide" / HI "कंपनी-व्यापी"). Site and homeowner rows are unchanged.

- [ ] **Step 2:** `npm run typecheck && npm test` (35/36 green). Commit PR 2:
```bash
git checkout main && git pull --ff-only && git checkout -b feat/company-wide-groups-mobile
git add constructo/mobile/src/api/groups.ts \
        constructo/mobile/app/\(contractor\)/owner/_group_sheets.tsx \
        constructo/mobile/app/\(contractor\)/owner/_chat_components.tsx
git commit -m "feat(chat): company-wide groups UI — New-group company-wide option + manage + inbox tag (doc 18 Phase 4 complete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Push, PR "PR 2/2", CI green, merge.

---

## Self-Review (against doc 18 §10.4 + §12)

- §10.4 "company-wide talk-only groups: `site_id=null` path + company-wide member eligibility + inbox grouping" → Task 1 (`site_id=null` create), Task 2 (company-wide eligibility = crew-only), Task 5 (inbox tag in lieu of a full grouping — noted as a deliberate simplification). ✓
- §5 "company-wide group is talk-only (no extraction)" → already enforced by the `target_site_id is None` send guard; Task 1 Step 3 test (`..._message_is_talk_only`) proves it. ✓
- §12 "Vendors in chat (stay on the confirm-loop)" → vendors aren't Users, naturally excluded from eligibility. ✓
- Founder decision crew-only → Task 2 (homeowners excluded when `site_id` absent) + its test. ✓
- RBAC unchanged (owner-create-only) → `require_role(owner)` untouched; `..._non_owner_cannot_create_company_wide_group` test. ✓
- No migration → confirmed (schema already supports null `site_id` for groups). ✓

**Placeholder scan:** backend diffs are complete + runnable. Mobile steps specify exact state/query/param changes against the real `_group_sheets.tsx`/`groups.ts` structure (the `companyWide` flag, `scopeChosen`, `siteParam`), and the inbox tag is a bounded addition. No blanks.

**Type consistency:** `groupsApi.create` body `site_id: string | null` ↔ backend `GroupCreateIn.site_id: UUID | None`; `groupsApi.addableUsers(siteId?, groupId?)` ↔ backend `site_id: UUID | None = Query(None)`; `ConversationSummary.site_id: string | null` already exists and signals company-wide on the inbox row.

---

## Founder to-dos

- **No migration this phase.**
- **Device-test:** as owner, New group → pick **"Company-wide (no site)"** → confirm the member list shows crew only (no homeowner) → create → confirm the inbox row shows a **"Company-wide"** tag → send a message → confirm it does NOT book any site event → open Manage → add another crew member.
- **Confirm Hindi copy** for "Company-wide (no site)" / "Company-wide".

---

## Phase 4 closes doc 18 (§10)

With Phase 4, the entire doc 18 build order is shipped: 1 owner Chat · 2 site groups · 3 homeowner Messages · 4 company-wide groups. The multi-role chat & groups subsystem is complete. Remaining doc-17/doc-18 deferrals (per-message "file to site" for company-wide groups; migrating "Ask the Builder" requests into the live channel; push-to-group-members; the get-or-create GA race; the membrane leak in the published-updates flow) are independent follow-ups, not part of this subsystem.
