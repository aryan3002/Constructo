/**
 * MessageBubble — web translation of the mobile MessageBubble from
 * `constructo/mobile/src/chat/MessageView.tsx`.
 *
 * Uses Tailwind semantic tokens (neev + neev-dark) only — no hardcoded hex.
 * Renders: body text, sender name (for others when showSenderName), timestamp
 * (HH:MM), delivery ticks (own messages only), a quoted-parent strip when
 * reply_to_id resolves, an inline image for image attachments, and a small chip
 * for document/voice attachments.  An optional Reply affordance fires onReply.
 */
import { type MouseEvent } from 'react'
import type { ChatMessage } from '../../api/chat'
import type { DeliveryState } from './ticks'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO timestamp as HH:MM (local time). */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Glyph + read-state for a delivery state, or null when no state. */
function tickInfo(state: DeliveryState | undefined): { glyph: string; read: boolean } | null {
  if (!state) return null
  if (state === 'sent') return { glyph: '✓', read: false }
  if (state === 'delivered') return { glyph: '✓✓', read: false }
  if (state === 'read') return { glyph: '✓✓', read: true }
  return null
}

// ---------------------------------------------------------------------------
// QuotedParent — left-accent strip referencing a replied-to message
// ---------------------------------------------------------------------------

function QuotedParent({ parent }: { parent: ChatMessage }) {
  // Surface the first event summary if available, else the message body.
  const snippet =
    (parent.events && parent.events.length > 0 ? parent.events[0].summary : null) ??
    parent.body ??
    '…'
  const label = parent.sender_name
    ? `${parent.sender_name}: ${snippet}`
    : snippet

  return (
    <div
      className="mb-1.5 rounded-sm border-l-2 border-brand bg-surface-sunken px-2 py-1 text-text-secondary"
      aria-label="Quoted message"
    >
      <p className="line-clamp-2 font-body text-small">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
  message: ChatMessage
  /** True when the current user is the sender of this message. */
  mine: boolean
  /**
   * When true, a small sender-name line is rendered above other-side bubbles
   * (when sender_name is available) — used in multi-sender threads.
   */
  showSenderName: boolean
  /** Cursor-derived delivery state for OWN messages; ignored for others. */
  deliveryState?: DeliveryState
  /** Called when the user triggers a reply action on this message. */
  onReply?: (m: ChatMessage) => void
  /** Returns the parent message for reply_to_id, or undefined if not in cache. */
  resolveParent?: (id: string) => ChatMessage | undefined
}

export function MessageBubble({
  message,
  mine,
  showSenderName,
  deliveryState,
  onReply,
  resolveParent,
}: MessageBubbleProps) {
  const tick = mine ? tickInfo(deliveryState) : null
  const timestamp = message.created_at ? fmtTime(message.created_at) : null
  const parentMsg =
    message.reply_to_id && resolveParent ? resolveParent(message.reply_to_id) : undefined

  const isImage = message.attachment_url && message.media_type === 'image'
  const isDoc =
    message.attachment_url &&
    (message.media_type === 'document' || message.media_type === 'voice')

  // ── Bubble container: own → right, other → left ──────────────────────────
  const bubbleBase =
    'relative flex w-fit max-w-[80%] flex-col gap-0.5 rounded-sheet px-3 py-2'
  const ownClasses = `${bubbleBase} ml-auto bg-brand-subtle text-text-primary`
  const otherClasses = `${bubbleBase} mr-auto border border-edge bg-surface-card text-text-primary`
  const bubbleClasses = mine ? ownClasses : otherClasses

  // ── Right-click / context-menu reply handler ──────────────────────────────
  const handleContextMenu = onReply
    ? (e: MouseEvent) => {
        e.preventDefault()
        onReply(message)
      }
    : undefined

  return (
    <div
      className={bubbleClasses}
      onContextMenu={handleContextMenu}
      data-testid={mine ? 'bubble-mine' : 'bubble-other'}
    >
      {/* Sender name — only for received messages when showSenderName */}
      {showSenderName && !mine && message.sender_name ? (
        <span className="font-body text-micro font-semibold text-text-muted">
          {message.sender_name}
          {message.sender_role ? ` · ${message.sender_role}` : ''}
        </span>
      ) : null}

      {/* Quoted parent strip */}
      {parentMsg ? <QuotedParent parent={parentMsg} /> : null}

      {/* Inline image attachment — fixed-size box reserves space so the thread
          does not reflow/jump as the presigned R2 GET resolves. */}
      {isImage ? (
        <div className="mb-1 h-[180px] w-[240px] overflow-hidden rounded-md bg-surface-sunken">
          <img
            src={message.attachment_url!}
            alt="attachment"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      {/* Document / voice chip */}
      {isDoc ? (
        <a
          href={message.attachment_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface-sunken px-2 py-0.5 font-body text-small text-text-muted hover:text-text-primary"
        >
          📎 {message.media_type}
        </a>
      ) : null}

      {/* Body text */}
      {message.body ? (
        <p className="font-body text-body leading-snug">{message.body}</p>
      ) : null}

      {/* Timestamp + delivery ticks row */}
      {timestamp ? (
        <span
          className={`flex items-center gap-1 cstk-mono text-micro text-text-muted ${mine ? 'ml-auto' : ''}`}
        >
          {timestamp}
          {tick ? (
            <span
              className={tick.read ? 'text-brand' : 'text-text-muted'}
              aria-label={
                deliveryState === 'read'
                  ? 'Read'
                  : deliveryState === 'delivered'
                    ? 'Delivered'
                    : 'Sent'
              }
            >
              {tick.glyph}
            </span>
          ) : null}
        </span>
      ) : null}

      {/* Reply button — shown on hover via group/peer CSS */}
      {onReply ? (
        <button
          type="button"
          aria-label="Reply"
          onClick={() => onReply(message)}
          className="absolute -right-8 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100"
          tabIndex={0}
        >
          ↩
        </button>
      ) : null}
    </div>
  )
}
