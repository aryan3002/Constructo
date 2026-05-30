/**
 * Mukadam (labor_contractor) API layer — the simplest, most-scoped role.
 *
 * Ported from the web attendance client (`web/src/api/attendance.ts`) but built
 * on the mobile shared `request` primitive (which attaches the stored JWT and
 * unwraps the `{error}` envelope). It NEVER edits the shared client/types.
 *
 * A mukadam only ever sees their OWN slice: their payment status. The endpoints
 * here are scoped server-side to the caller's identity.
 *
 * IMPORTANT — attendance capture gap: there is no app-authenticated
 * attendance-create endpoint (ingest is bridge/WhatsApp-only). So the
 * Attendance screen does NOT call this layer to write a count; it ENQUEUES into
 * the offline outbox against the documented capture shape below. The shape and
 * path here (`captureAttendancePath`, `AttendanceCaptureBody`) are the
 * contract that the queued action targets, ready to flip to a live POST once
 * the backend exposes it.
 */
import { request } from './client'
import type { Paginated } from './types'

// ---- Payment tracking (read-only) ----

/**
 * A recorded payment to the mukadam. Ported verbatim from the web
 * `MyPayment` shape (`web/src/api/attendance.ts`). `amount` is a decimal
 * STRING (server keeps money as exact decimals); format with {@link formatRupees}.
 */
export interface MyPayment {
  id: string
  site_id: string | null
  amount: string
  currency: string
  paid_on: string
  method: string | null
  status: 'recorded' | 'confirmed' | 'disputed' | string
  notes: string | null
  created_at: string
}

export const mukadamApi = {
  /** GET /api/v1/me/payments — the caller's own recorded payments (paged). */
  myPayments(): Promise<Paginated<MyPayment>> {
    return request<Paginated<MyPayment>>('/api/v1/me/payments')
  },
}

// ---- Attendance capture (offline-queued; see module note) ----

/**
 * The documented mukadam-side attendance-capture shape. Mirrors the WhatsApp
 * bot's attendance path (same SiteEvent ledger), authored from the app.
 *
 * `client_capture_id` makes the (future) backend write idempotent so a queued
 * retry can never create a duplicate day's count.
 */
export interface AttendanceCaptureBody {
  site_id: string
  /** How the count was answered. */
  source: 'photo' | 'voice' | 'manual'
  /** Tabular headcount the mukadam confirmed. */
  headcount: number
  /** Local URI of the crew photo, if taken (uploaded on sync). */
  photo_uri?: string
  /** Local URI of the voice note, if recorded (uploaded on sync). */
  voice_uri?: string
  /** ISO date the count is FOR (defaults to today on the client). */
  occurred_on?: string
  /** Idempotency key for safe offline replay. */
  client_capture_id?: string
}

/**
 * The path the queued capture action targets. Assumed to mirror the web
 * supervisor capture route. Kept here so the screen and the (future) sync
 * replay share one source of truth.
 *
 * TODO(backend): expose an app-authenticated attendance-create endpoint for
 * the labor_contractor role. Until then the outbox holds the count locally and
 * the UI shows an honest "saved, will sync" state.
 */
export function captureAttendancePath(siteId: string): string {
  return `/api/v1/sites/${encodeURIComponent(siteId)}/attendance`
}

// ---- Formatting helpers (Indian numbering) ----

/**
 * Format a decimal-string rupee amount with the Indian grouping
 * (lakh/crore). e.g. "125000.00" → "₹1,25,000". Falls back gracefully on a
 * non-numeric string.
 */
export function formatRupees(amount: string | number | null | undefined): string {
  if (amount == null) return '₹—'
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return '₹—'
  // Drop paise unless present; field users read whole rupees.
  const hasPaise = Math.round(n) !== n
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}
