import { useState } from 'react'
import type { SiteEvent } from '../api/types'
import {
  EVENT_TYPE_CLASSES,
  EVENT_TYPE_LABEL,
  formatConfidence,
  formatDateTime,
} from '../lib/format'

function EvidenceButton({ event }: { event: SiteEvent }) {
  const [open, setOpen] = useState(false)
  const count = event.source_message_ids.length
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-brand-600 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
        disabled={count === 0}
        aria-expanded={open}
      >
        {count === 0
          ? 'No evidence'
          : `Evidence (${count}) ${open ? '▲' : '▼'}`}
      </button>
      {open && count > 0 && (
        <ul className="mt-1 space-y-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          {event.source_message_ids.map((id) => (
            <li key={id} className="font-mono">
              msg: {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EventTimeline({ events }: { events: SiteEvent[] }) {
  return (
    <ol className="space-y-3" data-testid="event-timeline">
      {events.map((event) => (
        <li
          key={event.id}
          data-testid="event-item"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="event-badge"
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                EVENT_TYPE_CLASSES[event.event_type] ?? EVENT_TYPE_CLASSES.unknown
              }`}
            >
              {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
            </span>
            {event.needs_clarification && (
              <span
                data-testid="needs-clarification"
                className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800"
                title="This event needs human clarification"
              >
                Needs clarification
              </span>
            )}
            <span
              className="ml-auto text-xs text-slate-500"
              data-testid="event-confidence"
            >
              Confidence {formatConfidence(event.confidence)}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-800">{event.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(event.created_at)} · {event.occurred_on}
          </p>

          <EvidenceButton event={event} />
        </li>
      ))}
    </ol>
  )
}
