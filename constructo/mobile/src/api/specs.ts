/**
 * Material-spec ("selection") API — the designer's selections + the owner's
 * spec schedule both read `/api/v1/specs`. A Spec is one material/finish line
 * (room → component) with an approval state the architect/owner routes.
 *
 * Determinism doctrine: the spec's `approval_status` and `client_final_code` are
 * set by a named human via `approve` (architect/owner are the approve roles);
 * the AI only drafts via `/specs/extract` (not used here).
 */
import { request, uploadMultipart } from './client'

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
  /** The room→component this spec belongs to; needed to attach a revised photo. */
  component_id: string
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

/** A picked local image (from expo-image-picker). */
export interface PickedImage {
  uri: string
  name: string
  contentType: string
}

/** The AI-extracted draft a revised photo produces (a new pending Spec). */
export interface ExtractedSpec {
  spec: Spec
  extracted: Record<string, unknown>
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

  /**
   * Propose a revised material from a photo: the AI extracts the material and
   * creates a NEW pending Spec on the same component (a draft to re-send). Used
   * when the owner returns a selection and the designer marks up a better option.
   */
  extract(opts: { siteId: string; componentId: string; image: PickedImage }): Promise<ExtractedSpec> {
    const form = new FormData()
    form.append('site_id', opts.siteId)
    form.append('component_id', opts.componentId)
    form.append('image', {
      uri: opts.image.uri,
      name: opts.image.name,
      type: opts.image.contentType,
    } as unknown as Blob)
    return uploadMultipart<ExtractedSpec>('/api/v1/specs/extract', form)
  },
}
