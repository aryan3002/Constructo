/**
 * Material-spec ("selection") API — the designer's selections + the owner's
 * spec schedule both read `/api/v1/specs`. A Spec is one material/finish line
 * (room → component) with an approval state the architect/owner routes.
 *
 * Determinism doctrine: the spec's `approval_status` and `client_final_code` are
 * set by a named human via `approve` (architect/owner are the approve roles);
 * the AI only drafts via `/specs/extract` (not used here).
 */
import { request } from './client'

export type SpecApprovalStatus = 'pending' | 'approved' | 'rejected'

/**
 * The designer's selection routing — DERIVED server-side from approval_status +
 * sent_at + released_at, so the owner's plain approval flow is never disturbed:
 *   draft → out_for_approval (sent) → approved → released, with rejected = returned.
 */
export type RoutingStatus = 'draft' | 'out_for_approval' | 'approved' | 'returned' | 'released'

export interface Spec {
  id: string
  site_id: string
  label: string
  qty: string | null
  unit: string | null
  approval_status: SpecApprovalStatus
  client_final_code: string | null
  notes: string | null
  sent_at: string | null
  released_at: string | null
  routing_status: RoutingStatus
}

export const specsApi = {
  /** A site's spec lines. */
  list(siteId: string): Promise<Spec[]> {
    return request<Spec[]>(`/api/v1/specs?site_id=${encodeURIComponent(siteId)}`)
  },

  get(id: string): Promise<Spec> {
    return request<Spec>(`/api/v1/specs/${id}`)
  },

  /** Approve / reject a spec (architect + owner + pm). Optionally lock the code. */
  approve(id: string, body: { status: SpecApprovalStatus; client_final_code?: string }): Promise<Spec> {
    return request<Spec>(`/api/v1/specs/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Send a selection out for owner approval (designer routes it → out_for_approval). */
  route(id: string): Promise<Spec> {
    return request<Spec>(`/api/v1/specs/${id}/route`, { method: 'POST' })
  },

  /** Release an APPROVED selection to site (→ released). 409 if not approved. */
  release(id: string): Promise<Spec> {
    return request<Spec>(`/api/v1/specs/${id}/release`, { method: 'POST' })
  },
}
