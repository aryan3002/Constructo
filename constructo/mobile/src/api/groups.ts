/**
 * Groups API (doc 18 Phase 2) — a named multi-party thread scoped to a site,
 * with admin/member roles and a possible homeowner participant. Wraps
 * `GET/POST/PATCH/DELETE /api/v1/chat/groups*` via the shared {@link request}
 * helper (never edits the client). A group conversation is addressed by its own
 * id (`conversation_id`) in messages/read/send — see {@link chatApi}.
 */
import { request } from './client'

export type MemberRole = 'admin' | 'member'

/** One participant in a group — the homeowner flag drives a thread cue. */
export interface GroupMember {
  user_id: string
  name: string | null
  role: MemberRole
  is_homeowner: boolean
}

/** A group thread. `site_id` scopes it; `name` is the title shown in the inbox. */
export interface Group {
  id: string
  name: string | null
  site_id: string | null
  archived: boolean
  members: GroupMember[]
}

/** A site user the caller may add to a group (deduped by `already_member`). */
export interface AddableUser {
  user_id: string
  name: string | null
  role: string
  already_member: boolean
}

export const groupsApi = {
  /** Create a group on a site with an initial member set (caller is admin). */
  create(body: { name: string; site_id: string; member_user_ids: string[] }): Promise<Group> {
    return request<Group>('/api/v1/chat/groups', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** The group's current roster (name + role + homeowner flag). */
  members(id: string): Promise<{ members: GroupMember[] }> {
    return request<{ members: GroupMember[] }>(`/api/v1/chat/groups/${id}/members`)
  },

  /** Add users to a group; returns the refreshed group. */
  addMembers(id: string, userIds: string[]): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
    })
  },

  /** Remove a single member (returns 204). */
  removeMember(id: string, userId: string): Promise<void> {
    return request<void>(`/api/v1/chat/groups/${id}/members/${userId}`, {
      method: 'DELETE',
    })
  },

  /** Rename / archive a group, or change a member's role. */
  patch(
    id: string,
    body: { name?: string; archived?: boolean; member_role?: { user_id: string; role: MemberRole } },
  ): Promise<Group> {
    return request<Group>(`/api/v1/chat/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  /** Site users addable to a group (optionally excluding an existing group's members). */
  addableUsers(siteId: string, groupId?: string): Promise<AddableUser[]> {
    const q = new URLSearchParams({ site_id: siteId })
    if (groupId) q.set('group_id', groupId)
    return request<AddableUser[]>(`/api/v1/chat/groups/addable-users?${q.toString()}`)
  },
}
