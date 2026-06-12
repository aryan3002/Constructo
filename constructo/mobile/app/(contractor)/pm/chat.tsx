/**
 * PM chat — renders the shared ChatInbox routing to the PM-group conversation
 * detail, so the PM reads + answers the crew thread without leaving their own
 * tab navigator. The PM is the team coordinator; chat is the one feature that
 * has to be in-pocket. The inbox's "New group" button self-gates to owner.
 */
import { ChatInbox } from '../owner/_chat_inbox'

export default function PmChatInbox() {
  return <ChatInbox detailHref="/(contractor)/pm/chat/[id]" />
}
