/**
 * Designer (Anamika) daylight building blocks — "Calm Cockpit" on the architect
 * subtree. Self-contained (the group doesn't couple to owner/supervisor
 * internals); built on the shared src/ui kit + daylight tokens.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { Body, Button, Card, H2, Micro, Mono, Small } from '../../../src/ui'

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
