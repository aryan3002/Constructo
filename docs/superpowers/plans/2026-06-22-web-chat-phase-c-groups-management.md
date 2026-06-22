# Web Chat Phase C — Group Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, Neev-styled, admin-gated group-management UI to the web chat — owners create groups; admins add/remove/rename/archive/promote/demote; any member can leave — against the existing backend (`groups_router.py`), zero backend changes.

**Architecture:** A web `api/groups.ts` client (ported to web conventions) + a reusable `MemberPicker` + a `NewGroupModal` (create) reached from an owner-only `NewGroupButton` in the inbox header + a `GroupManageDrawer` (manage) reached from a "Members" button in the group thread header. RBAC in the UI mirrors the backend: create gates on app-role=owner; manage gates on the caller's `MemberRole` in the roster.

**Tech Stack:** React 18 + TypeScript, Vite, TanStack Query, Tailwind (semantic tokens), Vitest + @testing-library/react. Reuses `ui/Modal` (`ConfirmDialog`), `ui/Drawer`, `ui/Toast` (`useToast`), `ui/Button`, `ui/StatusPill`.

## Global Constraints

- **Web-only, zero backend changes.** Contract: `constructo/backend/app/chat/groups_router.py`.
- **Semantic tokens only — no hardcoded hex.** `neev` + `neev-dark` both correct. Pills `rounded-full`.
- **English-first** copy.
- **RBAC (UI mirror; backend is the real gate):** create = `useMeRole()==='owner'`; admin controls = caller's roster `role==='admin'`; leave = any member (self). Last-admin block → backend `409` → toast.
- **`addableUsers` gate alignment:** call **with `groupId`** in the manage "add" picker (admin-gated); call **with only `siteId`** (no `groupId`) in the create picker (owner-gated).
- **Commit scoping:** `git add <explicit paths>` only — never `git add -A`.
- **Verify gate (from `constructo/web`):** `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`.

---

### Task C1: Web group API client (`api/groups.ts`)

**Files:**
- Create: `constructo/web/src/api/groups.ts`
- Test: `constructo/web/src/api/groups.test.ts`
- Reference: `constructo/mobile/src/api/groups.ts` (shapes), `constructo/web/src/api/chat.ts` (web `request<T>` convention), `constructo/backend/app/chat/groups_router.py` (paths).

**Interfaces:**
- Produces:
  ```ts
  export type MemberRole = 'admin' | 'member'
  export interface GroupMember { user_id: string; name: string | null; role: MemberRole; is_homeowner: boolean }
  export interface Group { id: string; name: string | null; site_id: string | null; archived: boolean; members: GroupMember[] }
  export interface AddableUser { user_id: string; name: string | null; role: string; already_member: boolean }
  export interface GroupCreateBody { name: string; site_id?: string | null; member_user_ids: string[] }
  export interface GroupPatchBody { name?: string; archived?: boolean; member_role?: { user_id: string; role: MemberRole } }
  export const groupsApi: { create; addableUsers; members; addMembers; removeMember; patch }
  ```

- [ ] **Step 1: Write the failing test** (`groups.test.ts`) — stub `fetch`, assert verb/path/body:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { groupsApi } from './groups'

function mockFetch(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400, status,
    json: async () => json,
  } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.unstubAllGlobals())

describe('groupsApi', () => {
  it('create POSTs to /groups', async () => {
    const fetchFn = mockFetch({ id: 'g1', name: 'Crew', site_id: null, archived: false, members: [] })
    await groupsApi.create({ name: 'Crew', site_id: null, member_user_ids: ['u1'] })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/chat\/groups$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Crew', site_id: null, member_user_ids: ['u1'] })
  })
  it('addableUsers GETs with site_id + group_id query', async () => {
    const fetchFn = mockFetch([])
    await groupsApi.addableUsers({ siteId: 's1', groupId: 'g1' })
    expect(fetchFn.mock.calls[0][0]).toMatch(/addable-users\?site_id=s1&group_id=g1$/)
  })
  it('members GETs the roster', async () => {
    const fetchFn = mockFetch({ members: [] })
    await groupsApi.members('g1')
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/groups\/g1\/members$/)
  })
  it('addMembers POSTs {user_ids}', async () => {
    const fetchFn = mockFetch({ id: 'g1', members: [] })
    await groupsApi.addMembers('g1', ['u2', 'u3'])
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ user_ids: ['u2', 'u3'] })
  })
  it('removeMember DELETEs the member path', async () => {
    const fetchFn = mockFetch(null, 204)
    await groupsApi.removeMember('g1', 'u2')
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/groups\/g1\/members\/u2$/)
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE')
  })
  it('patch PATCHes group fields', async () => {
    const fetchFn = mockFetch({ id: 'g1', members: [] })
    await groupsApi.patch('g1', { name: 'Renamed', member_role: { user_id: 'u2', role: 'admin' } })
    expect(fetchFn.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ name: 'Renamed', member_role: { user_id: 'u2', role: 'admin' } })
  })
})
```

- [ ] **Step 2: Run, verify failure** — `cd constructo/web && npx vitest run src/api/groups.test.ts` → FAIL.

- [ ] **Step 3: Implement `api/groups.ts`** (web `request<T>` convention, same as `chat.ts`):

```ts
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

export type MemberRole = 'admin' | 'member'
export interface GroupMember { user_id: string; name: string | null; role: MemberRole; is_homeowner: boolean }
export interface Group { id: string; name: string | null; site_id: string | null; archived: boolean; members: GroupMember[] }
export interface AddableUser { user_id: string; name: string | null; role: string; already_member: boolean }
export interface GroupCreateBody { name: string; site_id?: string | null; member_user_ids: string[] }
export interface GroupPatchBody { name?: string; archived?: boolean; member_role?: { user_id: string; role: MemberRole } }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try { const b = await res.json(); detail = b?.detail ?? b?.message ?? detail } catch { /* non-JSON */ }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const groupsApi = {
  create(body: GroupCreateBody): Promise<Group> {
    return request<Group>('/api/v1/chat/groups', { method: 'POST', body: JSON.stringify(body) })
  },
  addableUsers(opts: { siteId?: string; groupId?: string } = {}): Promise<AddableUser[]> {
    const q = new URLSearchParams()
    if (opts.siteId) q.set('site_id', opts.siteId)
    if (opts.groupId) q.set('group_id', opts.groupId)
    const qs = q.toString()
    return request<AddableUser[]>(`/api/v1/chat/groups/addable-users${qs ? `?${qs}` : ''}`)
  },
  members(groupId: string): Promise<{ members: GroupMember[] }> {
    return request<{ members: GroupMember[] }>(`/api/v1/chat/groups/${groupId}/members`)
  },
  addMembers(groupId: string, userIds: string[]): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ user_ids: userIds }) })
  },
  removeMember(groupId: string, userId: string): Promise<void> {
    return request<void>(`/api/v1/chat/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
  },
  patch(groupId: string, body: GroupPatchBody): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/api/groups.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/api/groups.ts constructo/web/src/api/groups.test.ts
git commit -m "feat(web/chat): web group API client (Phase C)"
```

---

### Task C2: `MemberPicker` (reusable multi-select)

**Files:**
- Create: `constructo/web/src/features/chat/groups/MemberPicker.tsx`
- Test: `constructo/web/src/features/chat/groups/MemberPicker.test.tsx`

**Interfaces:**
- Consumes: `AddableUser` from `../../../api/groups`.
- Produces:
  ```ts
  export interface MemberPickerProps {
    users: AddableUser[]
    selected: Set<string>
    onToggle: (userId: string) => void
    loading?: boolean
  }
  ```
  A scrollable checkbox list. Each row: name (fallback "Unknown"), role text, homeowner cue. An `already_member` user is rendered **checked + disabled**.

- [ ] **Step 1: Failing test**:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberPicker } from './MemberPicker'

const users = [
  { user_id: 'u1', name: 'Asha', role: 'supervisor', already_member: false },
  { user_id: 'u2', name: 'Ravi', role: 'accountant', already_member: true },
]

describe('MemberPicker', () => {
  it('lists users and toggles selection', () => {
    const onToggle = vi.fn()
    render(<MemberPicker users={users} selected={new Set()} onToggle={onToggle} />)
    fireEvent.click(screen.getByLabelText(/Asha/))
    expect(onToggle).toHaveBeenCalledWith('u1')
  })
  it('renders an already-member as checked + disabled', () => {
    render(<MemberPicker users={users} selected={new Set()} onToggle={() => {}} />)
    const ravi = screen.getByLabelText(/Ravi/) as HTMLInputElement
    expect(ravi.checked).toBe(true)
    expect(ravi.disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** a token-styled checkbox list (label wraps the checkbox so `getByLabelText` works; role badge via `StatusPill` or a muted span; homeowner cue when `role==='homeowner'`).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/groups/MemberPicker.tsx constructo/web/src/features/chat/groups/MemberPicker.test.tsx
git commit -m "feat(web/chat): MemberPicker multi-select (Phase C)"
```

---

### Task C3: `NewGroupModal` (create form)

**Files:**
- Create: `constructo/web/src/features/chat/groups/NewGroupModal.tsx`
- Test: `constructo/web/src/features/chat/groups/NewGroupModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` (`ui/Modal`), `Button` (`ui/Button`), `MemberPicker`, `groupsApi`, `useToast`.
- Produces:
  ```ts
  export interface NewGroupModalProps {
    open: boolean
    onClose: () => void
    onCreated: (group: Group) => void
    sites: { id: string; name: string }[]   // "Company-wide" added internally as the null option
  }
  ```

**Behaviour:** name input (required, trimmed); a tokenized `<select>` site field whose first option is "Company-wide (no site)" (value `''` → `site_id: null`) followed by `sites`; a `MemberPicker` fed by `groupsApi.addableUsers({ siteId })` (refetched via TanStack Query keyed on `siteId`; pass `siteId` only when a site is chosen). Submit → `groupsApi.create({ name, site_id, member_user_ids: [...selected] })` → `onCreated(group)` + `onClose()`. Errors → toast.

- [ ] **Step 1: Failing test** (wrap renders in a `QueryClientProvider` + `ToastProvider`; mock `groupsApi`):

```tsx
it('submits the create payload and calls onCreated', async () => {
  vi.spyOn(groupsApi, 'addableUsers').mockResolvedValue([
    { user_id: 'u1', name: 'Asha', role: 'supervisor', already_member: false },
  ])
  const created = { id: 'g9', name: 'Phase 2 crew', site_id: null, archived: false, members: [] }
  const createSpy = vi.spyOn(groupsApi, 'create').mockResolvedValue(created)
  const onCreated = vi.fn()
  renderWithProviders(
    <NewGroupModal open onClose={() => {}} onCreated={onCreated} sites={[{ id: 's1', name: 'Bandra Villa' }]} />,
  )
  fireEvent.change(await screen.findByLabelText(/group name/i), { target: { value: 'Phase 2 crew' } })
  fireEvent.click(await screen.findByLabelText(/Asha/))
  fireEvent.click(screen.getByRole('button', { name: /create group/i }))
  await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ name: 'Phase 2 crew', site_id: null, member_user_ids: ['u1'] }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
})

it('disables create until a name is entered', () => {
  vi.spyOn(groupsApi, 'addableUsers').mockResolvedValue([])
  renderWithProviders(<NewGroupModal open onClose={() => {}} onCreated={() => {}} sites={[]} />)
  expect(screen.getByRole('button', { name: /create group/i })).toBeDisabled()
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** `NewGroupModal.tsx` per the behaviour above (Modal with a footer holding Cancel `ghost` + "Create group" `primary`; site `<select>` tokenized; `useToast().show({ status:'risk', message })` on error).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/groups/NewGroupModal.tsx constructo/web/src/features/chat/groups/NewGroupModal.test.tsx
git commit -m "feat(web/chat): NewGroupModal create form (Phase C)"
```

---

### Task C4: Owner-only `NewGroupButton` + inbox header wiring

**Files:**
- Create: `constructo/web/src/features/chat/groups/NewGroupButton.tsx`
- Test: `constructo/web/src/features/chat/groups/NewGroupButton.test.tsx`
- Modify: `constructo/web/src/features/chat/ChatInbox.tsx` (render `<NewGroupButton />` in the header)

**Interfaces:**
- Consumes: `useMeRole` (`auth/useCan`), `useQuery`/`useQueryClient` (TanStack), `chatApi.conversations` (cache key `['chat','conversations']`), `NewGroupModal`.
- Produces: `export function NewGroupButton(): JSX.Element | null` — renders `null` unless `useMeRole()==='owner'`.

**Behaviour:** owner-only "+ New group" button → opens `NewGroupModal`. Sites passed to the modal are derived from the cached conversations: `conversations.filter(c => c.kind==='site' && c.site_id).map(c => ({ id: c.site_id!, name: c.site_name ?? 'Site' }))` (deduped by id). On `onCreated`, `queryClient.invalidateQueries({ queryKey: ['chat','conversations'] })` so the new group appears.

- [ ] **Step 1: Failing test**:

```tsx
it('renders nothing for a non-owner', () => {
  vi.mocked(useMeRole).mockReturnValue('supervisor')
  renderWithProviders(<NewGroupButton />)
  expect(screen.queryByRole('button', { name: /new group/i })).toBeNull()
})
it('opens the create modal for an owner', () => {
  vi.mocked(useMeRole).mockReturnValue('owner')
  renderWithProviders(<NewGroupButton />)
  fireEvent.click(screen.getByRole('button', { name: /new group/i }))
  expect(screen.getByRole('dialog', { name: /new group/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** `NewGroupButton.tsx`; then add it to the `ChatInbox` header (right of the "Chat" title), e.g. wrap the header `<div>` contents in a `flex items-center justify-between`.

- [ ] **Step 4: Run, verify pass** — also run `ChatInbox.test.tsx` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/groups/NewGroupButton.tsx constructo/web/src/features/chat/groups/NewGroupButton.test.tsx constructo/web/src/features/chat/ChatInbox.tsx
git commit -m "feat(web/chat): owner-only New Group entry in inbox (Phase C)"
```

---

### Task C5: `GroupManageDrawer` — roster, role derivation, Leave

**Files:**
- Create: `constructo/web/src/features/chat/groups/GroupManageDrawer.tsx`
- Test: `constructo/web/src/features/chat/groups/GroupManageDrawer.test.tsx`

**Interfaces:**
- Consumes: `Drawer` (`ui/Drawer`), `ConfirmDialog` (`ui/Modal`), `useToast`, `groupsApi`, `useMe` (`auth/useCan`), `StatusPill`.
- Produces:
  ```ts
  export interface GroupManageDrawerProps {
    open: boolean
    onClose: () => void
    groupId: string
    groupTitle: string
    onLeft?: () => void   // called after the current user leaves
  }
  ```

**Behaviour (this task = member-level view):** on open, load `groupsApi.members(groupId)` (TanStack, key `['chat','group',groupId,'members']`). Derive `me` via `useMe()`, `myRole = members.find(m => m.user_id===me.id)?.role`, `isAdmin = myRole==='admin'`. Render the roster (name + role badge + homeowner cue). Render a "Leave group" button (danger `ghost`) for any member → `ConfirmDialog` → `groupsApi.removeMember(groupId, me.id)` → on success `onLeft?.()` + `onClose()`; on `409 last_admin` → `useToast().show({ status:'warn', message:'A group needs at least one admin. Promote someone else first.' })`. (Admin mutation controls are added in C6.)

- [ ] **Step 1: Failing test**:

```tsx
it('shows the roster and a Leave action', async () => {
  vi.spyOn(groupsApi, 'members').mockResolvedValue({ members: [
    { user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false },
    { user_id: 'u2', name: 'Asha', role: 'member', is_homeowner: false },
  ]})
  vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as any)
  renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
  expect(await screen.findByText('Asha')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument()
})

it('toasts the last-admin guard on a 409 leave', async () => {
  vi.spyOn(groupsApi, 'members').mockResolvedValue({ members: [{ user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false }] })
  vi.spyOn(groupsApi, 'removeMember').mockRejectedValue(new ApiError(409, 'last_admin'))
  vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as any)
  renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
  fireEvent.click(await screen.findByRole('button', { name: /leave group/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^leave$/i })) // confirm
  expect(await screen.findByText(/at least one admin/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** the drawer scaffold + roster + Leave + role derivation.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/groups/GroupManageDrawer.tsx constructo/web/src/features/chat/groups/GroupManageDrawer.test.tsx
git commit -m "feat(web/chat): GroupManageDrawer roster + leave (Phase C)"
```

---

### Task C6: `GroupManageDrawer` admin controls (add/remove/rename/archive/role)

**Files:**
- Modify: `constructo/web/src/features/chat/groups/GroupManageDrawer.tsx`
- Modify: `constructo/web/src/features/chat/groups/GroupManageDrawer.test.tsx`

**Behaviour (admin-only — render only when `isAdmin`):**
- **Rename:** inline text field seeded with `groupTitle` + Save → `groupsApi.patch(groupId, { name })` → refetch roster + invalidate `['chat','conversations']`.
- **Archive:** "Archive group" (danger) → `ConfirmDialog` → `groupsApi.patch(groupId, { archived: true })` → `onClose()` + invalidate conversations.
- **Add members:** a `MemberPicker` fed by `groupsApi.addableUsers({ groupId })`; "Add" → `groupsApi.addMembers(groupId, [...selected])` → refetch roster.
- **Per-member:** Remove (`ConfirmDialog` → `removeMember`) and Promote/Demote (`patch(groupId, { member_role: { user_id, role } })`). All refetch the roster.
- Every mutation: on error → `useToast().show({ status:'risk'|'warn', message })`; `409 last_admin` on remove/demote → the warn toast from C5.

- [ ] **Step 1: Failing tests** (admin sees controls; member does not; a rename calls patch):

```tsx
it('hides admin controls from a non-admin member', async () => {
  vi.spyOn(groupsApi, 'members').mockResolvedValue({ members: [
    { user_id: 'me', name: 'Asha', role: 'member', is_homeowner: false },
    { user_id: 'u2', name: 'Owner', role: 'admin', is_homeowner: false },
  ]})
  vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as any)
  renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
  expect(await screen.findByText('Owner')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add members|archive group|rename/i })).toBeNull()
  expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument()
})

it('renames the group (admin)', async () => {
  vi.spyOn(groupsApi, 'members').mockResolvedValue({ members: [{ user_id: 'me', name: 'Owner', role: 'admin', is_homeowner: false }] })
  vi.spyOn(groupsApi, 'addableUsers').mockResolvedValue([])
  const patchSpy = vi.spyOn(groupsApi, 'patch').mockResolvedValue({ id: 'g1', name: 'Renamed', site_id: null, archived: false, members: [] })
  vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as any)
  renderWithProviders(<GroupManageDrawer open onClose={() => {}} groupId="g1" groupTitle="Crew" />)
  fireEvent.change(await screen.findByLabelText(/group name/i), { target: { value: 'Renamed' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await waitFor(() => expect(patchSpy).toHaveBeenCalledWith('g1', { name: 'Renamed' }))
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** the admin controls (gated by `isAdmin`), reusing `MemberPicker`, `ConfirmDialog`, `useToast`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/groups/GroupManageDrawer.tsx constructo/web/src/features/chat/groups/GroupManageDrawer.test.tsx
git commit -m "feat(web/chat): GroupManageDrawer admin controls (Phase C)"
```

---

### Task C7: Thread-header "Members" entry + full Phase-C verification

**Files:**
- Modify: `constructo/web/src/features/chat/ChatThread.tsx` (new optional prop `onManageGroup?: () => void`; render a "Members" button in the header when provided).
- Modify: `constructo/web/src/features/chat/ChatPage.tsx` (own `GroupManageDrawer`; pass `onManageGroup` only when `selectedConv.kind==='group'`; `onLeft` clears selection + invalidates conversations).
- Modify tests: `ChatThread.test.tsx`, `ChatPage.test.tsx`.

**Interfaces:**
- `ChatThreadProps` gains `onManageGroup?: () => void`.

- [ ] **Step 1: Failing test** (ChatThread renders the button when the prop is set; ChatPage opens the drawer for a group):

```tsx
// ChatThread.test.tsx
it('shows a Members button for a group thread', () => {
  const onManageGroup = vi.fn()
  renderWithProviders(<ChatThread address={{ conversationId: 'g1' }} title="Crew" onManageGroup={onManageGroup} />)
  fireEvent.click(screen.getByRole('button', { name: /members/i }))
  expect(onManageGroup).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run, verify failure.**

- [ ] **Step 3: Implement** — add the header button in `ChatThread`; in `ChatPage`, add `manageOpen` state, render `<GroupManageDrawer open={manageOpen} groupId={selectedConv.id} groupTitle={threadTitle} onClose={...} onLeft={() => { setSelectedConv(null); setMobileShowThread(false); queryClient.invalidateQueries({ queryKey:['chat','conversations'] }) }} />`, and pass `onManageGroup={() => setManageOpen(true)}` to `ChatThread` only when `selectedConv.kind==='group'`.

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/features/chat`.

- [ ] **Step 5: Full verification gate**

Run: `cd constructo/web && npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`
Expected: all green.

- [ ] **Step 6: Visual verify (neev light + dark)** — mock-owner preview (`VITE_USE_MOCKS=true` + `VITE_NEEV_OWNER=true`): "+ New group" appears for owner; create a company-wide group; open a group thread → "Members" → drawer shows roster + admin controls; rename + add + promote + leave paths; toggle dark. Screenshot both. (Inbox needs a live backend to populate real groups; mock owner proves the create button + modal + drawer chrome render correctly.)

- [ ] **Step 7: Commit**

```bash
git add constructo/web/src/features/chat/ChatThread.tsx constructo/web/src/features/chat/ChatPage.tsx constructo/web/src/features/chat/ChatThread.test.tsx constructo/web/src/features/chat/ChatPage.test.tsx
git commit -m "feat(web/chat): group manage entry in thread header (Phase C complete)"
```

---

## Self-Review (done)

- **Spec coverage:** api client (C1), MemberPicker (C2), create modal (C3), owner-only create entry (C4), manage drawer roster+leave (C5), admin controls (C6), thread entry + verify (C7). Full management + RBAC + last-admin toast all covered. ✓
- **Type consistency:** `MemberRole`, `GroupMember`, `Group`, `AddableUser` defined once in C1 and consumed unchanged by C2–C7. `addableUsers({siteId})` in create vs `addableUsers({groupId})` in manage matches the backend gate. `removeMember(groupId, me.id)` is the Leave path. ✓
- **Placeholders:** none — exact paths, endpoints, and component interfaces throughout. ✓
- **RBAC:** create gates on `useMeRole()==='owner'` (C4); admin controls gate on roster role (C6); leave is any-member (C5). ✓
