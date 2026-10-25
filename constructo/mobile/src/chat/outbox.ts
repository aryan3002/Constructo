/**
 * Durable chat outbox (spine A8) — the bubble the user sees is backed by
 * storage BEFORE the network is tried, so an app kill in a dead zone never
 * loses a message. Modeled on src/offline/outbox.ts (the proven capture
 * foundation); chat needs its own shape (client_msg_id idempotency, per-
 * conversation FIFO, media two-step) so it gets its own queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ChatMessage } from '../api/chat'

const STORAGE_KEY = 'constructo.chat.outbox'
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 5 * 60_000
/** Temporary failures before an item is parked for a manual retry. With the
 *  backoff below this is roughly an hour of retrying. */
export const MAX_ATTEMPTS = 20

export type ChatAddressBody = { site_id?: string; conversation_id?: string }

export interface ChatOutboxItem {
  clientMsgId: string
  address: ChatAddressBody
  body?: string
  replyToId?: string
  captureType?: string
  fields?: Record<string, unknown>
  /** Media two-step: localUri until uploaded, then key+sha256 persisted back. */
  media?: {
    localUri?: string
    kind?: 'image' | 'document' | 'voice'
    mime?: string
    key?: string
    sha256?: string
    /** Send `kind` verbatim — skip the document→image mime coercion. The
     *  supervisor challan scan deliberately sends a JPEG as `document` so the
     *  worker OCRs it into a card; coercing it to `image` would change the
     *  extraction path. exactKind uploads go straight to the multipart endpoint
     *  (the server sets the stored content-type, so nothing can mismatch). */
    exactKind?: boolean
  }
  state: 'queued' | 'sending' | 'failed_permanent'
  attempts: number
  nextAttemptAt: number
  createdAt: number
}

export type SendResult =
  /** `msg` is the created server row (chatApi.send's response) — the drain
   *  merges it into the thread cache BEFORE the pending bubble is removed, so
   *  the swap is atomic (no vanish-for-one-RTT blink). */
  | { ok: true; seq: number; msg?: ChatMessage }
  /** `authExpired`: the login is no longer valid (401). The item stays queued
   *  without spending an attempt and the drain stops until the user signs in. */
  | { ok: false; permanent: boolean; authExpired?: boolean }

async function readAll(): Promise<ChatOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatOutboxItem[]) : []
  } catch {
    return []
  }
}

async function writeAll(items: ChatOutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

// Every read-modify-write of the outbox key runs through this one module-level
// queue. Without it an append that lands while a drain is awaiting the network
// is overwritten by the drain's stale write-back and the message is lost.
let lock: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn)
  lock = run.catch(() => undefined)
  return run
}

/** Read-modify-write the stored list under the lock. `mutate` returns false to
 *  skip the write (nothing changed). */
function mutateOutbox(mutate: (items: ChatOutboxItem[]) => boolean | void): Promise<void> {
  return withLock(async () => {
    const items = await readAll()
    if (mutate(items) !== false) await writeAll(items)
  })
}

/** Exponential backoff with jitter: 1s·2ⁿ capped at 5 min. */
export function nextAttemptDelayMs(attempts: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS)
  return exp + Math.floor(Math.random() * 250)
}

/** Build a queued item synchronously (no storage I/O) — lets the send path put
 *  the pending bubble on screen on the TAP FRAME, then persist. */
export function newOutboxItem(
  item: Omit<ChatOutboxItem, 'state' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
): ChatOutboxItem {
  return {
    ...item,
    state: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  }
}

/** Durably append an already-built item (see {@link newOutboxItem}). */
export async function appendChatOutbox(full: ChatOutboxItem): Promise<void> {
  await mutateOutbox((items) => {
    items.push(full)
  })
}

export async function enqueueChatSend(
  item: Omit<ChatOutboxItem, 'state' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
): Promise<ChatOutboxItem> {
  const full = newOutboxItem(item)
  await appendChatOutbox(full)
  return full
}

export async function listChatOutbox(): Promise<ChatOutboxItem[]> {
  return withLock(readAll)
}

/** Drop one item (the "Delete" on a failed bubble). */
export async function removeChatOutbox(clientMsgId: string): Promise<void> {
  await mutateOutbox((items) => {
    const idx = items.findIndex((i) => i.clientMsgId === clientMsgId)
    if (idx < 0) return false
    items.splice(idx, 1)
  })
}

/** Remove the whole outbox (sign-out / account switch). */
export async function clearChatOutbox(): Promise<void> {
  await withLock(() => AsyncStorage.removeItem(STORAGE_KEY))
}

/** Connectivity is back: make every queued item due NOW (attempts are kept so a
 *  server that is still failing backs off again from where it left off). Without
 *  this, a send that failed offline waits out the remainder of its up-to-5-min
 *  backoff even though the network has returned. */
export async function resetBackoff(): Promise<void> {
  await mutateOutbox((items) => {
    let changed = false
    for (const i of items) {
      if (i.state === 'queued' && i.nextAttemptAt > 0) {
        i.nextAttemptAt = 0
        changed = true
      }
    }
    return changed
  })
}

export async function retryPermanent(clientMsgId: string): Promise<void> {
  await mutateOutbox((items) => {
    const item = items.find((i) => i.clientMsgId === clientMsgId)
    if (!item) return false
    item.state = 'queued'
    item.attempts = 0
    item.nextAttemptAt = 0
  })
}

/**
 * Drain due items FIFO per conversation. `send` performs the idempotent POST
 * (and, for media items, the upload step first — persisting key/sha256 back via
 * the returned item mutation). A conversation halts at its first still-failing
 * item to preserve the user's intended order; a parked (failed_permanent) item
 * is skipped so it never blocks the messages queued after it.
 *
 * Storage is re-read under the lock before every pick and every write-back, and
 * items are updated by clientMsgId — anything appended, retried or deleted while
 * a send is on the wire is preserved.
 */
export async function drainChatOutbox(
  send: (item: ChatOutboxItem) => Promise<SendResult>,
): Promise<void> {
  // Crash recovery: an item left in 'sending' means the app was killed between
  // persisting the in-flight state and handling the result. Re-queue it — the
  // server send is idempotent on clientMsgId, so a re-send that actually landed
  // just returns the existing row. Without this, a stuck 'sending' item is never
  // re-attempted, breaking the durability promise.
  await mutateOutbox((items) => {
    let recovered = false
    for (const i of items) {
      if (i.state === 'sending') {
        i.state = 'queued'
        recovered = true
      }
    }
    return recovered
  })
  const now = Date.now()
  const halted = new Set<string>()
  const tried = new Set<string>()
  for (;;) {
    const item = await withLock(async () => {
      const items = await readAll()
      for (const i of items) {
        if (tried.has(i.clientMsgId) || i.state === 'failed_permanent') continue
        const convKey = i.address.conversation_id ?? i.address.site_id ?? ''
        if (halted.has(convKey)) continue
        if (i.state !== 'queued' || i.nextAttemptAt > now) {
          halted.add(convKey)
          continue
        }
        i.state = 'sending'
        await writeAll(items)
        return i
      }
      return null
    })
    if (!item) return
    tried.add(item.clientMsgId)
    const convKey = item.address.conversation_id ?? item.address.site_id ?? ''
    let result: SendResult
    try {
      result = await send(item)
    } catch {
      result = { ok: false, permanent: false }
    }
    await mutateOutbox((items) => {
      const idx = items.findIndex((i) => i.clientMsgId === item.clientMsgId)
      // Deleted while in flight — nothing to write back.
      if (idx < 0) return false
      if (result.ok) {
        items.splice(idx, 1)
        return
      }
      const stored = items[idx]
      // `send` may have resolved the media upload; keep the key so a retry
      // doesn't upload again.
      if (item.media) stored.media = item.media
      stored.state = 'queued'
      if (result.authExpired) {
        // Paused, not failed: back off but don't spend an attempt.
        stored.nextAttemptAt = Date.now() + nextAttemptDelayMs(Math.max(1, stored.attempts))
        return
      }
      stored.attempts += 1
      if (result.permanent || stored.attempts >= MAX_ATTEMPTS) {
        stored.state = 'failed_permanent'
      } else {
        stored.nextAttemptAt = Date.now() + nextAttemptDelayMs(stored.attempts)
      }
    })
    if (!result.ok && result.authExpired) return
    if (!result.ok && !result.permanent) halted.add(convKey)
  }
}
