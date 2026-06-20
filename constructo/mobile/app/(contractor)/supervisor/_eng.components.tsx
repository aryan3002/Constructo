/**
 * Site-Engineer (Lokesh) daylight building blocks — "Calm Cockpit" on the
 * supervisor subtree (wrapped in <ThemeProvider initial="daylight"> by the
 * layout). Built on the shared src/ui kit + daylight tokens; self-contained so
 * the supervisor group doesn't couple to the owner group's internals.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, TAP, type Status } from '../../../src/theme/tokens'
import {
  Body,
  Button,
  Card,
  H2,
  Micro,
  ProgressRing,
  Small,
  StatusPill,
  Title,
} from '../../../src/ui'

// ---------------------------------------------------------------------------
// Formatting + tone helpers
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ISO datetime → "12 Jun, 7:02am" (compact). */
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

/** Quality score → status tone (higher is better). */
export function scoreStatus(score: number | null | undefined): Status {
  if (score == null) return 'quiet'
  if (score >= 85) return 'ok'
  if (score >= 70) return 'warn'
  return 'risk'
}

/** Audit-check mark (ok/obs/fail) → tone + glyph, for the run checklist. */
export const ITEM_META: Record<
  'ok' | 'obs' | 'fail',
  { status: Status; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  ok: { status: 'ok', icon: 'checkmark-circle', label: 'Pass' },
  obs: { status: 'warn', icon: 'alert-circle', label: 'Observe' },
  fail: { status: 'risk', icon: 'close-circle', label: 'Fail' },
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

const STATUS_COLOR = (s: Status, theme: ReturnType<typeof useTheme>['theme']): string => {
  switch (s) {
    case 'ok':
      return theme.colors.ok
    case 'warn':
      return theme.colors.warn
    case 'risk':
      return theme.colors.risk
    case 'info':
      return theme.colors.info
    default:
      return theme.colors.quiet
  }
}

// ---------------------------------------------------------------------------
// State blocks
// ---------------------------------------------------------------------------

export function LoadingBlock() {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  )
}

export function ErrorBlock({
  message,
  onRetry,
  retryLabel,
}: {
  message: string
  onRetry: () => void
  retryLabel: string
}) {
  const { theme } = useTheme()
  return (
    <Card flag="risk" style={{ gap: SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Ionicons name="alert-circle" size={20} color={theme.colors.risk} />
        <Body style={{ flex: 1 }}>{message}</Body>
      </View>
      <Button title={retryLabel} variant="secondary" size="md" onPress={onRetry} />
    </Card>
  )
}

/** Uppercase eyebrow above a list section, with an optional trailing slot. */
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
// SubHeader — back-chevron header for pushed detail screens.
// ---------------------------------------------------------------------------

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingBottom: SPACE.md }}>
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

// ---------------------------------------------------------------------------
// ScoreDial — circular 0–100 dial with a tone colour.
// ---------------------------------------------------------------------------

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
        <H2 style={{ fontSize: size >= 72 ? 22 : 17, lineHeight: size >= 72 ? 28 : 22, color }}>{value == null ? '—' : value}</H2>
        {label ? <Small muted style={{ fontSize: 10, marginTop: -2 }}>{label}</Small> : null}
      </View>
    </ProgressRing>
  )
}

// ---------------------------------------------------------------------------
// StatTile — a small headline-number tile (To do / Asks / …).
// ---------------------------------------------------------------------------

export function StatTile({
  value,
  label,
  tone = 'quiet',
}: {
  value: number | string
  label: string
  tone?: Status
}) {
  const { theme } = useTheme()
  const color = tone === 'quiet' ? theme.colors.text : STATUS_COLOR(tone, theme)
  return (
    <Card style={{ flex: 1, alignItems: 'flex-start', gap: 2, paddingVertical: SPACE.md }}>
      <H2 style={{ fontSize: 26, lineHeight: 34, color }}>{value}</H2>
      <Micro muted style={{ letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Micro>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// FeatureCard — the big tappable tile (Audit / Drawings) on the More hub.
// ---------------------------------------------------------------------------

export function FeatureCard({
  icon,
  iconTone,
  title,
  sub,
  pill,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconTone: Status
  title: string
  sub: string
  pill?: { status: Status; label: string }
  onPress: () => void
}) {
  const { theme } = useTheme()
  const color = STATUS_COLOR(iconTone, theme)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1 }}>
      <Card style={{ gap: SPACE.xs, minHeight: 132 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            backgroundColor: theme.colors.accentWarm,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: SPACE.sm,
          }}
        >
          <Ionicons name={icon} size={21} color={color} />
        </View>
        <Title style={{ fontSize: 16 }}>{title}</Title>
        <Small muted>{sub}</Small>
        {pill ? (
          <View style={{ marginTop: SPACE.xs }}>
            <StatusPill status={pill.status} size="sm" label={pill.label} />
          </View>
        ) : null}
      </Card>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// EngTabBar — the field nav: Home · Tasks · Capture (center FAB) · Chat · More.
// A custom <Tabs tabBar={…}>. We render an explicit allowlist so pushed detail
// routes (audit, drawings, …) never sprout a tab.
// ---------------------------------------------------------------------------

interface TabDef {
  name: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  center?: boolean
}
const TABS: TabDef[] = [
  { name: 'home', label: 'Home', icon: 'home-outline' },
  { name: 'tasks', label: 'Tasks', icon: 'list-outline' },
  { name: 'capture', label: 'Capture', icon: 'camera', center: true },
  { name: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline' },
  { name: 'more', label: 'More', icon: 'grid-outline' },
]

export function EngTabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const c = theme.colors
  const activeName = state.routes[state.index]?.name

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (!event.defaultPrevented) navigation.navigate(route.name)
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: SPACE.lg,
        marginBottom: Math.max(insets.bottom, SPACE.md) + SPACE.xs,
        marginTop: SPACE.xs,
        paddingVertical: 7,
        paddingHorizontal: SPACE.xs,
        backgroundColor: c.card,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: c.line,
        ...theme.shadowCard,
      }}
    >
      {TABS.map((t) => {
        const on = activeName === t.name
        if (t.center) {
          return (
            <Pressable
              key={t.name}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              onPress={() => go(t.name)}
              style={{ flex: 1, alignItems: 'center', gap: 3 }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  marginTop: -26,
                  borderRadius: 28,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: c.bg,
                  ...theme.shadowCard,
                }}
              >
                <Ionicons name="camera" size={25} color={c.onAccent} />
              </View>
              <Micro style={{ color: c.accentDeep, fontSize: 10.5, fontWeight: '700' }}>
                {t.label}
              </Micro>
            </Pressable>
          )
        }
        return (
          <Pressable
            key={t.name}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => go(t.name)}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: SPACE.xs, minHeight: TAP }}
          >
            <View
              style={{
                width: 54,
                height: 30,
                borderRadius: 9999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? c.accentWarm : 'transparent',
              }}
            >
              <Ionicons name={t.icon} size={20} color={on ? c.accentDeep : c.textMute} />
            </View>
            <Micro style={{ color: on ? c.accentDeep : c.textMute, fontSize: 10.5 }}>{t.label}</Micro>
          </Pressable>
        )
      })}
    </View>
  )
}
