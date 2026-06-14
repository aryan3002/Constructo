// Payments TRACKING API module (Phase B).
//
// Constructo never moves money — these endpoints record money movements for
// visibility/reconciliation only. Reuses the shared API_BASE / ApiError / token
// from the foundation (imported, never modified).

import { API_BASE, USE_MOCKS } from './config'
import { ApiError } from './client'
import { getToken } from './auth'
import type { Paginated } from './types'

export type PaymentDirection =
  | 'homeowner_to_contractor'
  | 'contractor_to_supplier'

export type PaymentStatus = 'recorded' | 'confirmed' | 'disputed'

export interface Payment {
  id: string
  company_id: string
  site_id: string | null
  direction: PaymentDirection
  counterparty_name: string
  amount: string // Numeric serialised as string to preserve precision
  currency: string
  paid_on: string
  method: string | null
  reference_no: string | null
  status: PaymentStatus
  notes: string | null
  source_event_id: string | null
  created_by: string | null
  created_at: string
}

export interface LedgerTotals {
  inflow: string
  outflow: string
  net: string
  count: number
}

export interface PaymentLedger {
  site_id: string | null
  totals: LedgerTotals
  items: Payment[]
  next_cursor: string | null
}

/** A site's financial-tracking position (W2.6). Amounts are Decimal strings. */
export interface Financials {
  site_id: string
  quotation: string | null
  billed: string | null
  received: string
  outstanding: string
  currency: string
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

function qs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, v)
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

// ---- mock ledger (network-free dev — only when VITE_USE_MOCKS=true) --------
// A trailing week of in/out movements so the "This Week" sparklines render
// without a backend. Dates are computed relative to today so the 7-day window
// always lands on data.
function mockLedger(): PaymentLedger {
  const today = new Date()
  const day = (back: number) => {
    const d = new Date(today)
    d.setDate(today.getDate() - back)
    return d.toISOString().slice(0, 10)
  }
  const mk = (
    id: string,
    back: number,
    direction: PaymentDirection,
    amount: string,
    counterparty_name: string,
  ): Payment => ({
    id,
    company_id: 'mock-co',
    site_id: null,
    direction,
    counterparty_name,
    amount,
    currency: 'INR',
    paid_on: day(back),
    method: 'upi',
    reference_no: null,
    status: 'recorded',
    notes: null,
    source_event_id: null,
    created_by: null,
    created_at: day(back),
  })
  const items: Payment[] = [
    mk('p1', 6, 'homeowner_to_contractor', '500000', 'Sharma (Tower B)'),
    mk('p2', 5, 'contractor_to_supplier', '240000', 'Steel Junction'),
    mk('p3', 4, 'contractor_to_supplier', '85000', 'ACC Cement'),
    mk('p4', 3, 'homeowner_to_contractor', '300000', 'Verma (Villa A)'),
    mk('p5', 2, 'contractor_to_supplier', '52000', 'Bansal Hardware'),
    mk('p6', 1, 'homeowner_to_contractor', '150000', 'Sharma (Tower B)'),
    mk('p7', 0, 'contractor_to_supplier', '38000', 'Daily wages'),
  ]
  const inflow = 950000
  const outflow = 415000
  return {
    site_id: null,
    totals: {
      inflow: String(inflow),
      outflow: String(outflow),
      net: String(inflow - outflow),
      count: items.length,
    },
    items,
    next_cursor: null,
  }
}

export const paymentsApi = {
  list(params: {
    siteId?: string
    status?: PaymentStatus
    direction?: PaymentDirection
    cursor?: string
  } = {}): Promise<Paginated<Payment>> {
    return request<Paginated<Payment>>(
      `/api/v1/payments${qs({
        site_id: params.siteId,
        status: params.status,
        direction: params.direction,
        cursor: params.cursor,
      })}`,
    )
  },

  async ledger(params: { siteId?: string; cursor?: string } = {}): Promise<PaymentLedger> {
    if (USE_MOCKS) {
      return mockLedger()
    }
    return request<PaymentLedger>(
      `/api/v1/payments/ledger${qs({ site_id: params.siteId, cursor: params.cursor })}`,
    )
  },

  // --- financial tracking (W2.6) --------------------------------------------

  async getFinancials(siteId: string): Promise<Financials> {
    if (USE_MOCKS) {
      return {
        site_id: siteId,
        quotation: '12000000',
        billed: '7500000',
        received: '5350000',
        outstanding: '2150000',
        currency: 'INR',
      }
    }
    return request<Financials>(
      `/api/v1/payments/financials/${encodeURIComponent(siteId)}`,
    )
  },

}
