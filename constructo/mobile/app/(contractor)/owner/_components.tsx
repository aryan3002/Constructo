/**
 * Owner-local composite components + helpers (NOT in src/ui — these are
 * Owner-branch specific). Built on the shared kit + Blueprint theme:
 *
 *   - formatDate / formatWhen                     — time formatting
 *   - riskToEvidence                              — Risk → EvidenceCard items
 *   - BriefCommandCard  (the hero card)           — risk + inline Approve/Hold/Assign
 *   - PulseCard         (2×2 pulse tile)          — calm, hide-empty
 *   - SiteRollupRow     (sites list row)          — status + counts
 *   - ApprovalRow       (decisions inbox row)     — claim + decision chips
 *   - SectionLabel / StateBlock                   — small shared bits
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP, severityToStatus, type Status } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  EmptyState,
  Micro,
  NeedsYouCard,
  Small,
  StatusPill,
  type EvidenceChipProps,
  type EvidenceItem,
} from '../../../src/ui'
import type { Risk } from '../../../src/api/owner'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ISO date/datetime → "12 Jan 2026" (empty when unparseable). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** ISO datetime → "12 Jan, 7:02am" (compact, for timeline/SLA). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  let h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h}:${m}${ampm}`
}

/** Build EvidenceCard items from a risk's evidence_event_ids. The brief gives
 * us only ids; we surface each as a tappable proof reference (real media URLs
 * resolve server-side at evidence-open time — see Owner.md §6.1). */
export function idsToEvidence(ids: string[], label: string): EvidenceItem[] {
  if (!ids || ids.length === 0) return []
  return ids.map((id, i) => ({
    kind: 'message' as const,
    label: `${label} ${i + 1}`,
    detail: `Event ${id.slice(0, 8)}`,
    meta: '#' + (i + 1),
  }))
}

// ---------------------------------------------------------------------------
// SectionLabel — the uppercase eyebrow above a section.
// ---------------------------------------------------------------------------
export function SectionLabel({ children, trailing }: { children: string; trailing?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: SPACE.sm,
      }}
    >
      <Small muted style={{ letterSpacing: 1 }}>
        {children.toUpperCase()}
      </Small>
      {trailing}
    </View>
  )
}

// ---------------------------------------------------------------------------
// StateBlock — shared loading / error / empty states.
// ---------------------------------------------------------------------------
export function LoadingBlock() {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  )
}

export function ErrorBlock({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <EmptyState
      variant="empty"
      icon="alert-triangle"
      title={message}
      action={<Button title={retryLabel} variant="secondary" onPress={onRetry} />}
    />
  )
}

// ---------------------------------------------------------------------------
// BriefCommandCard — THE hero. A cross-site risk rendered as a NeedsYouCard
// (proof-on-tap evidence + ranked status + Approve / Hold / Assign actions).
// ---------------------------------------------------------------------------
export interface BriefDecision {
  approve: () => void
  hold: () => void
  assign: () => void
}

export function BriefCommandCard({
  risk,
  siteName,
  rank,
  pending,
  resolvedLabel,
  proofLabel,
  chips,
  onChip,
}: {
  risk: Risk
  siteName: string
  rank?: number
  pending: boolean
  /** When set, the card has collapsed into its decision consequence. */
  resolvedLabel?: string
  proofLabel: string
  chips: { approve: string; hold: string; assign: string }
  onChip: (action: 'approve' | 'hold' | 'assign') => void
}) {
  const status: Status = severityToStatus(risk.severity)
  const domain = risk.kind.replace(/_/g, ' ')

  if (resolvedLabel) {
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <StatusPill status="ok" size="sm" label={resolvedLabel} />
      </Card>
    )
  }

  // Build evidence chips from event ids.
  const evidenceChips: EvidenceChipProps[] = idsToEvidence(risk.evidence_event_ids, proofLabel).map(
    (item) => ({ kind: 'message' as const, label: item.label ?? proofLabel }),
  )

  return (
    <View style={{ gap: SPACE.sm }}>
      <NeedsYouCard
        rank={rank}
        status={status}
        statusLabel={domain}
        title={risk.message}
        detail={siteName}
        evidence={evidenceChips}
        primaryLabel={chips.approve}
        tone={status === 'risk' ? 'cautionary' : 'affirmative'}
        canApprove={true}
        onPrimary={pending ? undefined : () => onChip('approve')}
      />
      {/* Hold + Assign — rendered separately so Hold gets its danger ink-outline */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm, paddingHorizontal: SPACE.xs }}>
        <Button title={chips.hold} variant="danger" size="md" disabled={pending} onPress={() => onChip('hold')} />
        <Button title={chips.assign} variant="secondary" size="md" disabled={pending} onPress={() => onChip('assign')} />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// PulseCard — a calm 2×2 tile (Cash / Labor / Material / Progress).
// ---------------------------------------------------------------------------
export function PulseCard({
  glyph,
  label,
  status,
  headline,
  supporting,
}: {
  glyph: string
  label: string
  status: Status
  headline: string
  supporting?: string
}) {
  return (
    <Card style={{ flex: 1, gap: SPACE.xs, minHeight: 96 }} padded>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs }}>
        <Micro muted style={{ letterSpacing: 1, flexShrink: 1 }}>
          {glyph} {label.toUpperCase()}
        </Micro>
        <StatusPill status={status} size="sm" />
      </View>
      <Body style={{ fontWeight: '600' }}>{headline}</Body>
      {supporting ? <Small muted numberOfLines={2}>{supporting}</Small> : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SiteRollupRow — one site in the portfolio list / roll-up strip.
// ---------------------------------------------------------------------------
export function SiteRollupRow({
  name,
  meta,
  status,
  riskLine,
  onPress,
}: {
  name: string
  meta?: string
  status: Status
  riskLine: string
  onPress?: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: TAP,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: SPACE.lg,
          opacity: pressed ? 0.92 : 1,
        },
        theme.shadowCard,
      ]}
    >
      <StatusPill status={status} size="sm" />
      <View style={{ flex: 1 }}>
        <BodyStrong numberOfLines={1}>{name}</BodyStrong>
        {meta ? <Small muted numberOfLines={1}>{meta}</Small> : null}
      </View>
      <Small muted>{riskLine}</Small>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// ApprovalRow — one pending decision in the inbox.
// Renders as a NeedsYouCard (the owner-decides pattern) with a leading
// selection checkbox for batch-approve outside the card boundary.
// ---------------------------------------------------------------------------
export function ApprovalRow({
  title,
  detail,
  status,
  tag,
  slaLabel,
  evidence,
  pending,
  selected,
  onToggleSelect,
  chips,
  onChip,
}: {
  title: string
  detail?: string | null
  status: Status
  tag?: string
  slaLabel?: string
  evidence: EvidenceItem[]
  pending: boolean
  selected: boolean
  onToggleSelect: () => void
  chips: { approve: string; hold: string; assign: string }
  onChip: (action: 'approve' | 'hold' | 'assign') => void
}) {
  const { theme } = useTheme()
  const c = theme.colors

  // Build evidence chips for NeedsYouCard.
  const evidenceChips: EvidenceChipProps[] = evidence.map((item) => ({
    kind: 'message' as const,
    label: item.label ?? title,
  }))

  // SLA as a terse "by when" line.
  const sla = [tag, slaLabel].filter(Boolean).join(' · ') || undefined

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
      {/* Batch-select checkbox — outside the card, preserves NeedsYouCard layout */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={onToggleSelect}
        hitSlop={8}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: selected ? c.accent : c.line,
          backgroundColor: selected ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: SPACE.lg,
        }}
      >
        {selected ? <Micro color={c.onAccent} style={{ fontSize: 14, lineHeight: 16 }}>✓</Micro> : null}
      </Pressable>

      <View style={{ flex: 1, gap: SPACE.xs }}>
        <NeedsYouCard
          status={status}
          statusLabel={status === 'risk' ? 'Escalated' : status === 'info' ? 'Homeowner' : 'Pending'}
          title={title}
          detail={detail ?? undefined}
          evidence={evidenceChips}
          sla={sla}
          primaryLabel={chips.approve}
          secondaryLabel={chips.hold}
          tone={status === 'risk' ? 'cautionary' : 'affirmative'}
          canApprove={true}
          onPrimary={pending ? undefined : () => onChip('approve')}
          onSecondary={pending ? undefined : () => onChip('hold')}
        />
        {/* Assign — tertiary action below the card */}
        <Button
          title={chips.assign}
          variant="secondary"
          size="md"
          disabled={pending}
          onPress={() => onChip('assign')}
        />
      </View>
    </View>
  )
}
