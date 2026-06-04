// Approvals & notifications API layer.
//
// Self-contained (the shared client.ts / types.ts are read-only): reuses
// API_BASE / ApiError / getToken by import only, and declares its own request
// helper + types so the 7-way merge stays clean. Mirrors the backend JSON
// shapes (snake_case) under /api/v1/approvals and /api/v1/notifications.
import { ApiError } from './client'
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'

// ---- types (mirror backend) ----------------------------------------------

export type DecisionKind =
  | 'approval'
  | 'homeowner_question'
  | 'hold_payment'
  | 'generic'

export type DecisionState =
  | 'pending'
  | 'acknowledged'
  | 'resolved'
  | 'rejected'
  | 'escalated'

export interface Decision {
  id: string
  company_id: string
  site_id: string | null
  kind: DecisionKind
  title: string
  detail: string | null
  raised_by: string | null
  assigned_to: string | null
  state: DecisionState
  sla_due_at: string | null
  resolved_at: string | null
  resolution_note: string | null
  evidence_event_ids: string[]
  created_at: string
  updated_at: string
}

export interface Paginated<T> {
  items: T[]
  next_cursor: string | null
}

export interface BatchResult {
  updated: string[]
  skipped: string[]
}

export interface AppNotification {
  id: string
  company_id: string
  recipient_id: string
  role: string | null
  decision_id: string | null
  site_id: string | null
  kind: string
  title: string
  body: string | null
  severity: 'risk' | 'warn' | 'info' | string
  read_at: string | null
  created_at: string
}

// ---- request helper -------------------------------------------------------

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
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev) -------------------------------------

const mockDecisions: Decision[] = [
  {
    id: 'dec-1',
    company_id: 'co-1',
    site_id: 'site-1',
    kind: 'homeowner_question',
    title: 'Homeowner asks: when will the slab be poured?',
    detail: 'Asked via WhatsApp at 09:14. SLA: respond within 24h.',
    raised_by: null,
    assigned_to: 'owner-1',
    state: 'escalated',
    sla_due_at: '2026-05-28T09:14:00Z',
    resolved_at: null,
    resolution_note: null,
    evidence_event_ids: ['evt-1'],
    created_at: '2026-05-27T09:14:00Z',
    updated_at: '2026-05-28T09:14:00Z',
  },
  {
    id: 'dec-2',
    company_id: 'co-1',
    site_id: 'site-1',
    kind: 'approval',
    title: 'Approve extra 50 bags of cement (₹17,500)',
    detail: 'Supervisor raised a shortfall against today’s pour.',
    raised_by: null,
    assigned_to: null,
    state: 'pending',
    sla_due_at: null,
    resolved_at: null,
    resolution_note: null,
    evidence_event_ids: ['evt-2', 'evt-3'],
    created_at: '2026-05-29T07:02:00Z',
    updated_at: '2026-05-29T07:02:00Z',
  },
]

// Stateful notification fixtures (W3.3) so the no-backend tour shows a *live*
// bell: a badge that ticks down as rows are read. `markRead` flips `read_at`,
// `unreadCount` derives from it — exactly like the real endpoints.
const mockNotifications: AppNotification[] = [
  {
    id: 'ntf-1',
    company_id: 'co-1',
    recipient_id: 'owner-1',
    role: 'owner',
    decision_id: 'dec-2',
    site_id: 'site-1',
    kind: 'approval_pending',
    title: 'Cement shortfall needs your approval (₹17,500)',
    body: 'Tower B · supervisor raised a shortfall against today’s pour.',
    severity: 'risk',
    read_at: null,
    created_at: '2026-06-04T07:02:00Z',
  },
  {
    id: 'ntf-2',
    company_id: 'co-1',
    recipient_id: 'owner-1',
    role: 'owner',
    decision_id: 'dec-1',
    site_id: 'site-1',
    kind: 'homeowner_question',
    title: 'Homeowner asked when the slab will be poured',
    body: 'Villa A · awaiting your reply (SLA 24h).',
    severity: 'warn',
    read_at: null,
    created_at: '2026-06-04T06:10:00Z',
  },
  {
    id: 'ntf-3',
    company_id: 'co-1',
    recipient_id: 'owner-1',
    role: 'owner',
    decision_id: null,
    site_id: 'site-2',
    kind: 'dpr_ready',
    title: 'Daily progress report is ready to review',
    body: 'Tower B · 96% confidence — review before it goes to the homeowner.',
    severity: 'info',
    read_at: '2026-06-03T18:00:00Z',
    created_at: '2026-06-03T17:30:00Z',
  },
]

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function applyMock(id: string, state: DecisionState): Decision {
  const d = mockDecisions.find((x) => x.id === id)
  if (!d) throw new ApiError(404, 'Decision not found')
  d.state = state
  d.updated_at = new Date().toISOString()
  if (state === 'resolved' || state === 'rejected')
    d.resolved_at = d.updated_at
  return { ...d }
}

// ---- public surface -------------------------------------------------------

export const approvalsApi = {
  async list(state?: DecisionState): Promise<Paginated<Decision>> {
    if (USE_MOCKS) {
      await delay()
      const items = state
        ? mockDecisions.filter((d) => d.state === state)
        : [...mockDecisions]
      return { items, next_cursor: null }
    }
    const q = state ? `?state=${encodeURIComponent(state)}` : ''
    return request<Paginated<Decision>>(`/api/v1/approvals${q}`)
  },

  async approve(id: string, note?: string): Promise<Decision> {
    if (USE_MOCKS) {
      await delay()
      return applyMock(id, 'resolved')
    }
    return request<Decision>(`/api/v1/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    })
  },

  async reject(id: string, note?: string): Promise<Decision> {
    if (USE_MOCKS) {
      await delay()
      return applyMock(id, 'rejected')
    }
    return request<Decision>(`/api/v1/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    })
  },

  async assign(id: string, assignedTo: string): Promise<Decision> {
    if (USE_MOCKS) {
      await delay()
      const d = applyMock(id, mockDecisions.find((x) => x.id === id)!.state)
      d.assigned_to = assignedTo
      return d
    }
    return request<Decision>(`/api/v1/approvals/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to: assignedTo }),
    })
  },

  async batch(
    action: 'resolve' | 'reject' | 'acknowledge',
    ids: string[],
    note?: string,
  ): Promise<BatchResult> {
    if (USE_MOCKS) {
      await delay()
      const target: DecisionState =
        action === 'resolve'
          ? 'resolved'
          : action === 'reject'
            ? 'rejected'
            : 'acknowledged'
      ids.forEach((id) => applyMock(id, target))
      return { updated: ids, skipped: [] }
    }
    return request<BatchResult>(`/api/v1/approvals/batch/${action}`, {
      method: 'POST',
      body: JSON.stringify({ ids, note: note ?? null }),
    })
  },

  async runSlaSweep(): Promise<{ escalated: string[] }> {
    if (USE_MOCKS) {
      await delay()
      return { escalated: [] }
    }
    return request<{ escalated: string[] }>('/api/v1/approvals/sla/sweep', {
      method: 'POST',
    })
  },

  async notifications(): Promise<AppNotification[]> {
    if (USE_MOCKS) {
      await delay()
      return mockNotifications.map((n) => ({ ...n }))
    }
    return request<AppNotification[]>('/api/v1/notifications')
  },

  async unreadCount(): Promise<number> {
    if (USE_MOCKS) {
      await delay()
      return mockNotifications.filter((n) => n.read_at === null).length
    }
    const r = await request<{ unread: number }>(
      '/api/v1/notifications/unread-count',
    )
    return r.unread
  },

  async markRead(id: string): Promise<void> {
    if (USE_MOCKS) {
      await delay()
      const n = mockNotifications.find((x) => x.id === id)
      if (n && n.read_at === null) n.read_at = new Date().toISOString()
      return
    }
    await request<void>(`/api/v1/notifications/${id}/read`, { method: 'POST' })
  },
}
