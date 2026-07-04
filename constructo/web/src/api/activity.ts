// Owner activity stream API surface (activity-first Command Center).
//
// Read-only union feed: GET /api/v1/activity?site_id&cursor&limit → one page of
// ActivityItem rows + the hero summary counts + a keyset next_cursor. Self-
// contained (reuses API_BASE / ApiError / getToken by import only, like the
// sibling dashboard.ts / approvals.ts modules).
import { API_BASE, USE_MOCKS } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---- wire types (snake_case, mirror the backend) --------------------------

export type ActivityKind =
  | 'photo_shared'
  | 'update_posted'
  | 'milestone_reached'
  | 'weekly_summary'
  | 'scope_change'
  | 'homeowner_request'
  | 'decision_made'
  | 'site_health_flag'

export type ActivitySeverity = 'info' | 'success' | 'warning'

export type ActivityLinkType =
  | 'feed_photo'
  | 'update'
  | 'milestone'
  | 'request'
  | 'decision'
  | 'finding'

export interface ActivityLink {
  type: ActivityLinkType
  id: string
  scroll_message_id?: string | null
}

export interface ActivityItem {
  /** "{kind}:{row_uuid}" — stable, cross-source unique. */
  id: string
  kind: ActivityKind
  site_id: string
  site_name: string
  title: string
  subtitle: string | null
  occurred_at: string
  actor: string | null
  link: ActivityLink
  severity: ActivitySeverity
}

export interface ActivitySummary {
  updates_today: number
  needs_decision_count: number
  sites_total: number
}

export interface ActivityPage {
  items: ActivityItem[]
  summary: ActivitySummary
  next_cursor: string | null
}

// ---- request helper (mirrors client.ts; uses the shared primitives) -------

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

// ---- mock fixtures (network-free dev — only when VITE_USE_MOCKS=true) ------
//
// Lets the activity-first OwnerHome render its whole stream without a backend
// (the union query otherwise needs Postgres). Ordered newest-first; the mock
// page() slices by an occurred_at keyset cursor exactly like the real endpoint
// (the real cursor is an opaque base64 token — see backend
// app/activity/router.py encode_activity_cursor — but the mock only needs to
// round-trip its own cursor values, so a raw occurred_at string works fine).
const MOCK_SITES: Record<string, string> = {
  'site-tower-b': 'Tower B',
  'site-villa-a': 'Villa A',
  'site-plaza': 'City Plaza',
}

const mockItems: ActivityItem[] = [
  {
    id: 'photo_shared:11111111-0000-0000-0000-000000000001',
    kind: 'photo_shared',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'New site photo shared',
    subtitle: 'Slab shuttering, east face',
    occurred_at: '2026-07-03T09:40:00Z',
    actor: 'Suresh (supervisor)',
    link: {
      type: 'feed_photo',
      id: '11111111-0000-0000-0000-000000000001',
      scroll_message_id: 'msg-photo-1',
    },
    severity: 'success',
  },
  {
    id: 'homeowner_request:22222222-0000-0000-0000-000000000002',
    kind: 'homeowner_request',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Homeowner asked for a photo of the kitchen',
    subtitle: 'Overdue — 4 days',
    occurred_at: '2026-07-03T08:10:00Z',
    actor: 'Homeowner',
    link: { type: 'request', id: '22222222-0000-0000-0000-000000000002' },
    severity: 'warning',
  },
  {
    id: 'update_posted:33333333-0000-0000-0000-000000000003',
    kind: 'update_posted',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'Daily update published',
    subtitle: '9 workers · 2 deliveries',
    occurred_at: '2026-07-03T07:05:00Z',
    actor: 'Anita (PM)',
    link: { type: 'update', id: 'site-tower-b' },
    severity: 'info',
  },
  {
    id: 'milestone_reached:44444444-0000-0000-0000-000000000004',
    kind: 'milestone_reached',
    site_id: 'site-plaza',
    site_name: 'City Plaza',
    title: 'Milestone reached: Ground floor slab',
    subtitle: null,
    occurred_at: '2026-07-02T16:20:00Z',
    actor: null,
    link: { type: 'milestone', id: 'site-plaza' },
    severity: 'success',
  },
  {
    id: 'decision_made:55555555-0000-0000-0000-000000000005',
    kind: 'decision_made',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Approved: extra 50 bags cement (₹17,500)',
    subtitle: null,
    occurred_at: '2026-07-02T11:00:00Z',
    actor: 'You',
    link: { type: 'decision', id: '55555555-0000-0000-0000-000000000005' },
    severity: 'info',
  },
  {
    id: 'site_health_flag:66666666-0000-0000-0000-000000000006',
    kind: 'site_health_flag',
    site_id: 'site-tower-b',
    site_name: 'Tower B',
    title: 'Site Health flag: schedule drift',
    subtitle: 'Slab pour 3 days behind baseline',
    occurred_at: '2026-07-02T06:00:00Z',
    actor: null,
    link: { type: 'finding', id: 'site-tower-b' },
    severity: 'warning',
  },
  {
    id: 'weekly_summary:77777777-0000-0000-0000-000000000007',
    kind: 'weekly_summary',
    site_id: 'site-plaza',
    site_name: 'City Plaza',
    title: 'Weekly summary ready',
    subtitle: 'Week of 23 Jun',
    occurred_at: '2026-06-30T04:00:00Z',
    actor: null,
    link: { type: 'update', id: 'site-plaza' },
    severity: 'info',
  },
  {
    id: 'scope_change:88888888-0000-0000-0000-000000000008',
    kind: 'scope_change',
    site_id: 'site-villa-a',
    site_name: 'Villa A',
    title: 'Scope change logged: added powder room',
    subtitle: null,
    occurred_at: '2026-06-29T13:30:00Z',
    actor: 'Architect',
    link: { type: 'update', id: 'site-villa-a' },
    severity: 'info',
  },
]

const mockSummary: ActivitySummary = {
  updates_today: 3,
  needs_decision_count: 1,
  sites_total: Object.keys(MOCK_SITES).length,
}

const mockDelay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

/** Mock keyset page: rows strictly older than `cursor` (an occurred_at iso). */
function mockPage(opts: { siteId?: string; cursor?: string; limit?: number }): ActivityPage {
  const limit = opts.limit ?? 20
  let rows = [...mockItems].sort(
    (a, b) => b.occurred_at.localeCompare(a.occurred_at),
  )
  if (opts.siteId) rows = rows.filter((r) => r.site_id === opts.siteId)
  if (opts.cursor) rows = rows.filter((r) => r.occurred_at < opts.cursor!)
  const pageRows = rows.slice(0, limit)
  const next =
    rows.length > limit ? pageRows[pageRows.length - 1].occurred_at : null
  return { items: pageRows, summary: mockSummary, next_cursor: next }
}

// ---- public surface -------------------------------------------------------

export const activityApi = {
  async page(
    opts: { siteId?: string; cursor?: string; limit?: number } = {},
  ): Promise<ActivityPage> {
    if (USE_MOCKS) {
      await mockDelay()
      return mockPage(opts)
    }
    const params = new URLSearchParams()
    if (opts.siteId) params.set('site_id', opts.siteId)
    if (opts.cursor) params.set('cursor', opts.cursor)
    params.set('limit', String(opts.limit ?? 20))
    return request<ActivityPage>(`/api/v1/activity?${params.toString()}`)
  },
}
