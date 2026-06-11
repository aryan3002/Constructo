/**
 * Durable chat outbox (spine A8) — the bubble the user sees is backed by
 * storage BEFORE the network is tried, so an app kill in a dead zone never
 * loses a message. Modeled on src/offline/outbox.ts (the proven capture
 * foundation); chat needs its own shape (client_msg_id idempotency, per-
 * conversation FIFO, media two-step) so it gets its own queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'constructo.chat.outbox'
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 5 * 60_000

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
  }
  state: 'queued' | 'sending' | 'failed_permanent'
  attempts: number
  nextAttemptAt: number
  createdAt: number
}

export type SendResult =
  | { ok: true; seq: number }
  | { ok: false; permanent: boolean }

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

/** Exponential backoff with jitter: 1s·2ⁿ capped at 5 min. */
export function nextAttemptDelayMs(attempts: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS)
  return exp + Math.floor(Math.random() * 250)
}

export async function enqueueChatSend(
  item: Omit<ChatOutboxItem, 'state' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
): Promise<ChatOutboxItem> {
  const full: ChatOutboxItem = {
    ...item,
    state: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  }
  const items = await readAll()
  items.push(full)
  await writeAll(items)
  return full
}

export async function listChatOutbox(): Promise<ChatOutboxItem[]> {
  return readAll()
}

export async function removeChatOutbox(clientMsgId: string): Promise<void> {
  await writeAll((await readAll()).filter((i) => i.clientMsgId !== clientMsgId))
}

export async function retryPermanent(clientMsgId: string): Promise<void> {
  const items = await readAll()
  const item = items.find((i) => i.clientMsgId === clientMsgId)
  if (item) {
    item.state = 'queued'
    item.nextAttemptAt = 0
    await writeAll(items)
  }
}

/**
 * Drain due items FIFO per conversation. `send` performs the idempotent POST
 * (and, for media items, the upload step first — persisting key/sha256 back via
 * the returned item mutation). A conversation halts at its first still-failing
 * item to preserve the user's intended order.
 */
export async function drainChatOutbox(
  send: (item: ChatOutboxItem) => Promise<SendResult>,
): Promise<void> {
  const items = await readAll()
  const now = Date.now()
  const halted = new Set<string>()
  const sentIds = new Set<string>()
  // Iterate a stable snapshot: we mutate `items` (splicing sent items) and
  // persist it after each step, so we must NOT iterate `items` directly or an
  // in-place removal would skip the next sibling (a FIFO-ordering hazard).
  const survivors = () => items.filter((i) => !sentIds.has(i.clientMsgId))
  for (const item of [...items]) {
    const convKey = item.address.conversation_id ?? item.address.site_id ?? ''
    if (halted.has(convKey)) continue
    if (item.state !== 'queued' || item.nextAttemptAt > now) {
      halted.add(convKey)
      continue
    }
    item.state = 'sending'
    await writeAll(survivors())
    let result: SendResult
    try {
      result = await send(item)
    } catch {
      result = { ok: false, permanent: false }
    }
    if (result.ok) {
      sentIds.add(item.clientMsgId)
    } else if (result.permanent) {
      item.state = 'failed_permanent'
      halted.add(convKey)
    } else {
      item.state = 'queued'
      item.attempts += 1
      item.nextAttemptAt = Date.now() + nextAttemptDelayMs(item.attempts)
      halted.add(convKey)
    }
    await writeAll(survivors())
  }
}
