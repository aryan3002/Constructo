/**
 * Accountant (contractor) API surface — C4 native client.
 *
 * The accountant's slice is READ-ONLY and tracking-only. There is NO action
 * here that moves money — Constructo records money movements for visibility and
 * reconciliation only; it never moves money (correction #1). The accountant
 * *flags*; the owner *resolves* from the approvals inbox.
 *
 * Mirrors the backend read endpoints:
 *   - overview  → GET /reconcile/overview        (exceptions-first money cockpit)
 *   - reconcile → GET /reconcile/sites/{id}       (one site's match/variance rows)
 *   - grn       → GET /reconcile/grn/{deliveryId} (proof on tap)
 *   - ledger    → GET /payments/ledger            (incoming + outgoing tracking)
 *
 * Reuses the shared mobile client (`request` + `ApiError`) by IMPORT ONLY.
 * All wire shapes are snake_case to mirror the backend.
 */
import { request, ApiError } from './client'
import type { Paginated } from './types'

export { ApiError }

// ---- reconcile overview (the accountant cockpit) ---------------------------

export type ReconcileStatus =
  | 'matched'
  | 'mismatch'
  | 'missing_proof'
  | 'needs_approval'

export interface ReconcileSummary {
  matched: number
  mismatch: number
  missing_proof: number
  needs_approval: number
  total_amount_at_risk: number
}

export interface ReconcileSiteSummary {
  site_id: string
  site_name: string
  summary: ReconcileSummary
}

/** An open money flag (a hold_payment decision). Read-only; never resolved here. */
export interface MoneyException {
  decision_id: string
  site_id: string | null
  title: string
  detail: string | null
  state: string
  amount_at_risk: number
  created_at: string
}

export interface AccountantOverview {
  total_amount_at_risk: number
  open_exception_count: number
  sites: ReconcileSiteSummary[]
  exceptions: MoneyException[]
}

// ---- one site's reconciliation rows ----------------------------------------

export interface EventSide {
  event_id: string
  occurred_on: string
  vendor: string | null
  material: string | null
  quantity: number | null
  unit: string | null
  amount: number | null
  currency: string | null
  invoice_number: string | null
  summary: string
  confidence: number
  source_message_ids: string[]
}

export interface ReconcileItem {
  key: string
  status: ReconcileStatus
  vendor: string | null
  item: string | null
  site_id: string
  amount_at_risk: number
  reasons: string[]
  delivery: EventSide | null
  invoice: EventSide | null
}

export interface ReconcileList {
  site_id: string
  summary: ReconcileSummary
  items: ReconcileItem[]
}

// ---- GRN proof -------------------------------------------------------------

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

// ---- payments tracking (incoming + outgoing) -------------------------------

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
  amount: string
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

// ---- query helper ----------------------------------------------------------
const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [
    string,
    string,
  ][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

// ---- public surface (READS ONLY) -------------------------------------------

export const accountant = {
  /** The exceptions-first money cockpit across every visible site. */
  overview: () => request<AccountantOverview>('/api/v1/reconcile/overview'),

  /** One site's delivery-vs-invoice reconciliation rows (exceptions-first). */
  reconcileSite: (siteId: string) =>
    request<ReconcileList>(`/api/v1/reconcile/sites/${siteId}`),

  /** The Goods Received Note for a delivery (proof on tap). */
  grn: (deliveryEventId: string) =>
    request<GrnDraft>(`/api/v1/reconcile/grn/${deliveryEventId}`),

  /** The payment tracking ledger (incoming homeowner→contractor + outgoing). */
  ledger: (direction?: PaymentDirection) =>
    request<PaymentLedger>('/api/v1/payments/ledger').then((l) =>
      direction
        ? { ...l, items: l.items.filter((p) => p.direction === direction) }
        : l,
    ),

  /** The raw payments list (tracking-only; filterable by direction). */
  payments: (direction?: PaymentDirection) =>
    request<Paginated<Payment>>(
      `/api/v1/payments${qs({ direction })}`,
    ),
}
