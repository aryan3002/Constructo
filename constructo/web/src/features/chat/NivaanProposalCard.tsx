/**
 * NivaanProposalCard — web port of the Nivaan proposal card from
 * `constructo/mobile/src/chat/nivaanProposal.ts` + `MessageView.tsx`.
 *
 * Renders a structured Nivaan proposal (AI-generated structured-capture
 * suggestion) as a card with an `✦ Nivaan` eyebrow, the proposal summary,
 * and optional Confirm / Dismiss buttons (guarded against double-commit via
 * local state).  Semantic tokens only — no hardcoded hex.  Neev light +
 * neev-dark aware.
 *
 * Props:
 *   message   — a ChatMessage whose `meta.proposal` carries the proposal.
 *   onConfirm — called with (capture_type, fields) when the user confirms.
 */
import { useState } from 'react'
import type { ChatMessage } from '../../api/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionState = 'idle' | 'confirmed' | 'dismissed'

// ---------------------------------------------------------------------------
// NivaanProposalCard
// ---------------------------------------------------------------------------

export interface NivaanProposalCardProps {
  message: ChatMessage
  onConfirm: (captureType: string, fields: Record<string, unknown>) => void
}

export function NivaanProposalCard({ message, onConfirm }: NivaanProposalCardProps) {
  const [action, setAction] = useState<ActionState>('idle')

  const proposal = message.meta?.proposal
  if (!proposal) return null

  const handleConfirm = () => {
    if (action !== 'idle') return
    setAction('confirmed')
    onConfirm(proposal.capture_type, proposal.fields)
  }

  const handleDismiss = () => {
    if (action !== 'idle') return
    setAction('dismissed')
  }

  return (
    <article
      data-testid="nivaan-proposal-card"
      className="bg-surface-card border border-edge rounded-card shadow-card p-4 flex flex-col gap-2 max-w-[80%]"
    >
      {/* ✦ Nivaan eyebrow */}
      <span
        data-testid="nivaan-eyebrow"
        className="text-[var(--celebrate-text)] text-micro font-semibold uppercase tracking-wide"
      >
        ✦ Nivaan
      </span>

      {/* Proposal summary */}
      <p
        data-testid="proposal-summary"
        className="font-body text-body text-text-primary"
      >
        {proposal.summary}
      </p>

      {/* Actions */}
      {action === 'idle' ? (
        <div className="flex items-center gap-2">
          {proposal.committable ? (
            <button
              type="button"
              data-testid="confirm-btn"
              onClick={handleConfirm}
              className="bg-brand text-text-on-brand rounded-full px-4 py-1.5 font-body text-small font-semibold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Confirm
            </button>
          ) : null}
          <button
            type="button"
            data-testid="dismiss-btn"
            onClick={handleDismiss}
            className="border border-edge text-text-secondary rounded-full px-4 py-1.5 font-body text-small hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <span
          data-testid="action-status"
          className="font-body text-small text-text-muted"
        >
          {action === 'confirmed' ? '✓ Added' : 'Dismissed'}
        </span>
      )}
    </article>
  )
}
