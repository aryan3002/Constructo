/**
 * PM (Project Manager) API surface — C4 Auto-DPR.
 *
 * The Daily Progress Report drafts itself from the day's site_events; the PM
 * reviews, edits, and SENDS it. Mirrors the backend `app/dpr/router.py`:
 *   - draftDpr  → POST /dpr/sites/{id}/draft   (generate or re-fetch today's draft)
 *   - getDpr    → GET  /dpr/sites/{id}          (fetch a stored DPR)
 *   - editDpr   → PATCH /dpr/{id}               (PM edits the sections)
 *   - sendDpr   → POST /dpr/{id}/send           (the human commit; never auto-sent)
 *
 * Reuses the shared mobile client (`request` + `ApiError`) by IMPORT ONLY. All
 * wire shapes are snake_case to mirror the backend.
 */
import { request, ApiError } from './client'
import type { Paginated, Site } from './types'

export { ApiError }
export type { Paginated, Site }

export type DprStatus = 'draft' | 'sent'

/** A labour entry (one attendance event). */
export interface DprLaborEntry {
  summary: string
  headcount: number | null
  needs_clarification: boolean
  event_id: string
}

/** A material line (delivery / invoice). */
export interface DprDelivery {
  summary: string
  material: string | null
  quantity: number | null
  unit: string | null
  vendor: string | null
  needs_clarification: boolean
  event_id: string
}

export interface DprWorkItem {
  summary: string
  event_id: string
}

export interface DprBlocker {
  summary: string
  description: string
  severity: string | null
  event_id: string
}

/** The structured DPR sections (mirrors `draft_dpr()` output). */
export interface DprSections {
  labor: { headcount: number | null; entries: DprLaborEntry[] }
  materials: { deliveries: DprDelivery[] }
  work_done: { items: DprWorkItem[] }
  blockers: { items: DprBlocker[] }
  next: { items: string[] }
  summary: string
  [key: string]: unknown
}

export interface Dpr {
  id: string
  site_id: string
  report_date: string
  sections: DprSections
  status: DprStatus
  generated_at: string
  sent_at: string | null
  evidence_event_ids: string[]
}

// ---- query helper ----------------------------------------------------------
const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [
    string,
    string,
  ][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

// ---- public surface --------------------------------------------------------

export const pm = {
  /** The PM's sites (owner/pm see all company sites). */
  sites: () => request<Paginated<Site>>('/api/v1/sites'),

  /** Generate (or re-fetch) today's auto-draft for a site. Idempotent; never sends. */
  draftDpr: (siteId: string, date?: string) =>
    request<Dpr>(`/api/v1/dpr/sites/${siteId}/draft${qs({ date })}`, {
      method: 'POST',
    }),

  /** Fetch the stored DPR for a site+date (404 if none drafted yet). */
  getDpr: (siteId: string, date?: string) =>
    request<Dpr>(`/api/v1/dpr/sites/${siteId}${qs({ date })}`),

  /** PM edits the sections of a still-draft DPR. */
  editDpr: (dprId: string, sections: DprSections) =>
    request<Dpr>(`/api/v1/dpr/${dprId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sections }),
    }),

  /** The human commit: flip draft → sent + stamp sent_at. The ONLY send path. */
  sendDpr: (dprId: string) =>
    request<Dpr>(`/api/v1/dpr/${dprId}/send`, { method: 'POST' }),
}
