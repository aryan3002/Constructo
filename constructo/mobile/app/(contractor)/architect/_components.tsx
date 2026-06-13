/**
 * Designer (Anamika) daylight building blocks — "Calm Cockpit" on the architect
 * subtree. Self-contained (the group doesn't couple to owner/supervisor
 * internals); built on the shared src/ui kit + daylight tokens.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP, type Status } from '../../../src/theme/tokens'
import type { RoutingStatus } from '../../../src/api/specs'
import type { SiteChangeStatus } from '../../../src/api/siteChanges'
import { Body, Button, Card, H2, Micro, Mono, Small } from '../../../src/ui'

// ---------------------------------------------------------------------------
// Routing + change metadata (tone + label), shared across the designer screens.
// ---------------------------------------------------------------------------

/** A selection's derived routing state → tone + label + approval-route step. */
export const ROUTING_META: Record<RoutingStatus, { status: Status; label: string; step: number }> = {
  draft: { status: 'quiet', label: 'Draft', step: 0 },
  out_for_approval: { status: 'warn', label: 'Out for approval', step: 1 },
  approved: { status: 'ok', label: 'Approved · ready to release', step: 3 },
  returned: { status: 'risk', label: 'Returned — revise', step: 0 },
  released: { status: 'ok', label: 'Released to site', step: 4 },
}

/** The approval-route stepper labels (You → Owner → Client → Released). */
export const ROUTE_STEPS = ['You', 'Owner', 'Client', 'Released'] as const

/** A site change's status → tone + label. */
export const CHANGE_META: Record<SiteChangeStatus, { status: Status; label: string }> = {
  new: { status: 'warn', label: 'Review' },
  linked: { status: 'info', label: 'Linked to revision' },
  resolved: { status: 'ok', label: 'Resolved' },
}

/** ISO datetime → "5h ago" / "Yesterday" / "12 Jun" (compact relative). */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  if (hrs < 48) return 'Yesterday'
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

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
    <Card flag="risk" style={{ gap: SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Ionicons name="alert-circle" size={20} color={theme.colors.risk} />
        <Body style={{ flex: 1 }}>{message}</Body>
      </View>
      <Button title={retryLabel} variant="secondary" size="md" onPress={onRetry} />
    </Card>
  )
}

export function SectionLabel({ children, trailing }: { children: string; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.sm }}>
      <Small muted style={{ letterSpacing: 1 }}>
        {children.toUpperCase()}
      </Small>
      {trailing}
    </View>
  )
}

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
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.paper, alignItems: 'center', justifyContent: 'center' }}
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

/** A small headline-number tile (Needs you / Out for approval / Released). */
export function StatTile({ value, label, tone = 'quiet' }: { value: number | string; label: string; tone?: Status }) {
  const { theme } = useTheme()
  const color = tone === 'quiet' ? theme.colors.text : theme.colors[tone]
  return (
    <Card style={{ flex: 1, alignItems: 'flex-start', gap: 2, paddingVertical: SPACE.md }}>
      <Mono style={{ fontSize: 26, color }}>{value}</Mono>
      <Micro muted style={{ letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Micro>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ApprovalRoute — the You → Owner → Client → Released stepper for a selection.
// ---------------------------------------------------------------------------

export function ApprovalRoute({ step }: { step: number }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {ROUTE_STEPS.map((label, i) => {
        const done = i < step
        const current = i === step
        const color = done ? c.ok : current ? c.warn : c.quiet
        return (
          <View key={label} style={{ flex: i < ROUTE_STEPS.length - 1 ? 1 : 0, alignItems: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: color,
                  backgroundColor: done || current ? color : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? <Ionicons name="checkmark" size={12} color={c.onAccent} /> : null}
              </View>
              {i < ROUTE_STEPS.length - 1 ? (
                <View style={{ flex: 1, height: 2, backgroundColor: i < step ? c.ok : c.line }} />
              ) : null}
            </View>
            <Micro style={{ color, marginTop: 4 }}>{label}</Micro>
          </View>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// DesTabBar — the designer field nav: Home · Brief · Selections (center FAB) ·
// Chat · More. A custom <Tabs tabBar={…}> with the clay Selections spark.
// ---------------------------------------------------------------------------

interface TabDef {
  name: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  center?: boolean
}
const TABS: TabDef[] = [
  { name: 'home', label: 'Home', icon: 'home-outline' },
  { name: 'brief', label: 'Brief', icon: 'sparkles-outline' },
  { name: 'selections', label: 'Selections', icon: 'color-palette', center: true },
  { name: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline' },
  { name: 'more', label: 'More', icon: 'grid-outline' },
]

export function DesTabBar({ state, navigation }: BottomTabBarProps) {
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
                  backgroundColor: c.secondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: c.bg,
                  ...theme.shadowCard,
                }}
              >
                <Ionicons name="color-palette" size={24} color={c.onAccent} />
              </View>
              <Micro style={{ color: c.secondary, fontSize: 10.5, fontWeight: '700' }}>{t.label}</Micro>
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
