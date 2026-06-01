/**
 * Supervisor (field/contractor) API layer — Blueprint role.
 *
 * Ported from the web client shapes (`web/src/api/types.ts` Site / SiteEvent,
 * `web/src/api/attendance.ts`) and reuses the mobile `request` helper + the
 * `{error:{code,message}}` envelope by IMPORT only (never edits the client).
 *
 * READS (sites / events / approvals) hit real, documented endpoints. The
 * supervisor scope is server-enforced: `GET /api/v1/sites` returns only the
 * supervisor's ASSIGNED sites, so the client does not pass an `assignedTo`
 * filter — it trusts the scoped response.
 *
 * CAPTURE is the role's whole job but there is NO app-authenticated "create an
 * event" endpoint today (ingest uses an `X-Ingest-Key` meant for the WhatsApp
 * bridge, NOT the app). So capture is NOT called from here directly — the
 * Capture screen ENQUEUES a {@link CaptureBody} into the offline outbox against
 * the assumed shape below; the outbox will replay it through `request` once the
 * backend exposes the endpoint. See {@link CAPTURE_PATH}/{@link CaptureBody}.
 */
import { request, ApiError } from './client'
import type { Paginated, Site } from './types'

export { ApiError }
export type { Site, Paginated }

// ---------------------------------------------------------------------------
// Site events — ported verbatim from web `types.ts`.
// ---------------------------------------------------------------------------

export type SiteEventType =
  | 'attendance'
  | 'material_delivery'
  | 'progress_update'
  | 'issue'
  | 'invoice_received'
  | 'drawing_shared'
  | 'approval'
  | 'payment_request'
  | 'unknown'

export interface SiteEvent {
  id: string
  site_id: string
  event_type: SiteEventType
  occurred_on: string
  summary: string
  fields: Record<string, unknown>
  confidence: number
  needs_clarification: boolean
  source_message_ids: string[]
  created_at: string
}

// ---------------------------------------------------------------------------
// Approvals / asks — the supervisor's inbox of things pointed at them.
// The backend exposes a generic approvals feed; there is no supervisor-specific
// "/asks?for=me" endpoint yet (see notes). We read approvals and let the screen
// present the pending ones with a respond affordance.
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | string

export interface Approval {
  id: string
  site_id: string | null
  kind: string
  title: string
  detail: string | null
  status: ApprovalStatus
  created_at: string
}

// ---------------------------------------------------------------------------
// Capture — the ASSUMED documented shape we enqueue (no app-auth endpoint yet).
// Mirrors Supervisor.md §6.1: POST /captures { type, siteId, areaTag?,
// mediaRefs[], note?, transcript?, geo?, createdAt, localId }.
// ---------------------------------------------------------------------------

/** The capture "what is this?" tag — drives downstream classification. */
export type CaptureKind = 'attendance' | 'delivery' | 'progress' | 'issue'

/** Media a capture carries (local file URI until uploaded via presigned URL). */
export interface CaptureMedia {
  /** 'photo' | 'voice' — what was captured. */
  kind: 'photo' | 'voice'
  /** Local file URI on device (replaced by an uploaded ref on the server). */
  uri: string
}

/** Body POSTed to the (future) app-auth capture endpoint; enqueued for replay. */
export interface CaptureBody {
  type: CaptureKind
  site_id: string
  media: CaptureMedia[]
  note?: string
  /** Convenience transcript for a voice note (STT is stubbed client-side). */
  transcript?: string
  created_at: string
  /** Idempotency key so a replay never double-files a capture. */
  client_capture_id: string
}

/** The path the outbox will replay against once the backend exposes it. */
export const CAPTURE_PATH = '/api/v1/captures'

// ---------------------------------------------------------------------------
// API surface (reads).
// ---------------------------------------------------------------------------

export const supervisorApi = {
  /** Assigned sites only — scope is server-enforced for the supervisor role. */
  sites(): Promise<Paginated<Site>> {
    return request<Paginated<Site>>('/api/v1/sites')
  },

  /** Recent events for one assigned site (today's feed + history). */
  siteEvents(siteId: string, date?: string): Promise<Paginated<SiteEvent>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : ''
    return request<Paginated<SiteEvent>>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/events${q}`,
    )
  },

  /** Approvals/asks feed; the screen filters to pending ones for the supervisor. */
  approvals(): Promise<Paginated<Approval>> {
    return request<Paginated<Approval>>('/api/v1/approvals')
  },

  /**
   * Asks pointed AT ME — the supervisor/PM "things waiting on you" feed (C3).
   * Maps to `GET /api/v1/approvals?for=me`, which narrows the ledger to
   * decisions assigned to the caller. Same `Approval` shape as the feed above.
   */
  asksForMe(): Promise<Paginated<Approval>> {
    return request<Paginated<Approval>>('/api/v1/approvals?for=me')
  },
}

/** Path the offline outbox replays a supervisor respond against (C3). */
export const ASK_RESPOND_PATH = (id: string): string =>
  `/api/v1/approvals/${encodeURIComponent(id)}/respond`
