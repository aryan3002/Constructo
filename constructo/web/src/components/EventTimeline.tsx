import { useState } from 'react'
import type { SiteEvent } from '../api/types'
import {
  EVENT_TYPE_LABEL,
  formatConfidence,
  formatDateTime,
} from '../lib/format'
import { Body, Mono, Small, StatusPill, type Status } from '../ui'

/** Map a raw event type to a status-spine colour for its badge. */
const EVENT_TYPE_STATUS: Record<string, Status> = {
  material_delivery: 'ok',
  attendance: 'info',
  progress_update: 'info',
  payment_request: 'warn',
  approval: 'ok',
  issue: 'risk',
  unknown: 'info',
}

function EvidenceButton({ event }: { event: SiteEvent }) {
  const [open, setOpen] = useState(false)
  const count = event.source_message_ids.length
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-tap font-body text-small font-semibold text-primary-deep cstk-animate hover:underline disabled:cursor-default disabled:text-text-mute disabled:no-underline"
        disabled={count === 0}
        aria-expanded={open}
      >
        {count === 0 ? 'No evidence' : `Evidence (${count}) ${open ? '▲' : '▼'}`}
      </button>
      {open && count > 0 && (
        <ul className="mt-1 space-y-1 rounded-control border border-line bg-paper p-2">
          {event.source_message_ids.map((id) => (
            <li key={id}>
              <Mono className="text-micro text-text-mute">msg: {id}</Mono>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * EventTimeline — a site's day of captured events on the Blueprint kit. Each row
 * is a --paper card with a status-spine type badge, a confidence indicator, and
 * a one-tap evidence reveal (the soul of the product).
 */
export function EventTimeline({ events }: { events: SiteEvent[] }) {
  return (
    <ol className="space-y-3" data-testid="event-timeline">
      {events.map((event) => (
        <li
          key={event.id}
          data-testid="event-item"
          className="rounded-card border border-line bg-card p-4 shadow-card"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="event-badge">
              <StatusPill
                status={EVENT_TYPE_STATUS[event.event_type] ?? 'info'}
                size="sm"
                label={EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
              />
            </span>
            {event.needs_clarification && (
              <span data-testid="needs-clarification">
                <StatusPill status="warn" size="sm" label="Needs clarification" />
              </span>
            )}
            <span className="ml-auto" data-testid="event-confidence">
              <Small className="!text-text-mute">
                Confidence {formatConfidence(event.confidence)}
              </Small>
            </span>
          </div>

          <Body className="mt-2 !text-small">{event.summary}</Body>
          <Small className="mt-1 block !text-text-mute">
            {formatDateTime(event.created_at)} · {event.occurred_on}
          </Small>

          <EvidenceButton event={event} />
        </li>
      ))}
    </ol>
  )
}
