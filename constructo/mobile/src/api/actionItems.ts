/**
 * Action Items API (Phase 1.6 manual + 2.7 AI-detected). A task lifted from a
 * message (or created standalone) with an owner, a status, and a due date.
 * Distinct from a Decision (an approve/comment act). AI-detected items arrive
 * `created_by_ai=true` ("added by Nivaan") and any user can edit/complete them.
 */
import { request } from './client'

export type ActionItemStatus = 'open' | 'done' | 'cancelled'

export interface ActionItem {
  id: string
  site_id: string
  title: string
  detail: string | null
  status: ActionItemStatus
  created_by: string | null
  created_by_ai: boolean
  assignee_id: string | null
  due_on: string | null
  source_message_id: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

const qs = (params: Record<string, string | undefined>): string => {
  const e = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return e.length ? '?' + new URLSearchParams(e).toString() : ''
}

export const actionItemsApi = {
  /** A site's action items (open first, then by due date). */
  list(siteId: string, opts: { status?: ActionItemStatus; mine?: boolean } = {}) {
    return request<ActionItem[]>(
      `/api/v1/action-items${qs({
        site_id: siteId,
        status: opts.status,
        mine: opts.mine ? 'true' : undefined,
      })}`,
    )
  },

  /** Create a to-do (manual). `source_message_id` links it back to a chat msg. */
  create(body: {
    site_id: string
    title: string
    detail?: string
    assignee_id?: string
    due_on?: string
    source_message_id?: string
  }) {
    return request<ActionItem>('/api/v1/action-items', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Edit / complete / cancel an item (any user; the change is event-logged). */
  update(
    id: string,
    body: { title?: string; detail?: string; assignee_id?: string; due_on?: string; status?: ActionItemStatus },
  ) {
    return request<ActionItem>(`/api/v1/action-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
}
