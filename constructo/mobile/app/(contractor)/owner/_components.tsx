/**
 * Owner-local composite components + helpers (NOT in src/ui — these are
 * Owner-branch specific). Built on the shared kit + Neev theme:
 *
 *   - formatDate / formatWhen                     — time formatting
 *   - idsToEvidence                               — Risk event ids → EvidenceChip items
 *   - SiteSwitcher      (sticky header pill)      — All sites / per-site scope
 *   - PulseCard         (2×2 pulse tile)          — calm, hide-empty
 *   - SiteRollupRow     (sites list row)          — status + counts
 *   - ApprovalRow       (decisions inbox row)     — claim + decision chips
 *   - SectionLabel / StateBlock                   — small shared bits
 */
import React from 'react'
import type { ReactNode } from 'react'
import { ActivityIndicator, Modal, Pressable, View } from 'react-native'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP, type Status } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  EmptyState,
  Micro,
  NeedsYouCard,
  Small,
  StatusDot,
  StatusPill,
  type EvidenceChipProps,
  type EvidenceItem,
} from '../../../src/ui'

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
// SiteSwitcher — sticky header pill: "All sites (N) ▾" + per-site selector.
// Opens a lightweight modal listing All + each site with a worst-status dot.
// No new backend calls — the screen passes sites it already has.
// ---------------------------------------------------------------------------
export interface SiteSwitcherItem {
  id: string
  name: string
  status: Status
}

export function SiteSwitcher({
  sites,
  selectedId,
  onSelect,
  allLabel,
  totalCount,
}: {
  sites: SiteSwitcherItem[]
  /** null = All sites */
  selectedId: string | null
  onSelect: (id: string | null) => void
  allLabel: string
  totalCount: number
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const [open, setOpen] = React.useState(false)

  const pillLabel =
    selectedId == null
      ? `${allLabel} (${totalCount}) ▾`
      : `${sites.find((s) => s.id === selectedId)?.name ?? allLabel} ▾`

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pillLabel}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs,
          paddingVertical: SPACE.xs + 2,
          paddingHorizontal: SPACE.md,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Small style={{ fontWeight: '600' }}>{pillLabel}</Small>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(27,25,22,0.45)', justifyContent: 'flex-start', paddingTop: 96 }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              marginHorizontal: SPACE.lg,
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              overflow: 'hidden',
            }}
          >
            {/* All sites row */}
            <Pressable
              accessibilityRole="button"
              onPress={() => { onSelect(null); setOpen(false) }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                padding: SPACE.lg,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
                backgroundColor: selectedId === null ? c.accentWarm : pressed ? c.paper : c.card,
              })}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.textMute }} />
              <Body style={{ flex: 1 }}>{allLabel} ({totalCount})</Body>
              {selectedId === null ? <Micro color={c.accent}>✓</Micro> : null}
            </Pressable>

            {/* Per-site rows */}
            {sites.map((site, idx) => (
              <Pressable
                key={site.id}
                accessibilityRole="button"
                onPress={() => { onSelect(site.id); setOpen(false) }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.md,
                  padding: SPACE.lg,
                  borderBottomWidth: idx < sites.length - 1 ? 1 : 0,
                  borderBottomColor: c.line,
                  backgroundColor:
                    selectedId === site.id ? c.accentWarm : pressed ? c.paper : c.card,
                })}
              >
                <StatusDot status={site.status} size={10} />
                <Body style={{ flex: 1 }}>{site.name}</Body>
                {selectedId === site.id ? <Micro color={c.accent}>✓</Micro> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
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
          hideFlag
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
