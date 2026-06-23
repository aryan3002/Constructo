/**
 * Group-management API client for Constructo web (Phase C).
 *
 * Mirrors `constructo/mobile/src/api/groups.ts` shapes and the backend contract
 * in `constructo/backend/app/chat/groups_router.py`. Uses the same local
 * `request<T>` + auth-header convention as `api/chat.ts` (imports API_BASE /
 * ApiError / getToken by reference; never touches the underlying client).
 *
 * RBAC is enforced server-side; this client is UI plumbing:
 *  - create               → owner only
 *  - addableUsers(group)  → admin;  addableUsers(site-only) → owner (pre-create)
 *  - addMembers / remove / patch → admin (last-admin guard → 409)
 *  - removeMember(self)   → any member (leave)
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---------------------------------------------------------------------------
// Wire types (snake_case — mirror the backend JSON shapes)
// ---------------------------------------------------------------------------

export type MemberRole = 'admin' | 'member'

export interface GroupMember {
  user_id: string
  name: string | null
  role: MemberRole
  /** Renders a "client" cue in the roster + thread. */
  is_homeowner: boolean
}

export interface Group {
  id: string
  name: string | null
  /** null = company-wide, talk-only, crew-only group. */
  site_id: string | null
  archived: boolean
  members: GroupMember[]
}

export interface AddableUser {
  user_id: string
  name: string | null
  role: string
  /** Already in the group — the picker shows it checked + disabled. */
  already_member: boolean
}

export interface GroupCreateBody {
  name: string
  site_id?: string | null
  member_user_ids: string[]
}

export interface GroupPatchBody {
  name?: string
  archived?: boolean
  member_role?: { user_id: string; role: MemberRole }
}

// ---------------------------------------------------------------------------
// Internal fetch helper — mirrors api/chat.ts exactly
// ---------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// groupsApi
// ---------------------------------------------------------------------------

export const groupsApi = {
  /** Owner creates a group (and becomes its first admin). */
  create(body: GroupCreateBody): Promise<Group> {
    return request<Group>('/api/v1/chat/groups', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Users the caller may add. Pass `groupId` for the manage "add" picker
   * (admin-gated, flags `already_member`); pass only `siteId` for the pre-create
   * picker (owner-gated). Omitting `siteId` returns company crew only.
   */
  addableUsers(opts: { siteId?: string; groupId?: string } = {}): Promise<AddableUser[]> {
    const q = new URLSearchParams()
    if (opts.siteId) q.set('site_id', opts.siteId)
    if (opts.groupId) q.set('group_id', opts.groupId)
    const qs = q.toString()
    return request<AddableUser[]>(`/api/v1/chat/groups/addable-users${qs ? `?${qs}` : ''}`)
  },

  /** Any member may read the roster. */
  members(groupId: string): Promise<{ members: GroupMember[] }> {
    return request<{ members: GroupMember[] }>(`/api/v1/chat/groups/${groupId}/members`)
  },

  /** Admin adds members (idempotent; foreign/unknown ids skipped server-side). */
  addMembers(groupId: string, userIds: string[]): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
    })
  },

  /** Admin removes anyone; a member removes themselves (leave). 409 = last admin. */
  removeMember(groupId: string, userId: string): Promise<void> {
    return request<void>(`/api/v1/chat/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  /** Admin renames / archives / promotes / demotes. 409 = would strand 0 admins. */
  patch(groupId: string, body: GroupPatchBody): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
}
