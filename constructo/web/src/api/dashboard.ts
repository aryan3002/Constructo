// Owner Home dashboard API surface (Phase B, feature: brief/owner).
//
// Read-only aggregation (`GET /dashboard/home`) plus the inline decision write
// path (`POST /dashboard/decisions`). Reuses the shared client primitives
// (API_BASE, ApiError, getToken) by import only — it does NOT modify them.
import { API_BASE, USE_MOCKS } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---- wire types (snake_case, mirror the backend) --------------------------

export type DashStatus = 'ok' | 'warn' | 'risk' | 'info'
export type PulseKind = 'cash' | 'labor' | 'material' | 'progress'

export interface DashRisk {
  site_id: string
  kind: string
  severity: string
  status: DashStatus
  message: string
  evidence_event_ids: string[]
}

export interface PulseTile {
  kind: PulseKind
  status: DashStatus
  value: number | null
  evidence_event_ids: string[]
  facts: Record<string, number | null>
}

export interface SiteCard {
  site_id: string
  name: string
  status: DashStatus
  expected_headcount: number | null
  top_risks: DashRisk[]
  risk_overflow: number
  counts: {
    attendance: number
    deliveries: number
    issues: number
    total: number
  }
  pulse: PulseTile[]
}

export interface SetupStep {
  key: string
  done: boolean
  title_key: string
}

export interface OwnerHome {
  brief_date: string
  needs_attention_count: number
  sites_total: number
  sites_needing_attention: number
  cold_start: boolean
  setup_checklist: SetupStep[]
  sites: SiteCard[]
}

export type DecisionAction = 'approve' | 'hold' | 'assign'

export interface CreateDecisionRequest {
  site_id?: string | null
  action: DecisionAction
  title: string
  detail?: string | null
  assigned_to?: string | null
  evidence_event_ids?: string[]
  /**
   * Client-generated idempotency key (CA8). Sent so a duplicate of the same
   * owner action (e.g. the chip + the mirrored WhatsApp action) reconciles to
   * "already actioned" instead of double-acting.
   *
   * KNOWN GAP (W1): the backend does not yet persist or de-dupe on this field,
   * so true idempotency is NOT in force — see the W1 wave notes / PR. We send it
   * anyway so the client seam is ready the moment the server lands it.
   */
  client_decision_id?: string
}

export interface DecisionResponse {
  id: string
  company_id: string
  site_id: string | null
  kind: string
  state: string
  title: string
  detail: string | null
  assigned_to: string | null
  evidence_event_ids: string[]
  created_at: string
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
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev — only when VITE_USE_MOCKS=true) -------
//
// Lets the Owner Command Center render all three columns without a backend
// (the owner home aggregation otherwise needs Postgres). Set
// localStorage['cstk.mock.fail_decision'] = '1' to force the next decision to
// 500 — used to smoke optimistic rollback in a real browser (W1 DoD).
const mockHome: OwnerHome = {
  brief_date: '2026-05-28',
  needs_attention_count: 3,
  sites_total: 4,
  sites_needing_attention: 2,
  cold_start: false,
  setup_checklist: [],
  sites: [
    {
      site_id: 'site-tower-b',
      name: 'Tower B',
      status: 'risk',
      expected_headcount: 24,
      top_risks: [
        {
          site_id: 'site-tower-b',
          kind: 'unverified_invoice',
          severity: 'high',
          status: 'risk',
          message: 'Steel invoice ₹2,40,000 has no matching delivery',
          evidence_event_ids: ['evt-inv-44', 'evt-grn-12'],
        },
        {
          site_id: 'site-tower-b',
          kind: 'labor_shortfall',
          severity: 'high',
          status: 'risk',
          message: 'Only 9 of 24 expected workers marked present',
          evidence_event_ids: ['evt-att-91'],
        },
      ],
      risk_overflow: 0,
      counts: { attendance: 9, deliveries: 2, issues: 1, total: 12 },
      pulse: [
        { kind: 'cash', status: 'warn', value: 2, evidence_event_ids: ['evt-inv-44'], facts: { invoices: 2, payment_requests: 1 } },
        { kind: 'labor', status: 'risk', value: 9, evidence_event_ids: ['evt-att-91'], facts: { attendance: 9 } },
        { kind: 'material', status: 'ok', value: 2, evidence_event_ids: ['evt-grn-12'], facts: { deliveries: 2, invoices: 2 } },
        { kind: 'progress', status: 'info', value: 3, evidence_event_ids: [], facts: { progress_updates: 3, issues: 1 } },
      ],
    },
    {
      site_id: 'site-villa-a',
      name: 'Villa A',
      status: 'warn',
      expected_headcount: 12,
      top_risks: [
        {
          site_id: 'site-villa-a',
          kind: 'pending_approval',
          severity: 'med',
          status: 'warn',
          message: 'Extra 50 cement bags pending your approval (₹17,500)',
          evidence_event_ids: ['evt-req-7'],
        },
      ],
      risk_overflow: 0,
      counts: { attendance: 11, deliveries: 1, issues: 0, total: 12 },
      pulse: [
        { kind: 'cash', status: 'warn', value: 1, evidence_event_ids: ['evt-req-7'], facts: { invoices: 0, payment_requests: 1 } },
        { kind: 'labor', status: 'ok', value: 11, evidence_event_ids: [], facts: { attendance: 11 } },
        { kind: 'material', status: 'ok', value: 1, evidence_event_ids: [], facts: { deliveries: 1, invoices: 0 } },
        { kind: 'progress', status: 'ok', value: 2, evidence_event_ids: [], facts: { progress_updates: 2, issues: 0 } },
      ],
    },
    {
      site_id: 'site-plaza',
      name: 'City Plaza',
      status: 'ok',
      expected_headcount: 18,
      top_risks: [],
      risk_overflow: 0,
      counts: { attendance: 18, deliveries: 0, issues: 0, total: 18 },
      pulse: [
        { kind: 'cash', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
        { kind: 'labor', status: 'ok', value: 18, evidence_event_ids: [], facts: { attendance: 18 } },
        { kind: 'material', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
        { kind: 'progress', status: 'ok', value: 1, evidence_event_ids: [], facts: { progress_updates: 1, issues: 0 } },
      ],
    },
    {
      site_id: 'site-greens',
      name: 'The Greens',
      status: 'ok',
      expected_headcount: 8,
      top_risks: [],
      risk_overflow: 0,
      counts: { attendance: 8, deliveries: 1, issues: 0, total: 9 },
      pulse: [
        { kind: 'cash', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
        { kind: 'labor', status: 'ok', value: 8, evidence_event_ids: [], facts: { attendance: 8 } },
        { kind: 'material', status: 'ok', value: 1, evidence_event_ids: [], facts: { deliveries: 1, invoices: 0 } },
        { kind: 'progress', status: 'ok', value: 1, evidence_event_ids: [], facts: { progress_updates: 1, issues: 0 } },
      ],
    },
  ],
}

const mockDelay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// In-memory record of decisions made this dev session, so the mock backend
// behaves like the real one: a resolved exception stays gone after the
// `onSettled` refetch (honest optimism), rather than bouncing back every poll.
const mockResolved = new Set<string>()
const resolvedKey = (siteId: string | null | undefined, title: string) =>
  `${siteId ?? ''}::${title}`

function mockHomeView(): OwnerHome {
  const home = structuredClone(mockHome)
  for (const site of home.sites) {
    site.top_risks = site.top_risks.filter(
      (r) => !mockResolved.has(resolvedKey(site.site_id, r.message)),
    )
  }
  home.needs_attention_count = home.sites.reduce(
    (n, s) => n + s.top_risks.length,
    0,
  )
  home.sites_needing_attention = home.sites.filter(
    (s) => s.top_risks.length > 0,
  ).length
  return home
}

export const dashboardApi = {
  async getHome(date: string): Promise<OwnerHome> {
    if (USE_MOCKS) {
      await mockDelay()
      return mockHomeView()
    }
    return request<OwnerHome>(
      `/api/v1/dashboard/home?date=${encodeURIComponent(date)}`,
    )
  },

  async createDecision(
    body: CreateDecisionRequest,
  ): Promise<DecisionResponse> {
    if (USE_MOCKS) {
      await mockDelay(350)
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('cstk.mock.fail_decision') === '1'
      ) {
        throw new ApiError(500, 'Forced failure (mock) — proving rollback')
      }
      // Record the resolution so the next getHome reflects it (stateful mock).
      mockResolved.add(resolvedKey(body.site_id, body.title))
      return {
        id: body.client_decision_id ?? 'mock-decision',
        company_id: 'mock-co',
        site_id: body.site_id ?? null,
        kind: body.action,
        state: 'pending',
        title: body.title,
        detail: body.detail ?? null,
        assigned_to: body.assigned_to ?? null,
        evidence_event_ids: body.evidence_event_ids ?? [],
        created_at: new Date().toISOString(),
      }
    }
    return request<DecisionResponse>('/api/v1/dashboard/decisions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
