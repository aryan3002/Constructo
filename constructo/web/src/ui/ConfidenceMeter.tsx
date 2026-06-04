import type { ReactNode } from 'react'
import { CheckCircleIcon, WarnTriangleIcon } from './icons'
import { Small } from './Typography'

// Honest-AI confidence treatment (vault 11/00 W5 thresholds): the product never
// hides how sure the AI is. A high-confidence claim reads clean; a middling one
// is tagged amber; a low-confidence one demands an explicit "tap to confirm"
// before it can travel up or out. Value is 0–100.
export type ConfidenceBand = 'high' | 'review' | 'confirm'

export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= 95) return 'high'
  if (confidence >= 88) return 'review'
  return 'confirm'
}

const BAND_META: Record<
  ConfidenceBand,
  { tone: string; bar: string; Icon: (p: { title?: string }) => ReactNode }
> = {
  high: { tone: 'text-ok', bar: 'bg-ok', Icon: CheckCircleIcon },
  review: { tone: 'text-warn', bar: 'bg-warn', Icon: WarnTriangleIcon },
  confirm: { tone: 'text-risk', bar: 'bg-risk', Icon: WarnTriangleIcon },
}

export interface ConfidenceMeterProps {
  /** 0–100. */
  confidence: number
  /** Localized labels per band (caller owns i18n). */
  labels: Record<ConfidenceBand, string>
  /** For the low band: a "tap to confirm" action (the human commit). */
  onConfirm?: () => void
  confirmLabel?: string
  className?: string
}

/**
 * ConfidenceMeter — a thin bar + band label. At the low band it surfaces an
 * explicit confirm affordance so an under-88 AI claim cannot pass silently
 * (CA1). Color is always paired with an icon (never color alone).
 */
export function ConfidenceMeter({
  confidence,
  labels,
  onConfirm,
  confirmLabel,
  className,
}: ConfidenceMeterProps) {
  const pct = Math.max(0, Math.min(100, Math.round(confidence)))
  const band = bandFor(pct)
  const meta = BAND_META[band]

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`.trim()}>
      <div className="flex items-center gap-2">
        <span className={meta.tone} aria-hidden>
          <meta.Icon title="" />
        </span>
        <Small className={`font-semibold ${meta.tone}`}>{labels[band]}</Small>
        <span className="ml-auto font-mono text-micro text-text-mute tabular-nums">
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-pill bg-line"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={labels[band]}
      >
        <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
      </div>
      {band === 'confirm' && onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-1 inline-flex min-h-tap items-center justify-center self-start rounded-pill border border-risk/40 px-3 font-body text-small font-semibold text-risk cstk-animate hover:bg-risk/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-risk/50"
        >
          {confirmLabel}
        </button>
      ) : null}
    </div>
  )
}
