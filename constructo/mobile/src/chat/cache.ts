/**
 * Per-conversation message cache (spine A8/A9): thread opens instantly from
 * storage (offline-first), then syncs incrementally with after_seq=maxCachedSeq
 * — replacing today's full afterSeq:0 refetch every poll. Render order is
 * ALWAYS seq (the server's ordering authority), never local time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ChatMessage } from '../api/chat'

const KEY_PREFIX = 'constructo.chat.cache.'
const MAX_CACHED = 200

export async function loadThreadCache(convKey: string): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + convKey)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

export async function mergeMessages(
  convKey: string,
  incoming: ChatMessage[],
): Promise<ChatMessage[]> {
  const existing = await loadThreadCache(convKey)
  const bySeq = new Map<number, ChatMessage>()
  for (const msg of existing) bySeq.set(msg.seq, msg)
  for (const msg of incoming) bySeq.set(msg.seq, msg) // newer copy wins (event upgrades)
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_CACHED)
  await AsyncStorage.setItem(KEY_PREFIX + convKey, JSON.stringify(merged))
  return merged
}

export async function maxCachedSeq(convKey: string): Promise<number> {
  const cached = await loadThreadCache(convKey)
  return cached.length ? cached[cached.length - 1].seq : 0
}
