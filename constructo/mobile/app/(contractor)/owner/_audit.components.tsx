/**
 * Shared building blocks for the owner Site-Audit + Survey screens (Calm Cockpit).
 * Kept local to the owner group; reuses the daylight tokens + src/ui kit.
 */
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../../src/theme/tokens'
import { H2, Mono, ProgressRing, Small } from '../../../src/ui'

/** Quality score → status tone (higher is better). */
export function scoreStatus(score: number | null | undefined): Status {
  if (score == null) return 'quiet'
  if (score >= 85) return 'ok'
  if (score >= 70) return 'warn'
  return 'risk'
}

/** Risk score → status tone (LOWER is better — it's a risk, not a quality). */
export function riskStatus(score: number | null | undefined): Status {
  if (score == null) return 'quiet'
  if (score < 40) return 'ok'
  if (score < 70) return 'warn'
  return 'risk'
}

const STATUS_COLOR = (s: Status, theme: ReturnType<typeof useTheme>['theme']): string => {
  switch (s) {
    case 'ok':
      return theme.colors.ok
    case 'warn':
      return theme.colors.warn
    case 'risk':
      return theme.colors.risk
    default:
      return theme.colors.quiet
  }
}

/** A circular score dial (0–100) with a tone color + caption underneath. */
export function ScoreDial({
  value,
  size = 64,
  tone = 'ok',
  label,
}: {
  value: number | null
  size?: number
  tone?: Status
  label?: string
}) {
  const { theme } = useTheme()
  const color = STATUS_COLOR(tone, theme)
  return (
    <ProgressRing
      progress={value == null ? 0 : value / 100}
      size={size}
      stroke={size >= 72 ? 7 : 6}
      color={color}
      trackColor={AP.ringTrack}
    >
      <View style={{ alignItems: 'center' }}>
        <Mono style={{ fontSize: size >= 72 ? 22 : 17, color }}>{value == null ? '—' : value}</Mono>
        {label ? <Small muted style={{ fontSize: 10, marginTop: -2 }}>{label}</Small> : null}
      </View>
    </ProgressRing>
  )
}

/** A back-chevron sub-header used by pushed owner detail screens. */
export function SubHeader({
  title,
  sub,
  onBack,
  right,
}: {
  title: string
  sub?: string
  onBack?: () => void
  right?: ReactNode
}) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingBottom: SPACE.md,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={10}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.colors.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <H2 numberOfLines={1}>{title}</H2>
        {sub ? <Small muted numberOfLines={1}>{sub}</Small> : null}
      </View>
      {right}
    </View>
  )
}

/** Severity → tone + glyph + label, for finding pills. */
export const SEVERITY_META: Record<
  string,
  { status: Status; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  critical: { status: 'risk', icon: 'warning', label: 'Critical' },
  major: { status: 'warn', icon: 'flash', label: 'Major' },
  minor: { status: 'info', icon: 'information-circle', label: 'Minor' },
}

/** Item status (ok/obs/fail) → tone + glyph, for section checklist rows. */
export const ITEM_META: Record<
  string,
  { status: Status; icon: keyof typeof Ionicons.glyphMap }
> = {
  ok: { status: 'ok', icon: 'checkmark-circle' },
  obs: { status: 'warn', icon: 'alert-circle' },
  fail: { status: 'risk', icon: 'close-circle' },
}
