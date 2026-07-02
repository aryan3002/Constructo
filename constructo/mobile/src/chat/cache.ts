/**
 * Per-conversation message cache (spine A8/A9): thread opens instantly from
 * storage (offline-first), then syncs incrementally with after_seq=maxCachedSeq
 * — replacing today's full afterSeq:0 refetch every poll. Render order is
 * ALWAYS seq (the server's ordering authority), never local time.
 *
 * A module-level in-memory layer fronts AsyncStorage so the steady-state 8s
 * poll costs zero JSON parse on the JS thread: the persisted blob is parsed
 * once per conversation per app session, and an unchanged merge returns the
 * SAME array reference — react-query's structural sharing then short-circuits
 * on identity and no bubble re-renders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ChatMessage } from '../api/chat'

const KEY_PREFIX = 'constructo.chat.cache.'
// Retain a full thread's worth of history (was 200, which silently dropped older
// messages of a large seeded thread). FlatList virtualizes, so this renders fine.
const MAX_CACHED = 2000

// convKey → the canonical in-memory copy (hydrated from storage once).
const mem = new Map<string, ChatMessage[]>()

/** Test seam: drop the in-memory layer (AsyncStorage.clear() can't reach it). */
export function __resetChatCacheForTests(): void {
  mem.clear()
}

export async function loadThreadCache(convKey: string): Promise<ChatMessage[]> {
  const hit = mem.get(convKey)
  if (hit) return hit
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + convKey)
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : []
    mem.set(convKey, parsed)
    return parsed
  } catch {
    return []
  }
}

/** Client-only fields we stamp onto cached messages (never sent by the server)
 *  and must survive a newer server copy replacing the row on merge. The load-
 *  bearing one: `attachment_local_uri` keeps a just-sent photo rendering from
 *  its local file instead of flashing to a placeholder while the app re-
 *  downloads the byte-identical image it uploaded a second ago. */
function carryClientFields(prev: ChatMessage, next: ChatMessage): ChatMessage {
  if (prev.attachment_local_uri && !next.attachment_local_uri) {
    return { ...next, attachment_local_uri: prev.attachment_local_uri }
  }
  return next
}

export async function mergeMessages(
  convKey: string,
  incoming: ChatMessage[],
): Promise<ChatMessage[]> {
  const existing = await loadThreadCache(convKey)
  const bySeq = new Map<number, ChatMessage>()
  for (const msg of existing) bySeq.set(msg.seq, msg)

  // No-change fast path: every incoming row is already cached byte-identically
  // → return the SAME array reference (steady-state poll = zero re-render work).
  const unchanged = incoming.every((msg) => {
    const prev = bySeq.get(msg.seq)
    return prev !== undefined && JSON.stringify(prev) === JSON.stringify(msg)
  })
  if (unchanged) return existing

  for (const msg of incoming) {
    const prev = bySeq.get(msg.seq)
    bySeq.set(msg.seq, prev ? carryClientFields(prev, msg) : msg) // newer copy wins (event upgrades)
  }
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_CACHED)
  mem.set(convKey, merged)
  await AsyncStorage.setItem(KEY_PREFIX + convKey, JSON.stringify(merged))
  return merged
}

export async function maxCachedSeq(convKey: string): Promise<number> {
  const cached = await loadThreadCache(convKey)
  return cached.length ? cached[cached.length - 1].seq : 0
}
