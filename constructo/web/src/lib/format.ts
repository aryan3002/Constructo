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

// Tailwind classes per severity. high=red, med=amber, low=gray.
export const SEVERITY_CLASSES: Record<RiskSeverity, string> = {
  high: 'bg-red-100 text-red-800 border-red-300',
  med: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-gray-100 text-gray-700 border-gray-300',
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

export const EVENT_TYPE_CLASSES: Record<SiteEventType, string> = {
  attendance: 'bg-blue-100 text-blue-800',
  material_delivery: 'bg-emerald-100 text-emerald-800',
  progress_update: 'bg-indigo-100 text-indigo-800',
  issue: 'bg-red-100 text-red-800',
  invoice_received: 'bg-purple-100 text-purple-800',
  drawing_shared: 'bg-cyan-100 text-cyan-800',
  approval: 'bg-green-100 text-green-800',
  payment_request: 'bg-amber-100 text-amber-800',
  unknown: 'bg-gray-100 text-gray-700',
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
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
