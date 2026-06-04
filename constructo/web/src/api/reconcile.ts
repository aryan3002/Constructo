// Reconciliation API layer (owned by the `reconcile` feature).
//
// Reuses the shared client primitives (API_BASE / ApiError / getToken) by
// IMPORT ONLY — it does not modify them. Kept dependency-free so a future React
// Native app can reuse these types verbatim.
import { ApiError } from './client'
import { API_BASE } from './config'
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

export const reconcileApi = {
  list(siteId: string, windowDays?: number): Promise<ReconcileList> {
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

  grnDraft(deliveryEventId: string): Promise<GrnDraft> {
    return request<GrnDraft>(
      `/api/v1/reconcile/grn/${encodeURIComponent(deliveryEventId)}`,
    )
  },

  holdPayment(body: HoldPaymentRequest): Promise<HoldPaymentResponse> {
    return request<HoldPaymentResponse>('/api/v1/reconcile/hold-payment', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
