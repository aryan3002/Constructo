/**
 * Action-items API client for Constructo web (Phase D).
 *
 * Site-scoped to-dos (some AI-created via Nivaan). Full CRUD + status
 * transitions per the backend `app/action_items/router.py`. Same local
 * `request<T>` convention as `api/chat.ts`.
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

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

export interface ActionItemCreate {
  site_id: string
  title: string
  detail?: string
  assignee_id?: string
  due_on?: string
  source_message_id?: string
}

export interface ActionItemPatch {
  title?: string
  detail?: string
  assignee_id?: string | null
  due_on?: string | null
  status?: ActionItemStatus
}

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

export const actionItemsApi = {
  /** Site to-dos. `status` filters; `mine` limits to the caller's assignments. */
  list(siteId: string, opts: { status?: ActionItemStatus; mine?: boolean } = {}): Promise<ActionItem[]> {
    const q = new URLSearchParams({ site_id: siteId })
    if (opts.status) q.set('status', opts.status)
    if (opts.mine) q.set('mine', 'true')
    return request<ActionItem[]>(`/api/v1/action-items?${q.toString()}`)
  },

  create(body: ActionItemCreate): Promise<ActionItem> {
    return request<ActionItem>('/api/v1/action-items', { method: 'POST', body: JSON.stringify(body) })
  },

  update(id: string, patch: ActionItemPatch): Promise<ActionItem> {
    return request<ActionItem>(`/api/v1/action-items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  /** Soft-cancel (→ status cancelled). */
  remove(id: string): Promise<ActionItem> {
    return request<ActionItem>(`/api/v1/action-items/${id}`, { method: 'DELETE' })
  },
}
