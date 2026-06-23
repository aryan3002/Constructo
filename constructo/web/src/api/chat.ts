/**
 * Chat API client for Constructo web (Phase A).
 *
 * Mirrors `constructo/mobile/src/api/chat.ts` semantics exactly. Uses the
 * established request-helper + auth-header pattern from `dashboard.ts` —
 * a local `request<T>` that imports `API_BASE` / `ApiError` / `getToken`
 * by reference and never touches the underlying client primitives.
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---------------------------------------------------------------------------
// Shared wire types (snake_case — mirror the backend JSON shapes)
// ---------------------------------------------------------------------------

export type SenderKind = 'user' | 'nivaan' | 'system'
export type ConversationKind = 'site' | 'homeowner' | 'group'
export type MessageSide = 'homeowner' | 'contractor'
export type MediaKind = 'image' | 'document' | 'voice'

/** The structured `SiteEvent` a message produced — rendered inline as a Card. */
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
  /** Extraction status of the message's raw row (queued|processing|done|failed). */
  raw_status?: string | null
  /** System messages (member added, dispute resolved, etc.) are rendered as
   *  centered notices rather than bubbles. 'nivaan' marks AI-authored rows. */
  sender_kind?: SenderKind
  /** Per-message metadata stamped by the backend (Task B-T3). */
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

/** One member's read/delivered cursor pair — the client derives per-message
 *  delivery ticks from the set of these across a thread's members. */
export interface CursorOut {
  user_id: string
  last_delivered_seq: number
  last_read_seq: number
}

/** A direct-to-R2 upload ticket (spine A11). */
export interface MediaPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'multipart'
}

/** The stored object's bare key returned by the media upload endpoint. */
export interface MediaUpload {
  key: string
  media_type: string
  /** Content hash for replay-dedupe (1.7) — passed back on send. */
  sha256: string
}

export interface ChatSendBody {
  /** Target a site crew thread (Phase 1). Mutually exclusive with `conversation_id`. */
  site_id?: string
  /** Target a group/homeowner thread by conversation id (Phase 2). */
  conversation_id?: string
  client_msg_id: string
  body?: string
  reply_to_id?: string
  /** Structured-capture hint (a typed card / slash-command). */
  capture_type?: string
  fields?: Record<string, unknown>
  /** Media (1.2 Camera-as-Sensor): the bare R2 key the client uploaded to. */
  attachment_key?: string
  attachment_mime?: string
  media_type?: 'text' | 'image' | 'document' | 'voice'
  /** Content hash from the upload (1.7 dedupe). */
  attachment_sha256?: string
}

/**
 * One row in the owner Chat inbox — an accessible site crew thread, ordered
 * most-recent-first by the server.
 */
export interface ConversationSummary {
  id: string
  kind: ConversationKind
  site_id: string | null
  title: string | null
  site_name: string | null
  last_message_at: string | null
  unread_count: number
  has_homeowner: boolean
}

/**
 * Address exactly one chat thread — a site crew thread by `siteId`, OR a
 * group/homeowner thread by `conversationId`. The discriminated union makes
 * passing neither (or both) a compile error at the call site.
 */
export type ChatAddress =
  | { siteId: string; conversationId?: never }
  | { conversationId: string; siteId?: never }

// ---------------------------------------------------------------------------
// addrParams — public helper used by tests + chat.ts internally
// ---------------------------------------------------------------------------

/**
 * Convert a `ChatAddress` to its snake_case query/body params for the backend.
 *
 * @example addrParams({ siteId: 's1' })           // → { site_id: 's1' }
 * @example addrParams({ conversationId: 'c1' })   // → { conversation_id: 'c1' }
 */
export function addrParams(a: ChatAddress): Record<string, string> {
  return 'siteId' in a
    ? { site_id: a.siteId! }
    : { conversation_id: (a as { conversationId: string }).conversationId }
}

/** RFC-4122 v4 — a valid UUID for the backend's `client_msg_id` (idempotency). */
export function newClientMsgId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Internal fetch helper — mirrors dashboard.ts pattern exactly
// ---------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Multipart POST — for binary uploads (chat media). */
async function uploadMultipart<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Do NOT set Content-Type — fetch sets it with the boundary automatically.

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Insight surfaces (Phase D) — brief / sentinel(radar) / recap
// ---------------------------------------------------------------------------

export interface ChatBriefRisk {
  kind: string
  severity: string
  message: string
  evidence_event_ids: string[]
}
export interface ChatBrief {
  site_id: string
  risk_count: number
  headline: string
  risks: ChatBriefRisk[]
}
export interface SentinelSignal {
  kind: string
  severity: string
  message: string
  evidence_event_ids: string[]
}
export interface SentinelResult {
  signals: SentinelSignal[]
}
export interface Recap {
  site_id: string
  days: number
  event_counts: Record<string, number>
  material_totals: Record<string, number>
  worker_days: number | null
  amount_total: number | null
  open_disputes: number
  summary: string
}

// ---------------------------------------------------------------------------
// chatApi — the full Phase-A surface
// ---------------------------------------------------------------------------

export const chatApi = {
  /** The owner Chat inbox — accessible site threads, most-recent-first. */
  conversations(): Promise<ConversationSummary[]> {
    return request<ConversationSummary[]>('/api/v1/chat/conversations')
  },

  /**
   * A thread's messages, oldest→newest.  Pass `afterSeq` for incremental sync
   * (reconnect / pagination).  `beforeSeq`, `order`, `limit` are optional.
   *
   * @param addr   Which thread (site crew or conversation).
   * @param opts   Pagination controls.
   */
  messages(
    addr: ChatAddress,
    opts: {
      afterSeq?: number
      beforeSeq?: number
      order?: 'asc' | 'desc'
      limit?: number
    } = {},
  ): Promise<ChatMessage[]> {
    const q = new URLSearchParams({
      ...addrParams(addr),
      after_seq: String(opts.afterSeq ?? 0),
    })
    if (opts.beforeSeq !== undefined) q.set('before_seq', String(opts.beforeSeq))
    if (opts.order !== undefined) q.set('order', opts.order)
    if (opts.limit !== undefined) q.set('limit', String(opts.limit))
    return request<ChatMessage[]>(`/api/v1/chat/messages?${q.toString()}`)
  },

  /** Send a message (idempotent on client_msg_id). */
  send(body: ChatSendBody): Promise<ChatMessage> {
    return request<ChatMessage>('/api/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Get a direct-to-R2 upload ticket (spine A11).
   * `upload_mode = 'presigned'` → PUT to `put_url`;
   * `upload_mode = 'multipart'` → fall back to {@link uploadMedia}.
   */
  presignMedia(
    opts: ChatAddress & { kind: MediaKind },
  ): Promise<MediaPresign> {
    const b = { ...addrParams(opts), kind: opts.kind }
    return request<MediaPresign>('/api/v1/chat/media/presign', {
      method: 'POST',
      body: JSON.stringify(b),
    })
  },

  /**
   * Upload chat media as multipart (1.2 Camera-as-Sensor). Returns the stored
   * bare R2 key. Use this as the fallback when `presignMedia` returns
   * `upload_mode = 'multipart'`, or when the client can't PUT directly.
   */
  uploadMedia(
    address: ChatAddress,
    file: File | Blob,
    kind: MediaKind = 'document',
  ): Promise<MediaUpload> {
    const form = new FormData()
    form.append('file', file)
    if ('conversationId' in address && address.conversationId) {
      form.append('conversation_id', address.conversationId)
    } else {
      form.append('site_id', (address as { siteId: string }).siteId)
    }
    form.append('kind', kind)
    return uploadMultipart<MediaUpload>('/api/v1/chat/media', form)
  },

  /**
   * Advance the caller's READ cursor (returns 204).
   * Address a site crew thread by `siteId`, or a conversation by `conversationId`.
   */
  read(opts: ChatAddress & { lastSeq: number }): Promise<void> {
    const b = { ...addrParams(opts), last_seq: opts.lastSeq }
    return request<void>('/api/v1/chat/read', {
      method: 'POST',
      body: JSON.stringify(b),
    })
  },

  /**
   * Advance the caller's DELIVERED cursor (✓✓ — returns 204).
   * Called after persisting messages locally (WS frame or REST backfill).
   */
  delivered(opts: ChatAddress & { lastSeq: number }): Promise<void> {
    const b = { ...addrParams(opts), last_seq: opts.lastSeq }
    return request<void>('/api/v1/chat/delivered', {
      method: 'POST',
      body: JSON.stringify(b),
    })
  },

  /**
   * Every member's cursor pair for the thread — the client computes per-message
   * delivery/read ticks from these. Read cursors are masked in the homeowner room.
   */
  cursors(address: ChatAddress): Promise<CursorOut[]> {
    const q = new URLSearchParams(addrParams(address))
    return request<CursorOut[]>(`/api/v1/chat/cursors?${q.toString()}`)
  },

  /** A one-time WS ticket for /chat/ws (keeps the JWT out of the URL). */
  wsTicket(): Promise<{ ticket: string }> {
    return request<{ ticket: string }>('/api/v1/chat/ws-ticket', {
      method: 'POST',
    })
  },

  // ---- Phase D insight surfaces (site-scoped, GET-only) ----

  /** The site's pinned brief — today's ranked risks. */
  brief(siteId: string): Promise<ChatBrief> {
    return request<ChatBrief>(`/api/v1/chat/brief?site_id=${encodeURIComponent(siteId)}`)
  },

  /** Radar: deterministic "what's slipping" signals over a window. */
  sentinel(siteId: string, windowDays = 1): Promise<SentinelResult> {
    return request<SentinelResult>(
      `/api/v1/sentinel?site_id=${encodeURIComponent(siteId)}&window_days=${windowDays}`,
    )
  },

  /** Recap: deterministic totals over the last N days. */
  recap(siteId: string, days = 1): Promise<Recap> {
    return request<Recap>(`/api/v1/recap?site_id=${encodeURIComponent(siteId)}&days=${days}`)
  },
}
