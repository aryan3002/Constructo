/**
 * Architect chat — renders the shared ChatInbox routing to the architect-group
 * conversation detail, so the architect reads + answers site design questions
 * in the crew thread without leaving their own tab navigator. The inbox's "New
 * group" button self-gates to owner; the conversation list is access-scoped
 * server-side (architect is an all-sites role).
 */
import { ChatInbox } from '../owner/_chat_inbox'

export default function ArchitectChatInbox() {
  return <ChatInbox detailHref="/(contractor)/architect/chat/[id]" />
}
