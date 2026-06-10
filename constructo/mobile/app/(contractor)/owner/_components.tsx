/**
 * Owner-local composite components + helpers (NOT in src/ui — these are
 * Owner-branch specific). Built on the shared kit + Blueprint theme:
 *
 *   - formatRupees / formatDate / formatWhen      — money + time formatting
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
  BodyStrong,
  Button,
  EvidenceCard,
  Micro,
  Mono,
  Small,
  StatusDot,
  StatusPill,
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

/** Indian rupee formatting: ₹X.X Cr / ₹X.X L / ₹12,000. */
export function formatRupees(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`
  const s = String(Math.round(abs))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3
  return `${sign}₹${grouped}`
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
  const { theme } = useTheme()
  return (
    <View style={{ gap: SPACE.md, paddingVertical: SPACE.xl }}>
      <Small color={theme.colors.risk}>{message}</Small>
      <Button title={retryLabel} variant="secondary" onPress={onRetry} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// BriefCommandCard — THE hero. A cross-site risk rendered as proof-on-tap
// evidence with inline decision chips (Approve / Hold / Assign).
// ---------------------------------------------------------------------------
export interface BriefDecision {
  approve: () => void
  hold: () => void
  assign: () => void
}

export function BriefCommandCard({
  risk,
  siteName,
  magnitude,
  pending,
  resolvedLabel,
  proofLabel,
  chips,
  onChip,
}: {
  risk: Risk
  siteName: string
  /** Right-aligned magnitude in mono (e.g. "₹4.2L" or "−8 today"). */
  magnitude?: string
  pending: boolean
  /** When set, the card has collapsed into its decision consequence. */
  resolvedLabel?: string
  proofLabel: string
  chips: { approve: string; hold: string; assign: string }
  onChip: (action: 'approve' | 'hold' | 'assign') => void
}) {
  const { theme } = useTheme()
  const status: Status = severityToStatus(risk.severity)
  const domain = risk.kind.replace(/_/g, ' ')

  if (resolvedLabel) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: SPACE.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
        }}
      >
        <StatusDot status="ok" />
        <Small muted style={{ flex: 1 }}>{resolvedLabel}</Small>
      </View>
    )
  }

  return (
    <View style={{ gap: 0 }}>
      {/* header strip: severity · site · domain — magnitude */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flex: 1 }}>
          <StatusPill status={status} size="sm" />
          <Micro muted numberOfLines={1} style={{ flexShrink: 1 }}>
            {siteName} · {domain}
          </Micro>
        </View>
        {magnitude ? <Mono color={theme.colors.text}>{magnitude}</Mono> : null}
      </View>

      <EvidenceCard
        claim={risk.message}
        status={status}
        evidence={idsToEvidence(risk.evidence_event_ids, proofLabel)}
      />

      {/* inline decision chips */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingBottom: SPACE.lg,
          marginTop: -SPACE.sm,
        }}
      >
        <Button title={chips.approve} variant="accent" size="md" disabled={pending} loading={pending} onPress={() => onChip('approve')} />
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
  const { theme } = useTheme()
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: SPACE.md,
          gap: SPACE.xs,
          minHeight: 96,
        },
        theme.shadowCard,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Micro muted style={{ letterSpacing: 1 }}>
          {glyph} {label.toUpperCase()}
        </Micro>
        <StatusDot status={status} size={10} />
      </View>
      <Mono color={theme.colors.text} style={{ fontSize: 16, lineHeight: 22 }}>
        {headline}
      </Mono>
      {supporting ? <Small muted numberOfLines={2}>{supporting}</Small> : null}
    </View>
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
      <StatusDot status={status} />
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
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.line,
          padding: SPACE.lg,
          gap: SPACE.sm,
        },
        theme.shadowCard,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
        {/* select checkbox for batch-approve */}
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
            borderColor: selected ? theme.colors.accent : theme.colors.line,
            backgroundColor: selected ? theme.colors.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          {selected ? <Micro color={theme.colors.onAccent} style={{ fontSize: 14, lineHeight: 16 }}>✓</Micro> : null}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <StatusPill status={status} size="sm" />
            {tag ? <Micro muted>{tag}</Micro> : null}
            {slaLabel ? <Mono color={theme.colors.risk} style={{ fontSize: 12 }}>{slaLabel}</Mono> : null}
          </View>
          <BodyStrong>{title}</BodyStrong>
          {detail ? <Small muted>{detail}</Small> : null}
        </View>
      </View>

      {evidence.length > 0 ? (
        <EvidenceCard claim={title} status={status} evidence={evidence} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        <Button title={chips.approve} variant="accent" size="md" disabled={pending} loading={pending} onPress={() => onChip('approve')} />
        <Button title={chips.hold} variant="danger" size="md" disabled={pending} onPress={() => onChip('hold')} />
        <Button title={chips.assign} variant="secondary" size="md" disabled={pending} onPress={() => onChip('assign')} />
      </View>
    </View>
  )
}
