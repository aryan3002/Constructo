/**
 * Owner Chat inbox — renders the shared ChatInbox, routing to the owner-group
 * conversation detail so taps stay in the owner tab navigator.
 */
import { ChatInbox } from './_chat_inbox'

export default function OwnerChatInbox() {
  return <ChatInbox detailHref="/(contractor)/owner/chat/[id]" />
}
