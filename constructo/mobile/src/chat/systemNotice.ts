/** Derive a centered system-notice line from a message, or null for an ordinary
 * bubble (Task B-T4). A blocked-contested reply shows the freeze reason; a
 * sender_kind=system row shows its body verbatim. Pure + testable. */
import type { ChatMessage } from '../api/chat'

export function systemNotice(m: ChatMessage): string | null {
  if (m.meta?.blocked?.reason === 'contested') {
    return "Can't approve — this value is disputed. Resolve the dispute first."
  }
  if (m.sender_kind === 'system') {
    return m.body ?? ''
  }
  return null
}
