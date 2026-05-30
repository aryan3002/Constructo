// Presentation helpers for the reconcile screens. Pure + unit-testable.
import type { Status } from '../../ui'
import type { ReconcileStatus } from '../../api/reconcile'
import type { TranslationKey } from '../../i18n'

/** Map a reconcile status onto the kit's status spine (color + icon shape). */
export const RECONCILE_STATUS: Record<ReconcileStatus, Status> = {
  matched: 'ok',
  mismatch: 'warn',
  missing_proof: 'info',
  needs_approval: 'risk',
}

/** i18n key for a reconcile status label. */
export function statusKey(status: ReconcileStatus): TranslationKey {
  return `reconcile.status.${status}` as TranslationKey
}

/** i18n key for a machine reason code; falls back gracefully if unknown. */
export function reasonKey(reason: string): TranslationKey {
  return `reconcile.reason.${reason}` as TranslationKey
}

/** Worst-first ordering rank (mirrors the backend). */
const STATUS_RANK: Record<ReconcileStatus, number> = {
  needs_approval: 0,
  mismatch: 1,
  missing_proof: 2,
  matched: 3,
}

export function isException(status: ReconcileStatus): boolean {
  return status === 'needs_approval' || status === 'mismatch'
}

export function compareStatus(a: ReconcileStatus, b: ReconcileStatus): number {
  return STATUS_RANK[a] - STATUS_RANK[b]
}

/**
 * Format INR with Indian digit grouping (lakh/crore) — no decimals for whole
 * rupees, the "ledger" convention owners read. Locale-independent so tests are
 * deterministic regardless of the runner's ICU data.
 */
export function formatInr(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  const digits = String(Math.abs(rounded))
  if (digits.length <= 3) return `${sign}₹${digits}`
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${sign}₹${grouped},${last3}`
}

/** Compact quantity + unit, e.g. "100 bag" / "—" when absent. */
export function formatQty(qty: number | null, unit?: string | null): string {
  if (qty == null) return '—'
  const n = Number.isInteger(qty) ? String(qty) : String(qty)
  return unit ? `${n} ${unit}` : n
}
