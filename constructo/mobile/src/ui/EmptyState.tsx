/**
 * EmptyState — the calm close of a Neev list: "all clear" (nothing needs you),
 * "offline" (keep working, it'll sync), or a plain empty register. A status-tinted
 * badge + a short title + body, optional action. Offline NEVER reads as an error
 * or a blocking wall — work continues, sync follows.
 *
 * Title renders in Mukta (not the Latin-only display face) so a Hindi screen sets
 * it beautifully too. Labels are props (English defaults) — one language per screen.
 */
import { Text, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { FACES } from '../theme/fonts'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Small } from './Typography'

export type EmptyVariant = 'clear' | 'offline' | 'empty'

const GLYPH: Record<EmptyVariant, React.ComponentProps<typeof Feather>['name']> = {
  clear: 'check',
  offline: 'wifi-off',
  empty: 'inbox',
}

/** hex → rgba tint. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export interface EmptyStateProps {
  variant?: EmptyVariant
  title?: string
  body?: string
  /** Override the badge icon. */
  icon?: React.ComponentProps<typeof Feather>['name']
  /** Optional action node (e.g. a <Button/>). */
  action?: React.ReactNode
  style?: ViewStyle
}

export function EmptyState({ variant = 'empty', title, body, icon, action, style }: EmptyStateProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const badgeColor = variant === 'clear' ? c.ok : variant === 'offline' ? c.info : c.textMute
  const badgeBg =
    variant === 'empty' ? c.paper : tint(badgeColor, 0.13)

  return (
    <View style={[{ alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xxl, paddingHorizontal: SPACE.xl }, style]}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: badgeBg,
        }}
      >
        <Feather name={icon ?? GLYPH[variant]} size={30} color={badgeColor} />
      </View>
      {title ? (
        <Text
          style={{
            fontFamily: FACES[theme.name].bodyStrong,
            fontSize: 20,
            lineHeight: 26,
            letterSpacing: -0.2,
            color: c.text,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      ) : null}
      {body ? (
        <Small muted style={{ textAlign: 'center', maxWidth: 300 }}>
          {body}
        </Small>
      ) : null}
      {action ? <View style={{ marginTop: SPACE.xs }}>{action}</View> : null}
    </View>
  )
}
