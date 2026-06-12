/**
 * Chip — a filter / segment pill.
 *
 *   active  → filled accent bg + onAccent text (ink-filled on neev, sage on daylight)
 *   idle    → paper bg + hairline border + body text
 *
 * ≥36px height, pill radius, optional leading Feather icon.
 * Tap target: padded to ≥48px height via minHeight so the icon is at 36 visually
 * but the pressable region is always ≥48px (§accessibility).
 */
import { Pressable, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Small } from './Typography'

export interface ChipProps {
  label: string
  active: boolean
  onPress: () => void
  /** Optional leading Feather icon name. */
  icon?: React.ComponentProps<typeof Feather>['name']
  style?: ViewStyle
}

export function Chip({ label, active, onPress, icon, style }: ChipProps) {
  const { theme } = useTheme()
  const c = theme.colors

  // Active: filled with accent bg. Idle: paper bg + hairline border.
  const bgColor = active ? c.accent : c.paper
  const textColor = active ? c.onAccent : c.text
  const borderColor = active ? 'transparent' : c.line

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs + 2, // 6px
          height: 36,
          minHeight: TAP,
          paddingHorizontal: SPACE.lg - 2, // 14px
          borderRadius: theme.radii.pill,
          backgroundColor: bgColor,
          borderWidth: 1,
          borderColor,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {icon ? (
        <Feather name={icon} size={15} color={textColor} />
      ) : null}
      <Small color={textColor} style={{ fontWeight: '600' }}>
        {label}
      </Small>
    </Pressable>
  )
}
