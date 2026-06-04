// Reconciliation API layer (owned by the `reconcile` feature).
//
// Reuses the shared client primitives (API_BASE / ApiError / getToken) by
// IMPORT ONLY — it does not modify them. Kept dependency-free so a future React
// Native app can reuse these types verbatim.
import { ApiError } from './client'
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'

export type ReconcileStatus =
  | 'matched'
  | 'mismatch'
  | 'missing_proof'
  | 'needs_approval'

/** A fetchable proof document for one side — challan photo or invoice PDF. */
export interface Proof {
  url: string
  kind: string // image | document | voice | video | text
  mime: string | null
  message_id: string
}

export interface ReconcileEventSide {
  event_id: string
  occurred_on: string
  vendor: string | null
  material: string | null
  quantity: number | null
  unit?: string | null
  amount?: number | null
  currency?: string | null
  invoice_number?: string | null
  summary: string
  confidence: number
  source_message_ids: string[]
  proofs?: Proof[]
}

/** Thrown by the Tally export when the server demands a fresh OTP step-up. */
export class StepUpRequiredError extends Error {
  constructor() {
    super('step_up_required')
    this.name = 'StepUpRequiredError'
  }
}

export interface ReconcileItem {
  key: string
  status: ReconcileStatus
  vendor: string | null
  item: string | null
  site_id: string
  amount_at_risk: number
  reasons: string[]
  delivery: ReconcileEventSide | null
  invoice: ReconcileEventSide | null
}

export interface ReconcileSummary {
  matched: number
  mismatch: number
  missing_proof: number
  needs_approval: number
  total_amount_at_risk: number
}

export interface ReconcileList {
  site_id: string
  summary: ReconcileSummary
  items: ReconcileItem[]
}

export interface GrnDraft {
  delivery_event_id: string
  site_id: string
  received_on: string
  vendor: string | null
  material: string | null
  quantity: number | null
  unit: string | null
  reference: string
  note: string
}

export interface HoldPaymentRequest {
  invoice_event_id?: string | null
  delivery_event_id?: string | null
  amount_at_risk?: number
  note?: string | null
  /**
   * Idempotency key (CA8): a re-fired hold (button + the H key, or a retry)
   * reconciles to one decision. KNOWN GAP: `/reconcile/hold-payment` does not
   * yet de-dupe on it server-side (only `/dashboard/decisions` does, PR #47) —
   * the seam is sent so the backend can honor it without a client change.
   */
  client_decision_id?: string
}

export interface HoldPaymentResponse {
  decision_id: string
  state: string
  title: string
  assigned_to: string | null
  site_id: string | null
  amount_at_risk: number
  created_at: string
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
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev — only when VITE_USE_MOCKS=true) -------
function mockReconcileList(siteId: string): ReconcileList {
  const side = (
    over: Partial<ReconcileEventSide> & { event_id: string; summary: string },
  ): ReconcileEventSide => ({
    occurred_on: '2026-06-01',
    vendor: 'Steel Junction',
    material: 'TMT bars',
    quantity: null,
    confidence: 0.9,
    source_message_ids: [],
    proofs: [],
    ...over,
  })
  const items: ReconcileItem[] = [
    {
      key: 'd1:i1',
      status: 'needs_approval',
      vendor: 'Steel Junction',
      item: 'TMT bars',
      site_id: siteId,
      amount_at_risk: 240000,
      reasons: ['amount_variance'],
      delivery: side({
        event_id: 'd1',
        summary: '8 ton TMT received',
        quantity: 8,
        unit: 'ton',
        proofs: [
          { url: 'https://picsum.photos/seed/challan/240', kind: 'image', mime: 'image/jpeg', message_id: 'm1' },
        ],
      }),
      invoice: side({
        event_id: 'i1',
        summary: 'Invoice INV-44 ₹2,40,000',
        amount: 240000,
        invoice_number: 'INV-44',
        proofs: [
          { url: 'https://example.com/inv-44.pdf', kind: 'document', mime: 'application/pdf', message_id: 'm2' },
        ],
      }),
    },
    {
      key: 'd2:i2',
      status: 'mismatch',
      vendor: 'ACC Cement',
      item: 'Cement',
      site_id: siteId,
      amount_at_risk: 17500,
      reasons: ['quantity_variance'],
      delivery: side({ event_id: 'd2', vendor: 'ACC Cement', material: 'Cement', summary: '100 bags', quantity: 100, unit: 'bag' }),
      invoice: side({ event_id: 'i2', vendor: 'ACC Cement', material: 'Cement', summary: 'Invoice ₹35,000', amount: 35000, invoice_number: 'INV-12' }),
    },
    {
      key: 'd3:',
      status: 'missing_proof',
      vendor: 'Bansal Hardware',
      item: 'Fittings',
      site_id: siteId,
      amount_at_risk: 0,
      reasons: ['no_invoice'],
      delivery: side({ event_id: 'd3', vendor: 'Bansal Hardware', material: 'Fittings', summary: 'Fittings received' }),
      invoice: null,
    },
    {
      key: 'd4:i4',
      status: 'matched',
      vendor: 'UltraTech',
      item: 'Cement',
      site_id: siteId,
      amount_at_risk: 0,
      reasons: [],
      delivery: side({ event_id: 'd4', vendor: 'UltraTech', material: 'Cement', summary: '50 bags', quantity: 50, unit: 'bag' }),
      invoice: side({ event_id: 'i4', vendor: 'UltraTech', material: 'Cement', summary: 'Invoice ₹17,500', amount: 17500, invoice_number: 'INV-9' }),
    },
  ]
  return {
    site_id: siteId,
    summary: { matched: 1, mismatch: 1, missing_proof: 1, needs_approval: 1, total_amount_at_risk: 257500 },
    items,
  }
}

const mockDelay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

export const reconcileApi = {
  async list(siteId: string, windowDays?: number): Promise<ReconcileList> {
    if (USE_MOCKS) {
      await mockDelay()
      return mockReconcileList(siteId)
    }
    const q =
      windowDays != null ? `?window_days=${encodeURIComponent(windowDays)}` : ''
    return request<ReconcileList>(
      `/api/v1/reconcile/sites/${encodeURIComponent(siteId)}${q}`,
    )
  },

  /**
   * Export a site's reconciliation as Tally CSV text. Requires a fresh step-up
   * token (irreversible egress). Throws `StepUpRequiredError` on a 403
   * `step_up_required` so the caller can prompt for the OTP and retry.
   */
  async exportTally(siteId: string, stepUpToken: string | null): Promise<string> {
    if (USE_MOCKS) {
      await mockDelay()
      // Keep the gate honest in dev: no step-up token → demand re-verification.
      if (!stepUpToken) throw new StepUpRequiredError()
      const l = mockReconcileList(siteId)
      const rows = l.items.map(
        (it) => `${it.key},${it.status},${it.vendor ?? ''},${it.item ?? ''},${it.amount_at_risk}`,
      )
      return ['key,status,vendor,item,amount_at_risk', ...rows].join('\n')
    }
    const headers = new Headers({ 'Content-Type': 'application/json' })
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (stepUpToken) headers.set('X-Step-Up-Token', stepUpToken)

    const res = await fetch(
      `${API_BASE}/api/v1/reconcile/export/tally?site_id=${encodeURIComponent(siteId)}`,
      { headers },
    )
    if (res.status === 403) {
      let code = ''
      try {
        const body = await res.json()
        code = body?.error?.code ?? ''
      } catch {
        /* non-JSON */
      }
      if (code === 'step_up_required') throw new StepUpRequiredError()
      throw new ApiError(403, 'Forbidden')
    }
    if (!res.ok) throw new ApiError(res.status, res.statusText)
    return res.text()
  },

  async grnDraft(deliveryEventId: string): Promise<GrnDraft> {
    if (USE_MOCKS) {
      await mockDelay()
      return {
        delivery_event_id: deliveryEventId,
        site_id: 'mock-site',
        received_on: '2026-06-01',
        vendor: 'Steel Junction',
        material: 'TMT bars',
        quantity: 8,
        unit: 'ton',
        reference: 'GRN-MOCK01',
        note: 'Goods received from Steel Junction: TMT bars (8 ton).',
      }
    }
    return request<GrnDraft>(
      `/api/v1/reconcile/grn/${encodeURIComponent(deliveryEventId)}`,
    )
  },

  async holdPayment(body: HoldPaymentRequest): Promise<HoldPaymentResponse> {
    if (USE_MOCKS) {
      await mockDelay(300)
      return {
        decision_id: body.client_decision_id ?? 'mock-hold',
        state: 'pending',
        title: 'Hold payment',
        assigned_to: 'owner-1',
        site_id: 'mock-site',
        amount_at_risk: body.amount_at_risk ?? 0,
        created_at: new Date().toISOString(),
      }
    }
    return request<HoldPaymentResponse>('/api/v1/reconcile/hold-payment', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
