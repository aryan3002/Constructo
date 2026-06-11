/** Pure: derive a Nivaan proposal view (or null) and detect answer rows.
 * Keeps the screen renderers dumb and unit-testable. */
import type { ChatMessage } from '../api/chat'

export interface NivaanProposalView {
  summary: string
  captureType: string
  fields: Record<string, unknown>
  committable: boolean
  tier: 'commit' | 'money'
  kind: 'capture' | 'missing_proof'
}

export function nivaanProposal(m: ChatMessage): NivaanProposalView | null {
  const p = m.meta?.proposal
  if (m.sender_kind !== 'nivaan' || !p) return null
  return {
    summary: p.summary, captureType: p.capture_type, fields: p.fields,
    committable: p.committable, tier: p.tier, kind: p.kind,
  }
}

export function isNivaanAnswer(m: ChatMessage): boolean {
  return m.sender_kind === 'nivaan' && !m.meta?.proposal
}
