/**
 * TimelineItem — one event in a site/updates timeline: a type badge, a
 * plain-language summary, when it occurred, and an optional rail connector.
 */
import { View, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Body, Micro, Mono } from './Typography'

export interface TimelineItemProps {
  typeLabel: string
  summary: string
  occurredOn: string
  /** Optional tint for the badge (defaults to the accent). */
  tint?: string
  isLast?: boolean
  style?: ViewStyle
}

export function TimelineItem({
  typeLabel,
  summary,
  occurredOn,
  tint,
  isLast = false,
  style,
}: TimelineItemProps) {
  const { theme } = useTheme()
  const dot = tint ?? theme.colors.accent
  return (
    <View style={[{ flexDirection: 'row', gap: SPACE.md }, style]}>
      <View style={{ alignItems: 'center', width: 12 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: dot,
            marginTop: 6,
          }}
        />
        {!isLast ? (
          <View style={{ flex: 1, width: 1, backgroundColor: theme.colors.line, marginTop: 4 }} />
        ) : null}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : SPACE.lg }}>
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.paper,
            paddingVertical: 2,
            paddingHorizontal: 8,
          }}
        >
          <Micro muted>{typeLabel}</Micro>
        </View>
        <Body style={{ marginTop: SPACE.xs }}>{summary}</Body>
        <Mono muted style={{ marginTop: SPACE.xs, fontSize: 12 }}>
          {occurredOn}
        </Mono>
      </View>
    </View>
  )
}
