/**
 * Permits API client — Slice E (owner permits register).
 *
 * Contract: prefix /api/v1/permits  (router.py line 25).
 * Permit moves: not_started → applied → under_review → approved / rejected / expired.
 *
 * Kept in its own module (matching the pattern of accountant.ts, disputes.ts, etc.)
 * rather than in owner.ts to keep owner.ts readable.
 */
import { request } from './client'
import type { Paginated } from './types'

// ============================================================================
// Enums & wire shapes
// ============================================================================

export type PermitStatus =
  | 'not_started'
  | 'applied'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'

export interface Permit {
  id: string
  company_id: string
  site_id: string
  permit_type: string
  authority: string
  status: PermitStatus
  applied_on: string | null
  expected_on: string | null
  decided_on: string | null
  expiry_on: string | null
  reference_no: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface PermitCreate {
  site_id: string
  permit_type: string
  authority: string
  status?: PermitStatus
  applied_on?: string | null
  expected_on?: string | null
  decided_on?: string | null
  expiry_on?: string | null
  reference_no?: string | null
  notes?: string | null
}

export interface PermitPatch {
  permit_type?: string
  authority?: string
  status?: PermitStatus
  applied_on?: string | null
  expected_on?: string | null
  decided_on?: string | null
  expiry_on?: string | null
  reference_no?: string | null
  notes?: string | null
}

// ============================================================================
// Query-string builder (mirrors the `qs` helper in owner.ts)
// ============================================================================

const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

// ============================================================================
// Client methods
// ============================================================================

export const permitsApi = {
  /**
   * GET /api/v1/permits?site_id=&status=
   * Returns Page<PermitOut> (paginated; we take items directly from the response).
   */
  listPermits: (siteId?: string, status?: PermitStatus) =>
    request<Paginated<Permit>>(
      `/api/v1/permits${qs({ site_id: siteId, status })}`,
    ),

  /**
   * POST /api/v1/permits — create a new permit.
   * Requires a site_id (site-scoped).
   */
  createPermit: (body: PermitCreate) =>
    request<Permit>('/api/v1/permits', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * PATCH /api/v1/permits/{id} — partial update (status, dates, refs, notes).
   */
  updatePermit: (id: string, patch: PermitPatch) =>
    request<Permit>(`/api/v1/permits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
}
