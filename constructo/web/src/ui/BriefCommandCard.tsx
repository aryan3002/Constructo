import type { ReactNode } from 'react'
import { CheckIcon, PauseIcon, UserPlusIcon } from './icons'
import { EvidenceCard, type EvidenceItem } from './EvidenceCard'
import { StatusDot, type Status } from './StatusPill'
import { H2, Mono, Small } from './Typography'

export type BriefAction = 'approve' | 'hold' | 'assign'

export interface BriefRisk {
  id: string
  claim: ReactNode
  status: Status
  detail?: ReactNode
  evidence?: EvidenceItem[]
}

export interface BriefCommandCardProps {
  siteName: string
  /** Worst-risk status for the whole site (shown beside the name). */
  siteStatus: Status
  /** Optional small meta, e.g. "12 updates today". */
  meta?: string
  risks: BriefRisk[]
  /** Inline decision callback for each row (used by the default chip cluster). */
  onAction?: (riskId: string, action: BriefAction) => void
  /**
   * Override the trailing action cluster per risk. When provided it replaces the
   * default Approve/Hold/Assign chips — used by the Owner Command Center to gate
   * the chips by capability (owner "Approve" vs PM "Propose to owner →").
   */
  renderActions?: (risk: BriefRisk) => ReactNode
  className?: string
}

const ACTION_META: Record<
  BriefAction,
  { label: string; Icon: (p: { title?: string }) => ReactNode; cls: string }
> = {
  approve: {
    label: 'Approve',
    Icon: CheckIcon,
    cls: 'border-ok/40 text-ok hover:bg-ok/10 active:bg-ok/15',
  },
  hold: {
    label: 'Hold',
    Icon: PauseIcon,
    cls: 'border-warn/40 text-warn hover:bg-warn/10 active:bg-warn/15',
  },
  assign: {
    label: 'Assign',
    Icon: UserPlusIcon,
    cls: 'border-info/40 text-info hover:bg-info/10 active:bg-info/15',
  },
}

function ActionChip({
  action,
  onClick,
}: {
  action: BriefAction
  onClick?: () => void
}) {
  const meta = ACTION_META[action]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-tap items-center gap-1.5 rounded-pill border bg-card px-3 font-body text-small font-semibold cstk-animate transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card ${meta.cls}`}
    >
      <span className="text-[1.05em] leading-none" aria-hidden>
        <meta.Icon title={meta.label} />
      </span>
      {meta.label}
    </button>
  )
}

/**
 * BriefCommandCard — a site-grouped command surface for the owner's daily brief.
 * Lists up to 3 top risks (EvidenceCard rows) each with inline Approve / Hold /
 * Assign chips so the owner can clear the brief without leaving the screen.
 */
export function BriefCommandCard({
  siteName,
  siteStatus,
  meta,
  risks,
  onAction,
  renderActions,
  className,
}: BriefCommandCardProps) {
  const top = risks.slice(0, 3)
  const overflow = risks.length - top.length

  return (
    <section
      aria-label={`${siteName} brief`}
      className={`overflow-hidden rounded-sheet border border-line bg-card shadow-card ${className ?? ''}`.trim()}
    >
      <header className="flex items-center gap-2.5 border-b border-line bg-paper px-4 py-3">
        <StatusDot status={siteStatus} />
        <H2 className="flex-1 truncate" as="h3">
          {siteName}
        </H2>
        {meta ? <Mono className="text-micro text-text-mute">{meta}</Mono> : null}
      </header>

      {top.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Small>No open risks. Site is on track.</Small>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {top.map((risk) => (
            <li key={risk.id} className="p-3">
              {/*
                When actions are overridden (Owner Command Center, narrow column)
                they render full-width BELOW the claim so the claim text keeps the
                whole card width. The default chip cluster stays inline-trailing
                for the wider legacy layouts that use this primitive.
              */}
              <EvidenceCard
                claim={risk.claim}
                status={risk.status}
                detail={risk.detail}
                evidence={risk.evidence ?? []}
                className="!border-0 !bg-transparent !shadow-none"
                trailing={
                  renderActions ? undefined : (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <ActionChip
                        action="approve"
                        onClick={() => onAction?.(risk.id, 'approve')}
                      />
                      <ActionChip
                        action="hold"
                        onClick={() => onAction?.(risk.id, 'hold')}
                      />
                      <ActionChip
                        action="assign"
                        onClick={() => onAction?.(risk.id, 'assign')}
                      />
                    </div>
                  )
                }
              />
              {renderActions ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
                  {renderActions(risk)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {overflow > 0 ? (
        <footer className="border-t border-line px-4 py-2.5 text-center">
          <Small className="font-semibold text-primary-deep">
            +{overflow} more at this site
          </Small>
        </footer>
      ) : null}
    </section>
  )
}
