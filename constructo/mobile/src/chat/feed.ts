/**
 * Pure feed assembly for the unified chat kit. A message that became structured
 * SiteEvents renders as one CaptureCard per event (the proof — source text +
 * attachment — rides the FIRST card only, mirroring the owner/supervisor screens);
 * a plain message renders as a MessageBubble. Screens interleave their own rows
 * (Nivaan @ask answers, the homeowner Home Room weave) around these.
 *
 * No React — trivially unit-testable.
 */
import type { ChatEvent, ChatMessage } from '../api/chat'

/** One rendered row produced from a raw message. */
export type ChatFeedItem =
  | { kind: 'bubble'; key: string; message: ChatMessage }
  | {
      kind: 'card'
      key: string
      message: ChatMessage
      event: ChatEvent
      lang: 'en' | 'hi'
      sourceText: string | null
      attachmentUrl: string | null
    }

/** Map raw messages → feed rows, preserving order. */
export function messagesToFeed(messages: ChatMessage[], lang: 'en' | 'hi'): ChatFeedItem[] {
  const items: ChatFeedItem[] = []
  for (const message of messages) {
    if (message.events && message.events.length > 0) {
      message.events.forEach((event, i) => {
        items.push({
          kind: 'card',
          key: `${message.id}:${event.id}`,
          message,
          event,
          lang,
          sourceText: i === 0 ? message.body : null,
          attachmentUrl: i === 0 ? message.attachment_url : null,
        })
      })
    } else {
      items.push({ kind: 'bubble', key: message.id, message })
    }
  }
  return items
}
