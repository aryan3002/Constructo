/**
 * CaptureAnnotation — a compact, SECONDARY read of an AI extraction, shown BELOW
 * the real message bubble (photo / text) instead of replacing it.
 *
 * Only real captures reach here — ChatThread's `isRealCapture` filters out the
 * low-confidence guesses ("Delivery · 18% sure · No message provided") that used
 * to render as full cards and bury the actual photo behind a "Show proof" toggle.
 * So the thread reads as a normal chat, with the structured data as a quiet
 * addendum under the message, never a mask over it.
 */
import type { ChatEvent, ChatMessage } from '../../api/chat'
import { EVENT_META, G, keyFields } from './CaptureCard'

export interface CaptureAnnotationProps {
  event: ChatEvent
  message: ChatMessage
  /** Align to the sender's side (own → right, other → left) under the bubble. */
  mine: boolean
  onDispute?: () => void
  onMakeTodo?: () => void
}

export function CaptureAnnotation({ event, mine, onDispute, onMakeTodo }: CaptureAnnotationProps) {
  const meta = EVENT_META[event.event_type] ?? EVENT_META.unknown
  const Icon = G[meta.icon]
  const fieldsLine = keyFields(event.event_type, event.fields)
  // Prefer the structured field line; fall back to the AI summary for typed
  // events with no extractable numerals (issue / progress / approval).
  const detail = fieldsLine || event.summary || ''
  const approved = (event.fields as { status?: string } | undefined)?.status === 'approved'

  return (
    <div
      data-testid="capture-annotation"
      className={`mt-1 flex w-fit max-w-[80%] flex-col gap-1 rounded-xl border border-edge bg-surface-sunken px-2.5 py-1.5 ${mine ? 'ml-auto' : 'mr-auto'}`}
    >
      {/* Type + status */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-body text-micro font-semibold text-text-secondary">
          <span className="text-[1em] leading-none" aria-hidden>
            <Icon aria-hidden />
          </span>
          {meta.en}
        </span>
        {event.contested ? (
          <span role="status" data-testid="ann-disputed" className="rounded-full border border-risk-fg/20 bg-risk-bg px-1.5 py-0.5 font-body text-micro font-semibold text-risk-fg">
            Disputed
          </span>
        ) : approved ? (
          <span role="status" className="rounded-full border border-ok-fg/20 bg-ok-bg px-1.5 py-0.5 font-body text-micro font-semibold text-ok-fg">
            Approved
          </span>
        ) : event.needs_clarification ? (
          <span role="status" data-testid="ann-check" className="rounded-full border border-warn-fg/20 bg-warn-bg px-1.5 py-0.5 font-body text-micro font-semibold text-warn-fg">
            Check this
          </span>
        ) : null}
      </div>

      {/* The extracted detail — structured field line (mono) or the AI summary. */}
      {detail ? (
        <span className={`text-small text-text-primary ${fieldsLine ? 'cstk-mono font-mono' : 'font-body'}`}>
          {detail}
        </span>
      ) : null}

      {/* Actions */}
      {onDispute || onMakeTodo ? (
        <div className="flex items-center gap-3">
          {onDispute ? (
            <button
              type="button"
              onClick={onDispute}
              className="font-body text-micro font-medium text-text-muted hover:text-text-primary hover:underline"
            >
              {event.contested ? 'Resolve' : 'Dispute'}
            </button>
          ) : null}
          {onMakeTodo ? (
            <button
              type="button"
              onClick={onMakeTodo}
              className="font-body text-micro font-medium text-text-muted hover:text-text-primary hover:underline"
            >
              Make a to-do
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
