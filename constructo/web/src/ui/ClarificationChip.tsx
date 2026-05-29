import type { ReactNode } from 'react'
import { Body } from './Typography'

export interface ClarificationAnswer {
  id: string
  label: ReactNode
}

export interface ClarificationChipProps {
  /** The one-line question, e.g. "Was the 50 bags cement for Tower A or B?". */
  question: ReactNode
  /** 2–3 tappable answers. */
  answers: ClarificationAnswer[]
  onAnswer?: (answerId: string) => void
  className?: string
}

/**
 * ClarificationChip — when the system is unsure, it asks one short question with
 * 2–3 tappable answer chips. Keeps disambiguation in flow, no typing required.
 */
export function ClarificationChip({
  question,
  answers,
  onAnswer,
  className,
}: ClarificationChipProps) {
  return (
    <div
      role="group"
      aria-label="Clarification needed"
      className={`rounded-card border border-info/30 bg-info/5 p-3 ${className ?? ''}`.trim()}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-info font-mono text-xs font-bold text-white"
        >
          ?
        </span>
        <Body className="font-semibold !text-text">{question}</Body>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
        {answers.slice(0, 3).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAnswer?.(a.id)}
            className="inline-flex min-h-tap items-center rounded-pill border border-info/40 bg-card px-4 font-body text-small font-semibold text-info cstk-animate transition active:scale-[0.97] hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1 focus-visible:ring-offset-card"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
