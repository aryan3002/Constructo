/**
 * CalmCard — the homeowner-flavoured primitive: a calm card with a colored LEFT
 * status border (the "am I okay?" cue). Title + optional body + optional
 * trailing slot. Used across the Daylight home/updates screens.
 */
import { View, type ViewStyle } from 'react-native'

import { STATUS, type Status } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Body, H2, Small } from './Typography'

export interface CalmCardProps {
  title: string
  body?: string
  /** Left border + accent. Defaults to a calm "ok". */
  status?: Status
  /** Optional eyebrow above the title (e.g. "TODAY"). */
  eyebrow?: string
  trailing?: React.ReactNode
  children?: React.ReactNode
  style?: ViewStyle
}

export function CalmCard({
  title,
  body,
  status = 'ok',
  eyebrow,
  trailing,
  children,
  style,
}: CalmCardProps) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderLeftWidth: 4,
          borderLeftColor: STATUS[status],
          padding: SPACE.lg,
        },
        theme.shadowCard,
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Small muted style={{ letterSpacing: 1, marginBottom: 2 }}>
              {eyebrow.toUpperCase()}
            </Small>
          ) : null}
          <H2>{title}</H2>
          {body ? (
            <Body muted style={{ marginTop: SPACE.xs }}>
              {body}
            </Body>
          ) : null}
        </View>
        {trailing ? <View>{trailing}</View> : null}
      </View>
      {children ? <View style={{ marginTop: SPACE.md }}>{children}</View> : null}
    </View>
  )
}
