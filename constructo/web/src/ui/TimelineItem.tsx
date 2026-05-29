import type { ReactNode } from 'react'
import { Body, Mono, Small } from './Typography'

export interface TimelineItemProps {
  /** Short type badge, e.g. "Delivery", "Attendance", "Issue". */
  typeLabel: ReactNode
  /** Tailwind classes for the badge tint (defaults to a neutral chip). */
  typeClassName?: string
  /** Plain-language summary of what happened. */
  summary: ReactNode
  /** When it occurred — already-formatted date/time string. */
  occurredOn: string
  /** 0..1 model confidence. A confidence indicator shows only when < 1. */
  confidence?: number
  /** Optional handler for the "View evidence" link. */
  onViewEvidence?: () => void
  /** Whether evidence exists (controls the link). */
  hasEvidence?: boolean
  /** Marks the last item so the connector line is hidden. */
  isLast?: boolean
  className?: string
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const tone = pct >= 80 ? 'bg-ok' : pct >= 50 ? 'bg-warn' : 'bg-risk'
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`Model confidence ${pct}%`}
      aria-label={`Confidence ${pct} percent`}
    >
      <span className="h-1.5 w-12 overflow-hidden rounded-pill bg-line">
        <span
          className={`block h-full rounded-pill ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <Mono className="text-micro text-text-mute">{pct}%</Mono>
    </span>
  )
}

/**
 * TimelineItem — a single event in a site timeline: a type badge, a
 * plain-language summary, when it occurred, a confidence indicator (shown only
 * when the model is < 100% sure), and a link to its evidence.
 */
export function TimelineItem({
  typeLabel,
  typeClassName,
  summary,
  occurredOn,
  confidence,
  onViewEvidence,
  hasEvidence = false,
  isLast = false,
  className,
}: TimelineItemProps) {
  const showConfidence = typeof confidence === 'number' && confidence < 1

  return (
    <li className={`relative flex gap-3 ${className ?? ''}`.trim()}>
      {/* Rail */}
      <div className="flex flex-col items-center">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-card" />
        {!isLast ? <span className="mt-1 w-px flex-1 bg-line" /> : null}
      </div>

      <div className="flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-pill px-2.5 py-0.5 font-body text-micro font-semibold ${
              typeClassName ?? 'bg-paper text-text-mute border border-line'
            }`}
          >
            {typeLabel}
          </span>
          {showConfidence ? <ConfidenceMeter value={confidence!} /> : null}
        </div>

        <Body className="mt-1.5">{summary}</Body>

        <div className="mt-1 flex items-center gap-3">
          <Mono className="text-micro text-text-mute">{occurredOn}</Mono>
          {hasEvidence ? (
            <button
              type="button"
              onClick={onViewEvidence}
              className="rounded font-body text-small font-semibold text-primary-deep underline-offset-2 cstk-animate transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              View evidence
            </button>
          ) : (
            <Small className="text-micro">No evidence</Small>
          )}
        </div>
      </div>
    </li>
  )
}
