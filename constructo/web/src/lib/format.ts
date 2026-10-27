import type { RiskSeverity, SiteEventType } from '../api/types'

// Severity ordering: high first. Used to sort risks for the brief cards.
export const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  high: 0,
  med: 1,
  low: 2,
}

export function sortBySeverity<T extends { severity: RiskSeverity }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
  )
}

export const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  high: 'High',
  med: 'Medium',
  low: 'Low',
}

export const EVENT_TYPE_LABEL: Record<SiteEventType, string> = {
  attendance: 'Attendance',
  material_delivery: 'Material',
  progress_update: 'Progress',
  issue: 'Issue',
  invoice_received: 'Invoice',
  drawing_shared: 'Drawing',
  approval: 'Approval',
  payment_request: 'Payment',
  unknown: 'Unknown',
}

export function formatDate(iso: string): string {
  // A plain "YYYY-MM-DD" is parsed by new Date() as UTC midnight, which renders
  // a day early in timezones behind UTC. Parse the parts as a LOCAL date.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatConfidence(c: number): string {
  return `${Math.round(c * 100)}%`
}

/** Unit spellings shown as a friendlier word ("nos" = numbers, i.e. pieces). */
const UNIT_LABEL: Record<string, string> = { nos: 'pcs', 'nos.': 'pcs', no: 'pcs', 'no.': 'pcs' }

/**
 * A quantity as people write it: "24 pcs", not "24.00 nos". Decimal strings
 * from the API lose trailing zeros ("12.50" → "12.5"), large numbers get
 * Indian grouping, and an absent quantity is "—".
 */
export function formatQuantity(
  qty: string | number | null | undefined,
  unit?: string | null,
): string {
  if (qty === null || qty === undefined || qty === '') return '—'
  const n = Number(qty)
  const shown = Number.isFinite(n)
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 })
    : String(qty)
  const u = unit?.trim()
  if (!u) return shown
  return `${shown} ${UNIT_LABEL[u.toLowerCase()] ?? u}`
}
