/**
 * Contested-truth API (Safety rail 1.7) — raise / list / resolve / withdraw a
 * dispute against a SiteEvent. The invariant mirrors the backend: NO silent
 * overwrites. Anyone on the site can *raise* a dispute (mark a card contested);
 * only an owner/PM can *resolve* it, and a resolution that changes the value
 * writes a NEW superseding event version — append-only and attributed. The
 * dispute trail is the receipt.
 */
import { request } from './client'

export type DisputeStatus = 'open' | 'resolved' | 'withdrawn'

export interface Dispute {
  id: string
  event_id: string
  site_id: string
  raised_by: string | null
  raised_by_role: string | null
  reason: string
  proposed_fields: Record<string, unknown> | null
  status: DisputeStatus
  resolved_by: string | null
  resolution_note: string | null
  resolved_fields: Record<string, unknown> | null
  resolved_event_id: string | null
  created_at: string
  resolved_at: string | null
}

export const disputesApi = {
  /** Contest an event (anyone assigned to the site). 409 if the caller already
   *  has an open dispute on it. */
  raise(eventId: string, reason: string, proposedFields?: Record<string, unknown>): Promise<Dispute> {
    return request<Dispute>(`/api/v1/events/${encodeURIComponent(eventId)}/disputes`, {
      method: 'POST',
      body: JSON.stringify({ reason, proposed_fields: proposedFields ?? null }),
    })
  },

  /** All disputes on an event (oldest first) — used to find the open one to resolve. */
  list(eventId: string): Promise<Dispute[]> {
    return request<Dispute[]>(`/api/v1/events/${encodeURIComponent(eventId)}/disputes`)
  },

  /** Settle a contest (owner/PM only). Pass `resolvedFields` to write a
   *  superseding version; omit it to let the original stand as recorded. */
  resolve(
    disputeId: string,
    body: { resolution_note?: string; resolved_fields?: Record<string, unknown> },
  ): Promise<Dispute> {
    return request<Dispute>(`/api/v1/disputes/${encodeURIComponent(disputeId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** The raiser takes back their own open dispute. */
  withdraw(disputeId: string): Promise<Dispute> {
    return request<Dispute>(`/api/v1/disputes/${encodeURIComponent(disputeId)}/withdraw`, {
      method: 'POST',
    })
  },
}
