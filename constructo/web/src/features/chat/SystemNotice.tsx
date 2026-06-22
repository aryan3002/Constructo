/**
 * SystemNotice — web port of `constructo/mobile/src/chat/systemNotice.ts`.
 *
 * Returns a centered muted notice line for two special message kinds:
 *   • `meta.blocked.reason === 'contested'` → freeze/dispute notice.
 *   • `sender_kind === 'system'`            → the message body verbatim.
 *   • anything else                         → null (render nothing).
 *
 * Semantic tokens only — no hardcoded hex.  Neev light + neev-dark aware.
 */
import type { ChatMessage } from '../../api/chat'

export interface SystemNoticeProps {
  message: ChatMessage
}

export function SystemNotice({ message }: SystemNoticeProps) {
  let notice: string | null = null

  if (message.meta?.blocked?.reason === 'contested') {
    notice = "Can't approve — this value is disputed. Resolve the dispute first."
  } else if (message.sender_kind === 'system') {
    notice = message.body ?? ''
  }

  if (notice === null) return null

  return (
    <p
      data-testid="system-notice"
      className="w-full text-center font-body text-small text-text-muted py-1 px-4"
    >
      {notice}
    </p>
  )
}
