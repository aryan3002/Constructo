/**
 * In-app chat (Phase 1) — the crew per-site thread.
 *
 * Wraps `POST/GET /api/v1/chat/*` via the shared {@link request} helper (never
 * edits the client). Messages flow into the same extraction pipeline server-side
 * — a typed card rides `capture_type`/`fields`. `client_msg_id` makes a send
 * idempotent so the optimistic UI / offline retry never double-posts.
 */
import { request, uploadMultipart, type UploadFile } from './client'

export type MessageSide = 'homeowner' | 'contractor'

/**
 * The structured `SiteEvent` a message produced — rendered inline as a Card
 * (event-type pill + key fields + "show proof") instead of a flat bubble. This
 * is what makes "capture with a conversation around it" visible in the thread.
 */
export interface ChatEvent {
  id: string
  event_type: string
  occurred_on: string
  summary: string
  fields: Record<string, unknown>
  confidence: number
  needs_clarification: boolean
  /** An open dispute contests this event (1.7) — the card flags it. */
  contested: boolean
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  sender_side: MessageSide
  /** Human-readable author name — resolved server-side; null for system/nivaan rows. */
  sender_name?: string | null
  /** Author's role string (owner|supervisor|etc.) — null for system/nivaan rows. */
  sender_role?: string | null
  seq: number
  body: string | null
  reply_to_id: string | null
  media_type: string
  created_at: string
  /** Short-lived presigned GET for an attachment (challan photo), else null. */
  attachment_url: string | null
  /** Events this message minted; empty for plain human talk (a bubble). */
  events: ChatEvent[]
  /** Extraction status of the message's raw row (queued|processing|done|failed),
   *  or null for messages that carry no extractable payload. Drives the "still
   *  reading…" cue on a freshly-sent media card; patched live by event_update. */
  raw_status?: string | null
  /** System messages (member added, dispute resolved, etc.) are rendered as
   *  centered notices rather than bubbles. 'nivaan' marks AI-authored rows. */
  sender_kind?: 'user' | 'nivaan' | 'system'
  /** Per-message metadata stamped by the backend (Task B-T3). A blocked reply
   *  carries `blocked.reason = "contested"` when an open dispute freezes an
   *  approve/correct action. Nivaan answer rows carry `nivaan.kind`; Nivaan
   *  proposal rows carry a `proposal` draft-capture card (Task B-T8). */
  meta?: {
    blocked?: { reason?: string; event_id?: string }
    nivaan?: { kind?: string; tool?: string; evidence_event_ids?: string[] }
    proposal?: {
      tier: 'commit' | 'money'
      kind: 'capture' | 'missing_proof'
      capture_type: string
      fields: Record<string, unknown>
      summary: string
      evidence_event_ids: string[]
      committable: boolean
    }
  } | null
}

/** One member's read/delivered cursor pair (spine A10) — the client derives
 *  per-message delivery ticks from the set of these across a thread's members. */
export interface CursorOut {
  user_id: string
  last_delivered_seq: number
  last_read_seq: number
}

/** A direct-to-R2 upload ticket (spine A11). `upload_mode` is "presigned" when
 *  `put_url` is set (PUT the bytes there), else "multipart" (fall back to the
 *  existing POST /chat/media). Keeps the API out of the byte path on one bar. */
export interface MediaPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'multipart'
}

export interface ChatSendBody {
  /** Target a site crew thread (Phase 1). Mutually exclusive with `conversation_id`. */
  site_id?: string
  /** Target a group/homeowner thread by conversation id (Phase 2). */
  conversation_id?: string
  client_msg_id: string
  body?: string
  reply_to_id?: string
  /** Structured-capture hint (a typed card / slash-command) — Phase 0.1 path. */
  capture_type?: string
  fields?: Record<string, unknown>
  /** Media (1.2 Camera-as-Sensor): the bare R2 key the client uploaded to. */
  attachment_key?: string
  attachment_mime?: string
  media_type?: 'text' | 'image' | 'document' | 'voice'
  /** Content hash from the upload (1.7 dedupe). */
  attachment_sha256?: string
}

/** The stored object's bare key returned by the media upload endpoint. */
export interface MediaUpload {
  key: string
  media_type: string
  /** Content hash for replay-dedupe (1.7) — passed back on send. */
  sha256: string
}

/** A ranked risk in the pinned brief (1.8). */
export interface BriefRisk {
  kind: string
  severity: 'low' | 'medium' | 'high' | string
  message: string
  evidence_event_ids: string[]
}

/** The owner's brief pinned in the thread (1.8) — exceptions-first. */
export interface SiteBrief {
  site_id: string
  risk_count: number
  headline: string
  risks: BriefRisk[]
}

/** A deterministic Catch-me-up over a site's recent thread (2.6) — chatter
 *  distilled into structured totals by the reducers, never an LLM guess. */
export interface RecapResult {
  site_id: string
  days: number
  event_counts: Record<string, number>
  /** "cement: bori" -> qty (canonical unit). */
  material_totals: Record<string, number>
  worker_days: number | null
  amount_total: number | null
  open_disputes: number
  summary: string
}

/** One Standing-Sentinel signal (3.1) — what's slipping (absence / overdue). */
export interface SentinelSignal {
  kind: string // attendance_absence | action_item_overdue | material_overdue
  severity: 'high' | 'medium' | 'low' | string
  message: string
  evidence_event_ids: string[]
}

/** The absence + stuck-thing radar for a site (3.1) — deterministic, abstains. */
export interface SentinelResult {
  site_id: string
  window_days: number
  signals: SentinelSignal[]
  count: number
  summary: string
}

/** A grounded answer from Ask-the-Project (2.2). The total is computed in the
 *  backend reducers, never a model; `unconfirmed` is the honest caveat. */
export interface AskResult {
  answerable: boolean
  answer: string
  total: number | null
  unit: string | null
  breakdown: Record<string, number>
  evidence_event_ids: string[]
  contributors: number
  unconfirmed: number
}

/**
 * One row in the owner Chat inbox — an accessible site crew thread, ordered
 * most-recent-first by the server (owners get every company thread). The badge
 * count + `has_homeowner` cue drive the inbox row without opening the thread.
 */
export interface ConversationSummary {
  id: string
  kind: 'site' | 'homeowner' | 'group'
  site_id: string | null
  title: string | null
  site_name: string | null
  last_message_at: string | null
  unread_count: number
  has_homeowner: boolean
}

/** RFC-4122 v4 — a valid UUID for the backend's `client_msg_id` (idempotency). */
export function newClientMsgId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Address exactly one chat thread — a site crew thread by `siteId`, OR a
 * group/homeowner thread by `conversationId`. The discriminated union makes
 * passing neither (or both) a compile error at the call site.
 */
export type ChatAddress =
  | { siteId: string; conversationId?: never }
  | { conversationId: string; siteId?: never }

export const chatApi = {
  /** A thread, oldest→newest, after a seq cursor (sync-on-reconnect). Address a
   *  site crew thread by `siteId`, or a group/homeowner thread by `conversationId`. */
  messages(opts: ChatAddress & { afterSeq?: number; limit?: number }): Promise<ChatMessage[]> {
    const q = new URLSearchParams()
    if ('conversationId' in opts && opts.conversationId) q.set('conversation_id', opts.conversationId)
    else if ('siteId' in opts && opts.siteId) q.set('site_id', opts.siteId)
    q.set('after_seq', String(opts.afterSeq ?? 0))
    // Default to the server's max page (MAX_LIMIT=200) instead of its DEFAULT_LIMIT=50,
    // so the thread fills in a few pages rather than 50-at-a-time per poll.
    if (opts.limit != null) q.set('limit', String(opts.limit))
    return request<ChatMessage[]>(`/api/v1/chat/messages?${q.toString()}`)
  },

  /** The owner Chat inbox — accessible site threads, most-recent-first. */
  conversations(): Promise<ConversationSummary[]> {
    return request<ConversationSummary[]>('/api/v1/chat/conversations')
  },

  /** Get-or-create the homeowner's private builder channel for her site
   *  (doc 18 Phase 3) — returns its ConversationSummary so the inbox can pin it. */
  homeownerChannel(siteId: string): Promise<ConversationSummary> {
    return request<ConversationSummary>('/api/v1/chat/homeowner-channel', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId }),
    })
  },

  /** Send a message (idempotent on client_msg_id). */
  send(body: ChatSendBody): Promise<ChatMessage> {
    return request<ChatMessage>('/api/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Upload chat media (1.2 Camera-as-Sensor); returns the stored bare key.
   *  Addressed by `siteId` (crew thread) or `conversationId` (homeowner channel /
   *  group the caller is in — Slice D). */
  uploadMedia(
    address: ChatAddress,
    file: UploadFile,
    kind: 'image' | 'document' | 'voice' = 'document',
  ): Promise<MediaUpload> {
    const form = new FormData()
    form.append('file', file as unknown as Blob)
    if ('conversationId' in address && address.conversationId)
      form.append('conversation_id', address.conversationId)
    else if ('siteId' in address && address.siteId) form.append('site_id', address.siteId)
    form.append('kind', kind)
    return uploadMultipart<MediaUpload>('/api/v1/chat/media', form)
  },

  /** The site's pinned brief — ranked risks for today (1.8). */
  brief(siteId: string): Promise<SiteBrief> {
    return request<SiteBrief>(`/api/v1/chat/brief?site_id=${encodeURIComponent(siteId)}`)
  },

  /** Ask-the-Project (2.2): a grounded, scoped, deterministic total. */
  ask(siteId: string, question: string): Promise<AskResult> {
    return request<AskResult>('/api/v1/ask', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, question }),
    })
  },

  /** Catch-me-up (2.6): deterministic totals over the last `days` of the thread. */
  recap(siteId: string, days = 1): Promise<RecapResult> {
    return request<RecapResult>(
      `/api/v1/recap?site_id=${encodeURIComponent(siteId)}&days=${days}`,
    )
  },

  /** Standing Sentinel (3.1): the absence + stuck-thing radar for a site. */
  sentinel(siteId: string, windowDays = 14): Promise<SentinelResult> {
    return request<SentinelResult>(
      `/api/v1/sentinel?site_id=${encodeURIComponent(siteId)}&window_days=${windowDays}`,
    )
  },

  /** Advance the read cursor (returns 204). Address a site crew thread by
   *  `siteId`, or a group/homeowner thread by `conversationId`. */
  read(opts: ChatAddress & { lastSeq: number }): Promise<void> {
    const body =
      'conversationId' in opts && opts.conversationId
        ? { conversation_id: opts.conversationId, last_seq: opts.lastSeq }
        : { site_id: (opts as { siteId: string }).siteId, last_seq: opts.lastSeq }
    return request<void>('/api/v1/chat/read', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Advance the caller's DELIVERED cursor (✓✓). Called after persisting messages
   *  locally (a WS frame or a REST backfill). Mirrors {@link read} — returns 204. */
  delivered(opts: ChatAddress & { lastSeq: number }): Promise<void> {
    const body =
      'conversationId' in opts && opts.conversationId
        ? { conversation_id: opts.conversationId, last_seq: opts.lastSeq }
        : { site_id: (opts as { siteId: string }).siteId, last_seq: opts.lastSeq }
    return request<void>('/api/v1/chat/delivered', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Every member's cursor pair for the thread — the client computes per-message
   *  delivery/read ticks from these. Read cursors are masked in the homeowner room. */
  cursors(address: ChatAddress): Promise<CursorOut[]> {
    const q = new URLSearchParams()
    if ('conversationId' in address && address.conversationId)
      q.set('conversation_id', address.conversationId)
    else if ('siteId' in address && address.siteId) q.set('site_id', address.siteId)
    return request<CursorOut[]>(`/api/v1/chat/cursors?${q.toString()}`)
  },

  /** A one-time WS ticket for /chat/ws (keeps the JWT out of the URL). */
  wsTicket(): Promise<{ ticket: string }> {
    return request<{ ticket: string }>('/api/v1/chat/ws-ticket', { method: 'POST' })
  },

  /** A direct-to-R2 upload ticket (spine A11). `upload_mode` tells the client to
   *  PUT to `put_url` (presigned) or fall back to multipart POST /chat/media. */
  presignMedia(
    opts: ChatAddress & { kind: 'image' | 'document' | 'voice' },
  ): Promise<MediaPresign> {
    const body =
      'conversationId' in opts && opts.conversationId
        ? { conversation_id: opts.conversationId, kind: opts.kind }
        : { site_id: (opts as { siteId: string }).siteId, kind: opts.kind }
    return request<MediaPresign>('/api/v1/chat/media/presign', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
