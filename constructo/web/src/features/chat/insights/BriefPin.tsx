/**
 * BriefPin — the site brief pinned atop a site thread (Phase D).
 *
 * Shows today's ranked risks (headline + severity-dotted messages). Renders
 * nothing when calm (no risks) — calm = good. Semantic tokens only.
 */
import type { ChatBrief } from '../../../api/chat'

export interface BriefPinProps {
  brief: ChatBrief | undefined
}

const SEV_DOT: Record<string, string> = {
  high: 'bg-risk',
  medium: 'bg-warn',
  low: 'bg-info',
}

export function BriefPin({ brief }: BriefPinProps) {
  if (!brief || brief.risk_count === 0) return null

  return (
    <div
      data-testid="brief-pin"
      className="mb-3 rounded-sheet border border-edge bg-surface-card px-4 py-3"
    >
      <p className="mb-2 font-body text-small font-semibold text-text-primary">{brief.headline}</p>
      <ul className="flex flex-col gap-1.5">
        {brief.risks.map((r, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[r.severity] ?? 'bg-info'}`}
            />
            <span className="font-body text-small text-text-secondary">{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
