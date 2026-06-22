import type { ChatMessage } from '../../api/chat'

export function mergeMessages(
  existing: ChatMessage[], incoming: ChatMessage[], max = 200,
): ChatMessage[] {
  const bySeq = new Map<number, ChatMessage>()
  for (const m of existing) bySeq.set(m.seq, m)
  for (const m of incoming) bySeq.set(m.seq, m) // newer wins
  const sorted = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  return sorted.slice(Math.max(0, sorted.length - max))
}
