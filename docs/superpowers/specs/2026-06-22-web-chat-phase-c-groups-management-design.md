# Web Chat — Phase C: Group Management (Create + Manage), Admin-Gated

- **Date:** 2026-06-22
- **Status:** Approved (design)
- **Branch:** `feat/web-chat-phase-bc` (stacked on `feat/web-chat`)
- **Backend changes:** none (web-only)
- **Predecessor:** Phase A (PR #205); built after Phase B in the same branch.

## Context

The backend already ships the **entire** group lifecycle in
`constructo/backend/app/chat/groups_router.py`: create (owner-only), addable-users,
roster, add members, remove/leave, rename, archive, promote/demote — with a
**last-admin guard** (409). Group threads (`kind="group"`) already render in the
web inbox (Phase A). What is missing is a **UI to create and manage** groups.

Notably, **mobile has only an API client stub and no group-management screens**,
so web is the **first** group-management surface anywhere — net-new design against
a settled contract. Web has **no `groups.ts` client yet**; we port mobile's.

## Goal

A complete, **Neev-styled**, admin-gated group-management experience inside the
web chat: owners create groups; admins manage membership/settings; any member can
leave. The UI mirrors the backend's authority model (the backend is the real gate).

## Scope

**In (full management):**
- `api/groups.ts` web client (port): `create`, `addableUsers`, `members`,
  `addMembers`, `removeMember`, `patch`.
- **Create** (`NewGroupModal`): name, optional site, member multi-select. Entry =
  "+ New group" in the inbox header, **owner-only**.
- **Manage** (`GroupManageDrawer`): roster + role badges; admin controls (add,
  remove, rename, archive, promote/demote); member control (leave). Entry =
  "Members" button in the thread header when `kind==='group'`.
- Destructive confirms (`ConfirmDialog`) + error toasts (`useToast`), incl. the
  `409 last_admin` guard.

**Out (explicit):**
- Any backend change. Group **messaging** itself (already works via Phase A).
- Homeowner-channel management, mute/notification prefs UI (a later pass).

## Decisions

- **Surfaces: `Modal` for create + `Drawer` for manage.** Create is a short
  focused form (modal); the roster can be long and benefits from a right
  slide-over that keeps the thread visible behind it (drawer). Rejected: both as
  modals (worse for roster), a dedicated route (overkill).
- **Reuse existing primitives:** `Modal`/`ConfirmDialog`, `Drawer`, `useDialog`
  (focus-trap/Esc/scroll-lock), `Toast`, `Button`, `StatusPill`, `Typography`,
  and **`SiteSwitcher`** as the create-group site picker.
- **Manage controls gate on the caller's role _in the group_** (from the roster),
  not the app role — so an owner can delegate admin to a supervisor/architect.
  "+ New group" gates on the **app role = owner** (matches `require_role(owner)`).

## Components & files

| File | Type | Responsibility |
|---|---|---|
| `api/groups.ts` | new (port) | Typed client for the 6 group endpoints + wire types (`Group`, `GroupMember`, `AddableUser`, `MemberRole`). |
| `api/groups.test.ts` | new | Path/shape/verb assertions per endpoint. |
| `features/chat/groups/NewGroupModal.tsx` | new | Create form: name + site (`SiteSwitcher`) + member multi-select (`addableUsers`). |
| `features/chat/groups/NewGroupModal.test.tsx` | new | Validation, submit shape, owner-only mount. |
| `features/chat/groups/GroupManageDrawer.tsx` | new | Roster + admin/member controls + confirms + toasts. |
| `features/chat/groups/GroupManageDrawer.test.tsx` | new | RBAC gating, add/remove/rename/archive/role, leave, last-admin toast. |
| `features/chat/groups/MemberPicker.tsx` | new | Reusable multi-select over `addableUsers` (used by create + add). |
| `features/chat/ChatInbox.tsx` | edit | Owner-only "+ New group" header button → opens modal; refetch on create. |
| `features/chat/ChatPage.tsx` / `ChatThread.tsx` | edit | "Members" button in the group thread header → opens manage drawer. |

## RBAC (UI mirrors backend; backend is the real gate)

| Action | Allowed | UI source of truth |
|---|---|---|
| Create group | owner | app role (`useMeRole`) |
| Add / remove / rename / archive / role change | **group admin** | my `MemberRole` in the roster |
| Leave (self-remove) | any member | self id in roster |
| Last admin removal/demotion | blocked | backend `409 last_admin` → toast |

`addableUsers`: with `group_id` requires admin (the manage "add" picker); without
`group_id` requires owner (the create picker) — the UI calls each in the matching
context, so the backend gate aligns.

## Data flow

- **Create:** `NewGroupModal` submits `{name, site_id?, member_user_ids[]}` →
  `groupsApi.create` → on 201, invalidate `['chat','conversations']` so the new
  group appears in the inbox; optionally auto-select it.
- **Manage open:** `GroupManageDrawer` loads `groupsApi.members(id)`; derive
  `myRole` by matching `me.id`. Admin controls render only when `myRole==='admin'`.
- **Mutations:** each control calls the matching endpoint; on success refetch the
  roster; on `409 last_admin` (or any error) show a toast and leave state intact.
- **Leave:** confirm → `removeMember(id, me.id)` → close drawer + invalidate
  conversations (the thread leaves the inbox).

## Neev design

- Modal/Drawer already token-bound (sand/sage/clay; neev-dark inherits). New
  inner UI uses semantic tokens only — **no hardcoded hex** (so neev-dark works).
- Role badges via `StatusPill`; homeowner cue consistent with the thread's
  existing "client present" treatment; pills `rounded-full`.
- Buttons via `Button` (primary = clay CTA; `danger` for destructive; `ghost`
  for cancel). Eczar serif headings via the Modal/Drawer header (already neev).
- **Verify in neev light + neev-dark.**

## Error handling

- `409 last_admin` → toast: "A group needs at least one admin." State unchanged.
- `403` (non-admin attempts a gated action) → should be unreachable via gating;
  if hit, toast the backend message (defense in depth).
- Network errors → toast; controls re-enable; no optimistic data loss.

## Testing & acceptance

- `groups.ts`: each method hits the correct verb/path with the correct body.
- `NewGroupModal`: required name; submit payload shape; renders only for owner.
- `GroupManageDrawer`: admin sees full controls, member sees roster + leave only;
  add/remove/rename/archive/promote/demote call the right endpoints; leaving the
  last admin surfaces the toast.
- Suite green; `tsc -b --noEmit && vitest run --retry=2 && npm run build &&
  npm run budget` pass. Visually verified light + dark.

## Acceptance criteria (definition of done)

1. An owner creates a group (name + optional site + members); it appears in the
   inbox and is chat-ready.
2. An admin can add/remove members, rename, archive, and promote/demote, with the
   last-admin guard surfaced as a toast.
3. A non-admin member sees a read-only roster and a "Leave" action; leaving drops
   the thread from their inbox.
4. Supervisor/architect see no "+ New group" button but can manage a group an
   owner promoted them to admin of.
5. All new UI is Neev-skinned and AA in light + dark; tests + build + budget green.
