/**
 * In-app chat (Phase 1) — the crew per-site thread.
 *
 * Wraps `POST/GET /api/v1/chat/*` via the shared {@link request} helper (never
 * edits the client). Messages flow into the same extraction pipeline server-side
 * — a typed card rides `capture_type`/`fields`. `client_msg_id` makes a send
 * idempotent so the optimistic UI / offline retry never double-posts.
 */
import { request } from './client'

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
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  sender_side: MessageSide
  seq: number
  body: string | null
  reply_to_id: string | null
  media_type: string
  created_at: string
  /** Events this message minted; empty for plain human talk (a bubble). */
  events: ChatEvent[]
}

export interface ChatSendBody {
  site_id: string
  client_msg_id: string
  body?: string
  reply_to_id?: string
  /** Structured-capture hint (a typed card / slash-command) — Phase 0.1 path. */
  capture_type?: string
  fields?: Record<string, unknown>
}

/** RFC-4122 v4 — a valid UUID for the backend's `client_msg_id` (idempotency). */
export function newClientMsgId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const chatApi = {
  /** The site thread, oldest→newest, after a seq cursor (sync-on-reconnect). */
  messages(siteId: string, afterSeq = 0): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(
      `/api/v1/chat/messages?site_id=${encodeURIComponent(siteId)}&after_seq=${afterSeq}`,
    )
  },

  /** Send a message (idempotent on client_msg_id). */
  send(body: ChatSendBody): Promise<ChatMessage> {
    return request<ChatMessage>('/api/v1/chat/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Advance the read cursor (returns 204). */
  read(siteId: string, lastSeq: number): Promise<void> {
    return request<void>('/api/v1/chat/read', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, last_seq: lastSeq }),
    })
  },
}
