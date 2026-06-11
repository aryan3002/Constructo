/**
 * Pure thread-state helpers for the offline-first chat hook (spine A8–A10).
 * Extracted from {@link useChatThread} so the load-bearing logic — merging the
 * durable outbox into the rendered feed, and computing delivery ticks from the
 * member cursor set — is unit-testable without rendering React.
 */
import type { ChatAddressBody, ChatOutboxItem } from './outbox'
import type { ChatMessage, CursorOut } from '../api/chat'

/**
 * Offline-first thread sync. Try the network page; if the fetch fails (offline,
 * timeout, 5xx) fall back to the persisted cache so a reopened thread keeps
 * showing its messages instead of blanking to an error after the retries
 * exhaust. Only re-throws when there is genuinely nothing cached to show.
 *
 * Dependencies are injected so this is unit-testable without mocking modules.
 */
export async function syncOrCache(
  fetchPage: () => Promise<ChatMessage[]>,
  loadCache: () => Promise<ChatMessage[]>,
): Promise<ChatMessage[]> {
  try {
    return await fetchPage()
  } catch (err) {
    const cached = await loadCache()
    if (cached.length) return cached
    throw err
  }
}

/** A not-yet-confirmed message still in the outbox, rendered as a pending bubble
 *  beneath the merged server feed. `state` mirrors the outbox item so the UI can
 *  show "sending…" vs "tap to retry" (failed_permanent). */
export interface PendingMessage {
  clientMsgId: string
  body: string
  /** A structured/media send shows a "booked ✓" receipt rather than plain text. */
  captured: boolean
  state: ChatOutboxItem['state']
}

/** The stable conversation key (conversation_id XOR site_id) for an outbox item. */
export function outboxConvKey(addr: ChatAddressBody): string {
  return addr.conversation_id ?? addr.site_id ?? ''
}

/**
 * The outbox items for THIS thread that should still render as pending bubbles —
 * i.e. not yet confirmed by the server. An item is dropped once its client_msg_id
 * appears in the merged server feed (the real message replaces the pending one).
 */
export function pendingForThread(
  convKey: string,
  outbox: ChatOutboxItem[],
  serverMessages: ChatMessage[],
): PendingMessage[] {
  // The server echoes nothing client-msg-id-shaped on ChatMessage today, so we
  // can't match by id; instead the hook removes a confirmed item from the outbox
  // on drain success. Anything still in the outbox for this conv is pending.
  const confirmed = new Set<string>()
  void serverMessages // reserved: future server echo of client_msg_id
  return outbox
    .filter((i) => outboxConvKey(i.address) === convKey && !confirmed.has(i.clientMsgId))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((i) => ({
      clientMsgId: i.clientMsgId,
      body: i.body ?? (i.media ? '📎' : ''),
      captured: !!i.captureType || !!i.media,
      state: i.state,
    }))
}

export type DeliveryState = 'sent' | 'delivered' | 'read'

/**
 * The delivery tick for one of the caller's own messages, from the member cursor
 * set. `read` when every OTHER member's read cursor has reached the message's seq;
 * `delivered` when every other member's delivered cursor has; else `sent`.
 * `myUserId` is excluded (a sender's own cursor is not a receipt). With no other
 * members yet (cursors not loaded / solo thread) it stays 'sent'.
 */
export function computeDeliveryState(
  seq: number,
  cursors: CursorOut[],
  myUserId: string | null | undefined,
): DeliveryState {
  const others = cursors.filter((c) => c.user_id !== myUserId)
  if (others.length === 0) return 'sent'
  const minDelivered = Math.min(...others.map((c) => c.last_delivered_seq))
  const minRead = Math.min(...others.map((c) => c.last_read_seq))
  if (minRead >= seq) return 'read'
  if (minDelivered >= seq) return 'delivered'
  return 'sent'
}

/** A keyed lookup `seq → DeliveryState` for the caller's own messages, so a
 *  screen can render a tick per row without recomputing the cursor scan. */
export function deliveryStateMap(
  messages: ChatMessage[],
  cursors: CursorOut[],
  myUserId: string | null | undefined,
): Map<number, DeliveryState> {
  const map = new Map<number, DeliveryState>()
  for (const m of messages) {
    if (m.sender_id && m.sender_id === myUserId) {
      map.set(m.seq, computeDeliveryState(m.seq, cursors, myUserId))
    }
  }
  return map
}
