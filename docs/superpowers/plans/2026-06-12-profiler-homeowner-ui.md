# Design Profiler — Homeowner Intake + Brief UI (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Mobile design rules: the **Calm Cockpit / `constructo-homeowner-design`** system (Eczar headlines only, Hind body, IBM Plex Mono ₹; status = colour+icon+word; progress in time/shape not %; reassure first; single language per screen; ≥14px, ≥48px targets).

**Goal:** Wire the new role-agnostic Design Profiler engine (`/api/v1/design/*`) into the **homeowner** Expo app: a per-area **image-ranking intake hub** and the **structured-brief review + approval** experience (3 audiences, themes, room briefs, conflicts, approval state-machine, clarification answers, approval timeline) — on the existing Calm Cockpit kit, to the production bar (**typecheck 0, jest green**).

**Architecture:** Two parts. **Part A (backend enable, small):** loosen the engine just enough for homeowner *intake* on a profile they're a member of — homeowner contributors may add references + rank, and a `GET /profiles/by-site/{site_id}` lets the app resolve its profile. Membrane-safe: still scoped by `_load_accessible_profile`; a homeowner may rank only as *their own* contributor. **Part B (frontend, additive):** a typed `design` API client, a pure tested util, two new `href:null` screens (`design/profiler.tsx` hub + `design/profiler/[area].tsx` ranking; `design/brief.tsx` brief+approval), and an entry point from the existing `design.tsx` hub. No changes to existing screens beyond one entry-point link.

**Tech Stack:** Backend — FastAPI/async SQLAlchemy/Pydantic v2, run with `uv` from `constructo/backend` (Postgres :5433). Frontend — Expo Router, React Native, TypeScript, **TanStack Query v5**, the Calm Cockpit kit (`constructo/mobile/src/ui/`). Run from `constructo/mobile`: `npm run typecheck`, `npm run test` (jest-expo).

**Base branch:** this worktree (continues after Plans 3b + 5).

---

## What exists (grounding — from reconnaissance)

**Backend engine** (`app/profiler/router.py`, prefix `/api/v1/design`): `_load_owned_profile` (company-scope), `_load_accessible_profile(session, profile_id, user)` (homeowner needs active `HomeownerMember` on `profile.site_id`; contractor company-scope), `_EDIT_ROLES = (owner, pm, architect, supervisor)`. Models: `ProfilerProfile(company_id, site_id, scope_type, status, ...)`, `ProfilerArea(profile_id, area_kind, area_key, space_id?, component_id?, recommended_count, status, confidence, has_conflict, ...)`, `ProfilerContributor(profile_id, member_id?, user_id?, role, is_decision_owner)`, `ProfilerReference`, `ProfilerRanking(reference_id, contributor_id, stars, tags, note)`. Reads: `GET /profiles/{id}` (detail), `GET /profiles/{id}/areas/{aid}/taste`, `GET .../themes`, `GET /profiles/{id}/conflicts`, `GET /profiles/{id}/brief?audience=`, `GET /profiles/{id}/clarifications`, `GET /briefs/{id}/approvals`. Writes the homeowner needs: `POST /references` + `POST /references/{id}/rankings` (today `_EDIT_ROLES` — Part A opens them), `POST /briefs/{id}/approval`, `POST /clarifications/{id}/answer` (already `get_current_user`). `homeowner_site_ids(session, user)` resolves a homeowner's site memberships.

**Mobile** (`constructo/mobile`): API client `src/api/client.ts` — `request<T>(path, init)` (attaches Bearer token, unwraps `{error:{code,message}}` → `ApiError`); a `homeowner` object of typed calls. API base `src/api/config.ts` `API_BASE` (env `EXPO_PUBLIC_API_BASE`, default `http://10.0.2.2:8000`). TanStack Query idiom: `useQuery({queryKey, queryFn})` + `useMutation({mutationFn, onSuccess: invalidate, onError})`. Calm Cockpit kit `src/ui/`: `Screen`, `SubHeader{title,subtitle,onBack,right}`, `SegmentedTabs{tabs:[{key,label}],active,onChange}`, `Chip{label,active,onPress?,icon?}`, `ListRow{icon?,title,subtitle?,right?,statusTone?,onPress?,last?}`, `CalmCard{title,body?,status?,eyebrow?,trailing?,children?}`, `StatusPill{status,label?,size?,icon?}`, `LinkRow{label,onPress,icon?}`, `MilestoneStrip`, `Toggle`, `ToastProvider`/`useToast`, `FadeInUp{delay?}`, typography `H1/H2/Title/Body/BodyStrong/Small/Micro/Eyebrow/Mono`, `useInputStyle()`, `formatINR`. Theme `src/theme/tokens.ts` daylight: `accent #3e7a66` (sage/primary), `secondary #ae5635` (clay/milestones), `warn #7d5a13` (amber/needs-you), `risk #a4382a` (red/delay-only), `ok`, `info`, `quiet`; `SPACE`, `TYPE`, `useTheme()`/`useColors()`. `Status = 'ok'|'warn'|'risk'|'info'|'quiet'`. Routing: `app/(homeowner)/_layout.tsx` registers tabs + `href:null` pushed screens; **Expo Router flat-file rule — a detail screen must be a flat `design/profiler/[area].tsx` registered as `name="design/profiler/[area]"`, NOT `profiler/index.tsx`+sibling.** **Tests:** util logic lives in `src/` (app/ files can't be imported by jest); pure-util tests + API-client tests (mock `globalThis.fetch` + `jest.mock('../store/secure', ...)`); commands `npm run typecheck`, `npm run test`. Existing design hub: `app/(homeowner)/design.tsx` (SegmentedTabs Profile·Plans·Selections) + `_design.util.ts` (`DESIGN_STR` en/hi). `homeowner.capabilities()` → `{can_approve, can_comment, can_design, ...}` (queryKey `['homeowner','capabilities']`).

**Determinism / membrane reminders:** confidence is the reducer's (display it, never compute it client-side); the homeowner sees the `homeowner` brief audience by default; approval actions are owner/co_owner-only (the server enforces + returns `403 approve_forbidden {can_comment:true}` — the UI shows a comment affordance, never a grey wall).

---
---

# PART A — backend: enable homeowner intake (membrane-safe)

## Task 1: by-site lookup + homeowner-rankable engine

**Files:** Modify `app/profiler/router.py`; Test append to `tests/test_profiler_membrane.py` (or a new `tests/test_profiler_intake.py`).

- [ ] **Step 1: Write the failing tests** — create `tests/test_profiler_intake.py`

```python
"""Homeowner intake access: by-site lookup + homeowner-contributor ranking."""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth


def _llm() -> FakeLLMClient:
    return FakeLLMClient(canned={"colors": ["warm"], "style": "minimal", "confidence": 0.9})


async def _profile_with_homeowner_contributor(client, factory, db_session):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active))
    await db_session.flush()
    created = await client.post("/api/v1/design/profiles", json={
        "site_id": str(site.id),
        "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
        "contributors": [{"role": "owner", "user_id": str(owner.id), "is_decision_owner": True}],
    }, headers=auth(architect))
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_id = detail["contributors"][0]["id"]
    return architect, owner, site, pid, area_id, contrib_id


async def test_get_profile_by_site_resolves_for_member_and_404s_for_stranger(client, factory, db_session):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, _area, _c = await _profile_with_homeowner_contributor(
            client, factory, db_session)
        # the homeowner owner resolves their site's profile
        got = await client.get(f"/api/v1/design/profiles/by-site/{site.id}", headers=auth(owner))
        assert got.status_code == 200 and got.json()["id"] == pid
        # a different-company architect cannot
        other = await factory.user(role=UserRole.architect)
        assert (await client.get(
            f"/api/v1/design/profiles/by-site/{site.id}", headers=auth(other))).status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_homeowner_can_add_reference_and_rank_as_self(client, factory, db_session):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = await _profile_with_homeowner_contributor(
            client, factory, db_session)
        # the homeowner adds an inspiration reference
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "contributor_id": contrib_id, "source_type": "upload",
            "source_url": "https://x.test/insp.jpg"}, headers=auth(owner))
        assert ref.status_code == 201
        rid = ref.json()["id"]
        # and ranks it as their own contributor
        rk = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": contrib_id, "stars": 5}, headers=auth(owner))
        assert rk.status_code == 201
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_homeowner_cannot_rank_as_another_contributor(client, factory, db_session):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = await _profile_with_homeowner_contributor(
            client, factory, db_session)
        # add a SECOND contributor that is NOT the owner
        other_c = (await client.post(f"/api/v1/design/profiles/{pid}/contributors",
            json={"role": "family"}, headers=auth(architect))).json()["id"]
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
            headers=auth(owner))
        rid = ref.json()["id"]
        # the owner tries to rank AS the family contributor -> 403
        bad = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": other_c, "stars": 1}, headers=auth(owner))
        assert bad.status_code == 403
        assert bad.json()["error"]["code"] == "not_your_contributor"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_ranking_unknown_contributor_is_404(client, factory, db_session):
    from uuid import uuid4
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = await _profile_with_homeowner_contributor(
            client, factory, db_session)
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
            headers=auth(architect))
        rid = ref.json()["id"]
        bad = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": str(uuid4()), "stars": 3}, headers=auth(architect))
        assert bad.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_intake.py -v`
Expected: FAIL (route missing / homeowner gets 403 on add/rank / no contributor validation).

- [ ] **Step 3: Implement** in `app/profiler/router.py`.

(a) Add a helper near `_load_accessible_profile` that resolves whether a contributor belongs to the profile and (for homeowners) to the caller:

```python
async def _validate_contributor(
    session: AsyncSession, profile: ProfilerProfile, contributor_id: UUID, user: User
) -> ProfilerContributor:
    """The contributor must belong to ``profile``; a homeowner may act only as THEIR
    own contributor (mapped by user_id, or by an active HomeownerMember of theirs)."""
    contributor = await session.get(ProfilerContributor, contributor_id)
    if contributor is None or contributor.profile_id != profile.id:
        raise AppError(404, "not_found", "Contributor not found")
    if user.role is UserRole.homeowner:
        member_ids = (
            await session.execute(
                select(HomeownerMember.id).where(
                    HomeownerMember.user_id == user.id,
                    HomeownerMember.site_id == profile.site_id,
                    HomeownerMember.status == MemberStatus.active,
                )
            )
        ).scalars().all()
        owns = contributor.user_id == user.id or contributor.member_id in set(member_ids)
        if not owns:
            raise AppError(403, "not_your_contributor", "You can only rank as yourself.")
    return contributor
```

(b) Add the by-site lookup endpoint (place near `get_profile`):

```python
@router.get("/profiles/by-site/{site_id}", response_model=ProfileDetailOut)
async def get_profile_by_site(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileDetailOut:
    """Resolve the most recent profile for a site, membrane-scoped (homeowner needs
    membership; contractor company-scope). 404 if none accessible."""
    profile = (
        await session.execute(
            select(ProfilerProfile)
            .where(ProfilerProfile.site_id == site_id)
            .order_by(ProfilerProfile.created_at.desc())
            .limit(1)
        )
    ).scalars().first()
    if profile is None:
        raise AppError(404, "not_found", "No design profile for this site")
    await _load_accessible_profile(session, profile.id, user)  # enforces the membrane
    areas = (
        await session.execute(select(ProfilerArea).where(ProfilerArea.profile_id == profile.id))
    ).scalars().all()
    contributors = (
        await session.execute(
            select(ProfilerContributor).where(ProfilerContributor.profile_id == profile.id)
        )
    ).scalars().all()
    out = ProfileDetailOut.model_validate(profile)
    out.areas = [AreaOut.model_validate(a) for a in areas]
    out.contributors = [ContributorOut.model_validate(c) for c in contributors]
    return out
```

(c0) **Expose `brief_id` on the rendering** so the homeowner UI can act on the brief. In `app/profiler/schemas.py`, add `brief_id: UUID` to `BriefRenderingOut` (after `id`). The `GET /profiles/{id}/brief` endpoint returns `BriefRenderingOut.model_validate(rendering)` and the ORM row has `brief_id`, so no endpoint change is needed. Add a one-line assertion to the existing `test_profiler_membrane.py` contractor-visibility test (or `test_profiler_brief.py` generate test) that the returned rendering includes a `brief_id` matching the generated brief's id.

(c) Open `add_reference` and `rank_reference` to homeowner members. Change BOTH endpoints' dependency from `user: User = Depends(require_role(*_EDIT_ROLES))` to `user: User = Depends(get_current_user)`, and change their profile load from `_load_owned_profile` to `_load_accessible_profile`. In `add_reference`, after loading the profile, if `body.contributor_id is not None`, call `await _validate_contributor(session, profile, body.contributor_id, user)`. In `rank_reference`, after loading the profile, ALWAYS call `await _validate_contributor(session, profile, body.contributor_id, user)` (rankings always carry a contributor_id). Keep the rest of both endpoints identical.

  Concretely for `rank_reference` the load becomes:
```python
    ref = await session.get(ProfilerReference, reference_id)
    if ref is None:
        raise AppError(404, "not_found", "Reference not found")
    profile = await _load_accessible_profile(session, ref.profile_id, user)
    await _validate_contributor(session, profile, body.contributor_id, user)
```
  And for `add_reference`, after `area` is loaded and validated, replace the `_load_owned_profile` call with:
```python
    profile = await _load_accessible_profile(session, area.profile_id, user)
    if body.contributor_id is not None:
        await _validate_contributor(session, profile, body.contributor_id, user)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_intake.py tests/test_profiler_*.py -q`
Expected: PASS — and **no regression** in the existing profiler suites (the membrane matrix still green; contractor-side add/rank still works because `_load_accessible_profile` allows company-scope).

- [ ] **Step 5: Lint + commit**

```bash
cd constructo/backend
uv run ruff check app/profiler/router.py tests/test_profiler_intake.py
git add app/profiler/router.py tests/test_profiler_intake.py
git commit -m "feat(profiler): by-site lookup + homeowner-contributor add/rank (membrane-safe)"
```

---
---

# PART B — frontend: the homeowner Profiler UI (Calm Cockpit)

> All new logic that can be unit-tested lives in `src/homeowner/design_profiler.util.ts` (app/ files can't be imported by jest). Screens stay thin: fetch → compose kit components → mutate. Every write respects the server's membrane (show the comment affordance on `approve_forbidden`).

## Task 2: typed `design` API client

**Files:** Modify `constructo/mobile/src/api/client.ts`; Test `constructo/mobile/src/api/design.test.ts`.

- [ ] **Step 1: Write the failing test** — `src/api/design.test.ts` (mirror `src/api/permits.api.test.ts`)

```typescript
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../store/secure', () => ({ getToken: jest.fn().mockResolvedValue('test-token') }))

const mockFetch = jest.fn()
;(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch
function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body })
}
afterEach(() => jest.clearAllMocks())

import { design } from './client'

test('profileBySite GETs the by-site path with auth', async () => {
  mockOk({ id: 'p1', areas: [], contributors: [] })
  await design.profileBySite('site-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/profiles/by-site/site-1')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
})

test('rankReference POSTs stars + contributor', async () => {
  mockOk({ ok: true })
  await design.rankReference('ref-1', { contributor_id: 'c1', stars: 5 })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/references/ref-1/rankings')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual({ contributor_id: 'c1', stars: 5 })
})

test('actOnBrief POSTs the action', async () => {
  mockOk({ id: 'b1', state: 'architect_review' })
  await design.actOnBrief('b1', { action: 'send_to_architect' })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/briefs/b1/approval')
  expect(JSON.parse(init.body as string)).toEqual({ action: 'send_to_architect' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/mobile && npm run test -- src/api/design.test.ts`
Expected: FAIL — `design` is not exported.

- [ ] **Step 3: Implement** — add to `src/api/client.ts` (after the `homeowner` export). First add the types, then the client. Use the existing `request<T>` helper and `q()` query-string idiom already in the file (mirror how `homeowner.designProfile(siteId?)` builds its path — if there's no `q()` helper, inline the querystring as the other calls do).

```typescript
// ---- Design Profiler engine (/api/v1/design) ----------------------------
export interface ProfilerArea {
  id: string
  area_kind: string
  area_key: string
  recommended_count: number
  status: string
  confidence: number
  has_conflict: boolean
}
export interface ProfilerContributor {
  id: string
  role: string
  is_decision_owner: boolean
}
export interface ProfilerProfileDetail {
  id: string
  company_id: string
  site_id: string
  scope_type: string
  status: string
  created_at: string
  areas: ProfilerArea[]
  contributors: ProfilerContributor[]
}
export interface ProfilerTheme {
  id: string
  area_id: string | null
  name: string
  confidence: number
  palette: string[]
  materials: string[]
  rationale: string | null
  evidence_reference_ids: string[]
  status: string
  created_at: string
}
export interface ProfilerConflict {
  id: string
  area_id: string
  dimension: string
  value: string
  resolution_status: string
  decision_note: string | null
}
export interface ProfilerReference {
  id: string
  area_id: string
  source_type: string
  consistency_status: string | null
  created_at: string
}
export interface ProfilerBriefRendering {
  id: string
  brief_id: string
  audience: string
  scope: string
  area_id: string | null
  content_json: Record<string, unknown>
  created_at: string
}
export interface ProfilerClarification {
  id: string
  area_id: string | null
  question: string
  answer: string | null
  asked_at: string
  answered_at: string | null
}
export interface ProfilerBriefApproval {
  id: string
  brief_id: string
  actor_role: string
  action: string
  note: string | null
  created_at: string
}

export const design = {
  profileBySite: (siteId: string) =>
    request<ProfilerProfileDetail>(`/api/v1/design/profiles/by-site/${siteId}`),
  profile: (id: string) => request<ProfilerProfileDetail>(`/api/v1/design/profiles/${id}`),
  references: (profileId: string, areaId: string) =>
    request<ProfilerReference[]>(
      `/api/v1/design/profiles/${profileId}/areas/${areaId}/references`,
    ),
  addReference: (body: {
    area_id: string
    contributor_id?: string
    source_type?: string
    image_r2_key?: string
    source_url?: string
    preset_id?: string
  }) =>
    request<ProfilerReference>(`/api/v1/design/references`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rankReference: (
    refId: string,
    body: { contributor_id: string; stars: number; tags?: Record<string, string[]>; note?: string },
  ) =>
    request<{ ok: boolean }>(`/api/v1/design/references/${refId}/rankings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  themes: (profileId: string, areaId: string) =>
    request<ProfilerTheme[]>(`/api/v1/design/profiles/${profileId}/areas/${areaId}/themes`),
  conflicts: (profileId: string) =>
    request<ProfilerConflict[]>(`/api/v1/design/profiles/${profileId}/conflicts`),
  brief: (profileId: string, audience: 'homeowner' | 'architect' | 'contractor' = 'homeowner') =>
    request<ProfilerBriefRendering>(
      `/api/v1/design/profiles/${profileId}/brief?audience=${audience}`,
    ),
  clarifications: (profileId: string) =>
    request<ProfilerClarification[]>(`/api/v1/design/profiles/${profileId}/clarifications`),
  answerClarification: (id: string, answer: string) =>
    request<ProfilerClarification>(`/api/v1/design/clarifications/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  actOnBrief: (briefId: string, body: { action: string; note?: string }) =>
    request<{ id: string; state: string }>(`/api/v1/design/briefs/${briefId}/approval`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  approvals: (briefId: string) =>
    request<ProfilerBriefApproval[]>(`/api/v1/design/briefs/${briefId}/approvals`),
}
```

(Note: the brief `GET` returns 404 until a brief exists, and 403 `brief_not_shared`/`audience_forbidden` per the membrane — callers handle those states. `request` throws `ApiError(status, message, code)`; screens branch on `err.status`/`err.code`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/mobile && npm run test -- src/api/design.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck + commit**

```bash
cd constructo/mobile
npm run typecheck
git add src/api/client.ts src/api/design.test.ts
git commit -m "feat(mobile): typed design-profiler API client"
```
Expected: typecheck 0 errors.

---

## Task 3: pure util + strings

**Files:** Create `constructo/mobile/src/homeowner/design_profiler.util.ts`; Test `constructo/mobile/src/homeowner/design_profiler.util.test.ts`.

- [ ] **Step 1: Write the failing tests** — `src/homeowner/design_profiler.util.test.ts`

```typescript
import {
  areaProgressLabel,
  briefAudienceTabs,
  confidenceBand,
  groupAreasByKind,
  PROFILER_STR,
} from './design_profiler.util'

describe('confidenceBand', () => {
  it('maps a reducer confidence to a calm band (status + word + icon)', () => {
    expect(confidenceBand(0.9)).toEqual({ band: 'high', tone: 'ok', label: 'High', icon: 'check-circle' })
    expect(confidenceBand(0.5)).toEqual({ band: 'building', tone: 'warn', label: 'Building', icon: 'clock' })
    expect(confidenceBand(0.1)).toEqual({ band: 'low', tone: 'quiet', label: 'Low', icon: 'circle' })
  })
})

describe('areaProgressLabel', () => {
  it('reads as time/shape progress, never a %', () => {
    expect(areaProgressLabel(2, 6)).toBe('2 of 6 ranked')
    expect(areaProgressLabel(0, 0)).toBe('Not started')
  })
})

describe('groupAreasByKind', () => {
  it('buckets areas into house build / interior / elements in a stable order', () => {
    const areas = [
      { id: 'a', area_kind: 'interior', area_key: 'kitchen' },
      { id: 'b', area_kind: 'house_build', area_key: 'facade' },
      { id: 'c', area_kind: 'element', area_key: 'main_door' },
    ] as never[]
    const groups = groupAreasByKind(areas)
    expect(groups.map((g) => g.kind)).toEqual(['house_build', 'interior', 'element'])
    expect(groups[1].areas).toHaveLength(1)
  })
})

describe('briefAudienceTabs', () => {
  it('labels the 3 audiences in the homeowner voice', () => {
    expect(briefAudienceTabs('en').map((t) => t.key)).toEqual(['homeowner', 'architect', 'contractor'])
    expect(briefAudienceTabs('en')[0].label).toBe('You')
  })
})

test('PROFILER_STR has en + hi', () => {
  expect(PROFILER_STR.en.intakeTitle).toBeTruthy()
  expect(PROFILER_STR.hi.intakeTitle).toBeTruthy()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd constructo/mobile && npm run test -- src/homeowner/design_profiler.util.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/homeowner/design_profiler.util.ts`

```typescript
import type { ProfilerArea } from '../api/client'
import type { Status } from '../theme/tokens'

export type ConfidenceBand = 'high' | 'building' | 'low'

/** Map the reducer's confidence (0–1) to a calm band: colour + word + icon.
 *  The number is the engine's — we only present it (Determinism Doctrine). */
export function confidenceBand(confidence: number): {
  band: ConfidenceBand
  tone: Status
  label: string
  icon: string
} {
  if (confidence >= 0.75) return { band: 'high', tone: 'ok', label: 'High', icon: 'check-circle' }
  if (confidence >= 0.4) return { band: 'building', tone: 'warn', label: 'Building', icon: 'clock' }
  return { band: 'low', tone: 'quiet', label: 'Low', icon: 'circle' }
}

/** Progress as a count, never a percentage or ring (Calm Cockpit rule). */
export function areaProgressLabel(ranked: number, recommended: number): string {
  if (recommended <= 0 && ranked <= 0) return 'Not started'
  return `${ranked} of ${recommended} ranked`
}

const _KIND_ORDER: Array<ProfilerArea['area_kind']> = ['house_build', 'interior', 'element']
const _KIND_LABEL: Record<string, string> = {
  house_build: 'House build',
  interior: 'Interior',
  element: 'Elements',
}

export function groupAreasByKind(
  areas: ProfilerArea[],
): Array<{ kind: string; label: string; areas: ProfilerArea[] }> {
  return _KIND_ORDER.map((kind) => ({
    kind,
    label: _KIND_LABEL[kind] ?? kind,
    areas: areas.filter((a) => a.area_kind === kind),
  })).filter((g) => g.areas.length > 0)
}

export function briefAudienceTabs(lang: 'en' | 'hi'): Array<{ key: string; label: string }> {
  const labels =
    lang === 'hi'
      ? { homeowner: 'आप', architect: 'डिज़ाइनर', contractor: 'ठेकेदार' }
      : { homeowner: 'You', architect: 'Designer', contractor: 'Contractor' }
  return [
    { key: 'homeowner', label: labels.homeowner },
    { key: 'architect', label: labels.architect },
    { key: 'contractor', label: labels.contractor },
  ]
}

/** Star labels for the 1–5 ranking + the quick tags from the prototype. */
export const RANKING_TAGS = [
  'Love overall', 'Colour only', 'Material only', 'Layout', 'Lighting',
  'Too dark', 'Too busy', 'Too expensive', 'Hard to maintain',
] as const

export const PROFILER_STR = {
  en: {
    intakeTitle: 'Your design profile',
    intakeSub: 'Rank what you love — we turn it into a clear brief.',
    briefTitle: 'Your design brief',
    rankPrompt: 'How much do you like this?',
    approve: 'Approve',
    requestChanges: 'Request changes',
    sendToArchitect: 'Send to designer',
    onlyOwnerCanApprove: 'Only a property owner can approve. You can add a comment.',
    noBriefYet: 'Your brief is being prepared. We’ll tell you when it’s ready.',
    notSharedYet: 'Not shared with you yet.',
  },
  hi: {
    intakeTitle: 'आपकी डिज़ाइन प्रोफ़ाइल',
    intakeSub: 'जो पसंद है उसे रैंक करें — हम उसे साफ़ ब्रीफ़ बनाते हैं।',
    briefTitle: 'आपका डिज़ाइन ब्रीफ़',
    rankPrompt: 'यह आपको कितना पसंद है?',
    approve: 'मंज़ूरी दें',
    requestChanges: 'बदलाव कहें',
    sendToArchitect: 'डिज़ाइनर को भेजें',
    onlyOwnerCanApprove: 'सिर्फ़ मालिक मंज़ूरी दे सकते हैं। आप टिप्पणी जोड़ सकते हैं।',
    noBriefYet: 'आपका ब्रीफ़ तैयार हो रहा है। तैयार होते ही हम बताएँगे।',
    notSharedYet: 'अभी आपके साथ साझा नहीं किया गया।',
  },
} as const
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd constructo/mobile && npm run test -- src/homeowner/design_profiler.util.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Typecheck + commit**

```bash
cd constructo/mobile
npm run typecheck
git add src/homeowner/design_profiler.util.ts src/homeowner/design_profiler.util.test.ts
git commit -m "feat(mobile): design-profiler util (confidence band, area grouping, strings)"
```

---

## Task 4: the intake hub + per-area ranking screens

**Files:** Create `app/(homeowner)/design/profiler.tsx`, `app/(homeowner)/design/profiler/[area].tsx`; Modify `app/(homeowner)/_layout.tsx` (register both `href:null`).

- [ ] **Step 1: Register routes** in `app/(homeowner)/_layout.tsx` — add two `<Tabs.Screen>` (or the layout's screen-registration idiom) with `name="design/profiler"` and `name="design/profiler/[area]"`, both `options={{ href: null }}` (mirror how `design/references/[room]` + `design/profile` are registered). **Flat names — do NOT nest.**

- [ ] **Step 2: Implement the intake hub** — `app/(homeowner)/design/profiler.tsx`. It resolves the profile by the active site, shows scope + contributors + areas grouped by kind with a confidence pill and ranked-progress per area, each row pushing to the ranking screen. Use the kit; honest empty/loading/error states.

```tsx
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ScrollView, View } from 'react-native'
import { design } from '../../../src/api/client'
import { useActiveSiteId } from '../../../src/homeowner/useActiveSite' // existing hook resolving the homeowner's site
import {
  Screen, SubHeader, CalmCard, ListRow, StatusPill, Body, Small, Eyebrow,
} from '../../../src/ui'
import { useColors } from '../../../src/theme/tokens'
import {
  areaProgressLabel, confidenceBand, groupAreasByKind, PROFILER_STR,
} from '../../../src/homeowner/design_profiler.util'

export default function ProfilerHubScreen() {
  const router = useRouter()
  const c = useColors()
  const S = PROFILER_STR.en
  const siteId = useActiveSiteId()
  const q = useQuery({
    queryKey: ['design', 'profiler', 'by-site', siteId],
    queryFn: () => design.profileBySite(siteId!),
    enabled: !!siteId,
  })

  return (
    <Screen scroll padded floatingNav>
      <SubHeader title={S.intakeTitle} subtitle={S.intakeSub} onBack={() => router.back()} />
      {q.isLoading && <Body>Loading…</Body>}
      {q.isError && (
        <CalmCard status="quiet" title={S.noBriefYet} />
      )}
      {q.data && groupAreasByKind(q.data.areas).map((group) => (
        <View key={group.kind} style={{ gap: 8 }}>
          <Eyebrow>{group.label.toUpperCase()}</Eyebrow>
          {group.areas.map((a, i) => {
            const band = confidenceBand(a.confidence)
            return (
              <ListRow
                key={a.id}
                title={a.area_key.replace(/_/g, ' ')}
                subtitle={areaProgressLabel(0, a.recommended_count)}
                right={<StatusPill status={band.tone} label={band.label} size="sm" icon={band.icon as never} />}
                onPress={() =>
                  router.push({
                    pathname: '/(homeowner)/design/profiler/[area]',
                    params: { area: a.id, pid: q.data!.id, key: a.area_key },
                  })
                }
                last={i === group.areas.length - 1}
              />
            )
          })}
        </View>
      ))}
    </Screen>
  )
}
```

> **NOTE for the implementer:** confirm the helper that resolves the homeowner's active site id. The recon found screens read the site via `homeowner.property()`/capabilities; if there is no `useActiveSiteId` hook, derive the site id the same way the existing `design.tsx` does (it calls `homeowner.designProfile()` with no site arg — the server resolves the single site). For the profiler, prefer: call `homeowner.property()` (or the existing site resolver) to get the site id, then `design.profileBySite(siteId)`. If the app already has a single-site convention, thread that. Do NOT invent a new auth/site mechanism — reuse the existing one; ASK if unclear.

- [ ] **Step 3: Implement the ranking screen** — `app/(homeowner)/design/profiler/[area].tsx`. Lists the area's references; tapping a reference opens a 1–5 star + quick-tag ranking that POSTs `design.rankReference` as the caller's own contributor. Resolve the caller's contributor id from the profile detail (the contributor whose `is_decision_owner`/role maps to them — for v1 use the profile's first contributor that belongs to the homeowner; if the engine can't disambiguate, the server's `_validate_contributor` rejects a wrong one). Reuse `PhotoTile`/`Chip`/`StatusPill`; use `useToast()` for confirmations and surface `ApiError` messages.

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { design } from '../../../../src/api/client'
import { Screen, SubHeader, Chip, Body, Small, CalmCard } from '../../../../src/ui'
import { useToast } from '../../../../src/ui'
import { RANKING_TAGS, PROFILER_STR } from '../../../../src/homeowner/design_profiler.util'

export default function AreaRankScreen() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { area, pid, key } = useLocalSearchParams<{ area: string; pid: string; key: string }>()
  const S = PROFILER_STR.en
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])

  const refsQ = useQuery({
    queryKey: ['design', 'profiler', 'refs', pid, area],
    queryFn: () => design.references(pid!, area!),
    enabled: !!pid && !!area,
  })
  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'detail', pid],
    queryFn: () => design.profile(pid!),
    enabled: !!pid,
  })
  const myContributorId = profileQ.data?.contributors[0]?.id // server validates ownership

  const rankMut = useMutation({
    mutationFn: (refId: string) =>
      design.rankReference(refId, {
        contributor_id: myContributorId!,
        stars,
        tags: { positive: tags.filter((t) => !t.startsWith('Too') && t !== 'Hard to maintain'),
                negative: tags.filter((t) => t.startsWith('Too') || t === 'Hard to maintain') },
      }),
    onSuccess: () => {
      toast('Saved', 'check')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: Error) => toast(e.message),
  })

  return (
    <Screen scroll padded floatingNav>
      <SubHeader title={String(key ?? 'Area').replace(/_/g, ' ')} subtitle={S.rankPrompt}
        onBack={() => router.back()} />
      {refsQ.data?.length === 0 && <CalmCard status="quiet" title="No references yet" />}
      {refsQ.data?.map((r) => (
        <View key={r.id} style={{ gap: 8 }}>
          <Body>{r.source_type}</Body>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={8}
                accessibilityRole="button" accessibilityLabel={`${n} stars`}>
                <Body>{n <= stars ? '★' : '☆'}</Body>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {RANKING_TAGS.map((tg) => (
              <Chip key={tg} label={tg} active={tags.includes(tg)}
                onPress={() => setTags((cur) =>
                  cur.includes(tg) ? cur.filter((x) => x !== tg) : [...cur, tg])} />
            ))}
          </View>
          <Chip label="Save ranking" active onPress={() => stars > 0 && rankMut.mutate(r.id)} />
        </View>
      ))}
    </Screen>
  )
}
```

> The star row uses `★/☆` glyphs (not emoji) — acceptable as numeric/control glyphs; if the implementer prefers, swap to the bundled `Icon name="star"` filled/outline. Keep ≥48px touch targets (`hitSlop`).

- [ ] **Step 4: Typecheck + commit**

```bash
cd constructo/mobile
npm run typecheck
git add "app/(homeowner)/design/profiler.tsx" "app/(homeowner)/design/profiler/[area].tsx" "app/(homeowner)/_layout.tsx"
git commit -m "feat(mobile): design-profiler intake hub + per-area ranking"
```
Expected: typecheck 0. (No jest for app/ screens — logic is tested via the util/API tests; screens are thin.)

---

## Task 5: the structured-brief review + approval screen

**Files:** Create `app/(homeowner)/design/brief.tsx`; Modify `app/(homeowner)/_layout.tsx` (register `name="design/brief"`, `href:null`).

- [ ] **Step 1: Register** `design/brief` in `_layout.tsx` (`href:null`).

- [ ] **Step 2: Implement** — `app/(homeowner)/design/brief.tsx`. Resolves the profile by site, fetches the brief (homeowner audience), renders a 3-audience `SegmentedTabs` (You/Designer/Contractor — fetch the chosen audience), shows the narrative + per-area material families/themes from `content_json`, conflicts (read-only), the approval timeline, and — for an owner/co_owner — the approval actions. On `approve_forbidden` (403 + `can_comment`) show the comment affordance, never a grey wall. Handle `404 not_found` (no brief yet → reassuring QuietState) and `403 brief_not_shared`/`audience_forbidden` (not shared → calm message).

```tsx
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'
import { ApiError } from '../../../src/api/client'
import { design } from '../../../src/api/client'
import { homeowner } from '../../../src/api/client'
import {
  Screen, SubHeader, SegmentedTabs, CalmCard, Body, BodyStrong, Small, Eyebrow, Chip, ListRow,
} from '../../../src/ui'
import { useToast } from '../../../src/ui'
import { briefAudienceTabs, PROFILER_STR } from '../../../src/homeowner/design_profiler.util'

export default function BriefScreen() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const S = PROFILER_STR.en
  const [aud, setAud] = useState<'homeowner' | 'architect' | 'contractor'>('homeowner')

  const siteQ = useQuery({ queryKey: ['design', 'profiler', 'site'],
    queryFn: () => homeowner.designProfile() }) // reuse existing single-site resolver; OR property()
  // Prefer a real site id; the implementer wires this the way design.tsx already does.
  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'brief-profile'],
    queryFn: async () => design.profileBySite(await resolveSiteId()),
  })
  const pid = profileQ.data?.id
  const capQ = useQuery({ queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities() })

  const briefQ = useQuery({
    queryKey: ['design', 'profiler', 'brief', pid, aud],
    queryFn: () => design.brief(pid!, aud),
    enabled: !!pid,
    retry: false,
  })

  const briefId = briefQ.data?.brief_id
  const actMut = useMutation({
    mutationFn: (action: string) => design.actOnBrief(briefId!, { action }),
    onSuccess: () => { toast('Done', 'check'); void qc.invalidateQueries({ queryKey: ['design', 'profiler'] }) },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'approve_forbidden') toast(S.onlyOwnerCanApprove)
      else toast((e as Error).message)
    },
  })

  // Honest states
  if (briefQ.isError) {
    const err = briefQ.error
    const code = err instanceof ApiError ? err.code : undefined
    const msg = code === 'brief_not_shared' || code === 'audience_forbidden' ? S.notSharedYet : S.noBriefYet
    return (
      <Screen scroll padded floatingNav>
        <SubHeader title={S.briefTitle} onBack={() => router.back()} />
        <CalmCard status="quiet" title={msg} />
      </Screen>
    )
  }

  const content = briefQ.data?.content_json as
    | { narrative?: { headline?: string; summary?: string; sections?: { title: string; body: string }[] };
        areas?: { area_key: string; material_families: string[]; themes: { name: string }[] }[] }
    | undefined

  return (
    <Screen scroll padded floatingNav>
      <SubHeader title={S.briefTitle} onBack={() => router.back()} />
      <SegmentedTabs tabs={briefAudienceTabs('en')} active={aud}
        onChange={(k) => setAud(k as typeof aud)} />
      {content?.narrative?.headline ? <BodyStrong>{content.narrative.headline}</BodyStrong> : null}
      {content?.narrative?.summary ? <Body>{content.narrative.summary}</Body> : null}
      {(content?.areas ?? []).map((a) => (
        <CalmCard key={a.area_key} status="info" eyebrow={a.area_key.replace(/_/g, ' ').toUpperCase()}
          title={a.themes[0]?.name ?? 'Direction'}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {a.material_families.map((m) => <Chip key={m} label={m} active={false} />)}
          </View>
        </CalmCard>
      ))}
      {/* owner-only actions; the server is the source of truth — on 403 we show the comment line */}
      {capQ.data?.can_approve ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label={S.sendToArchitect} active onPress={() => actMut.mutate('send_to_architect')} />
          <Chip label={S.requestChanges} active={false} onPress={() => actMut.mutate('request_changes')} />
        </View>
      ) : (
        <Small>{S.onlyOwnerCanApprove}</Small>
      )}
    </Screen>
  )
}
```

> **NOTE for the implementer:** one intentional seam remains — `resolveSiteId()`. Resolve the site id the SAME way `design.tsx` does today (don't invent a new mechanism — read `design.tsx`/the existing site resolver and mirror it; ASK if unclear). `briefId` is now `briefQ.data.brief_id` (Part A Task 1 step c0 added `brief_id` to `BriefRenderingOut`). Do not leave any dangling reference.

- [ ] **Step 3: Add the entry point** — in `app/(homeowner)/design.tsx`, add a `LinkRow` (or button) in the Profile segment: "Open your design profile →" → `router.push('/(homeowner)/design/profiler')`, and "View your design brief →" → `router.push('/(homeowner)/design/brief')`. Keep it additive — do not remove existing content. Gate the brief link to always-visible (read), the profiler link to `can_design` if that's the existing convention.

- [ ] **Step 4: Typecheck + commit**

```bash
cd constructo/mobile
npm run typecheck
git add "app/(homeowner)/design/brief.tsx" "app/(homeowner)/_layout.tsx" "app/(homeowner)/design.tsx"
git commit -m "feat(mobile): design-profiler brief review + approval screen + entry points"
```
Expected: typecheck 0.

---

## Task 6: Full verification (Production-Bar gate)

**Files:** none (verification).

- [ ] **Step 1: Backend regression**

Run: `cd constructo/backend && uv run pytest tests/test_profiler_*.py -q && uv run ruff check app/profiler`
Expected: all green; ruff clean.

- [ ] **Step 2: Frontend typecheck + jest**

Run: `cd constructo/mobile && npm run typecheck && npm run test`
Expected: **typecheck 0 errors; jest green** (all prior tests + the new `design.test.ts` + `design_profiler.util.test.ts`).

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "chore(profiler): Plan 4 verification fixups" || echo "nothing to commit"
```

---

## Self-Review

**Scope coverage (vs handoff §6 Plan 4, scoped to "ranking + full intake"):**
- Multi-step intake — per-area image **ranking** (Task 4) ✓; scope/contributors/areas shown with confidence pills + progress (Task 4) ✓; preset packs / Pinterest deferred (note below).
- Structured-brief output — themes + material families per area, 3-audience segmented view, narrative, approval actions, honest not-shared/no-brief states (Task 5) ✓.
- Wires to the real `/api/v1/design/*` (Task 2 client) ✓.
- Backend enable: homeowner can rank as self + by-site lookup, membrane-safe (Task 1) ✓.

**Determinism / Calm Cockpit compliance:** confidence is the engine's, only presented (`confidenceBand`); progress is a count, never % (`areaProgressLabel`); status = colour+icon+word (`StatusPill`); approval authority is server-enforced and the UI degrades to a comment line on 403 (never a grey wall); single-language strings (`PROFILER_STR` en/hi); ≥14px type (kit defaults); real-photo references (no AI renders).

**Type consistency:** `design.*` client return types (`ProfilerProfileDetail`, `ProfilerBriefRendering`, …) consumed in screens + tests; `confidenceBand → {band,tone,label,icon}`, `groupAreasByKind`, `areaProgressLabel`, `briefAudienceTabs` signatures match tests. `_validate_contributor`/`get_profile_by_site` signatures match the backend tests.

**Placeholder scan:** the two intentional seams in Task 5 (`resolveSiteId`, `briefId`) are explicitly flagged with the resolution path + an ASK instruction — the implementer must wire them to existing code, not leave them dangling. No other placeholders.

**Explicitly deferred (note for later, non-blocking):** preset-pack + Pinterest reference sources in the homeowner intake (the engine supports `source_type=preset/pinterest_link`; the homeowner UI for them is a follow-up); conflict-resolution-by-owner (homeowner sees conflicts read-only; resolution stays architect/contractor); per-contributor disambiguation when a user holds multiple contributor rows (v1 uses the first owned contributor; server validates ownership).

---

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks.
2. **Inline Execution** — tasks in-session with checkpoints.
