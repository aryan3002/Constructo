// Payments TRACKING API module (Phase B).
//
// Constructo never moves money — these endpoints record money movements for
// visibility/reconciliation only. Reuses the shared API_BASE / ApiError / token
// from the foundation (imported, never modified).

import { API_BASE } from './config'
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

export interface CreatePaymentRequest {
  direction: PaymentDirection
  counterparty_name: string
  amount: string | number
  paid_on: string
  site_id?: string | null
  currency?: string
  method?: string | null
  reference_no?: string | null
  status?: PaymentStatus
  notes?: string | null
  source_event_id?: string | null
}

export type UpdatePaymentRequest = Partial<CreatePaymentRequest>

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

  ledger(params: { siteId?: string; cursor?: string } = {}): Promise<PaymentLedger> {
    return request<PaymentLedger>(
      `/api/v1/payments/ledger${qs({ site_id: params.siteId, cursor: params.cursor })}`,
    )
  },

  get(id: string): Promise<Payment> {
    return request<Payment>(`/api/v1/payments/${id}`)
  },

  create(body: CreatePaymentRequest): Promise<Payment> {
    return request<Payment>('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({ ...body, amount: String(body.amount) }),
    })
  },

  update(id: string, body: UpdatePaymentRequest): Promise<Payment> {
    const payload: Record<string, unknown> = { ...body }
    if (body.amount != null) payload.amount = String(body.amount)
    return request<Payment>(`/api/v1/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  remove(id: string): Promise<void> {
    return request<void>(`/api/v1/payments/${id}`, { method: 'DELETE' })
  },
}
