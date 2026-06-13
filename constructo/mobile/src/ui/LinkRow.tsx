/**
 * LinkRow — a text link with a trailing chevron/arrow (prototype `LinkRow`).
 *
 * Renders as an inline pressable row: label text in the accent deep color
 * (actionable green on daylight, marigold deep on neev) + a trailing Feather
 * `arrow-right` icon. ≥48px touch height.
 *
 * Use inside a Card or list to provide a "see all / view more" link.
 */
import { Pressable, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Small } from './Typography'

export interface LinkRowProps {
  label: string
  onPress: () => void
  /** Override the trailing icon (default: `arrow-right`). */
  icon?: React.ComponentProps<typeof Feather>['name']
  style?: ViewStyle
}

export function LinkRow({ label, onPress, icon = 'arrow-right', style }: LinkRowProps) {
  const { theme } = useTheme()
  const color = theme.colors.accentDeep

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.xs + 2, // 6px
          minHeight: TAP,
          paddingVertical: SPACE.xs,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Small color={color} style={{ fontWeight: '600' }}>
        {label}
      </Small>
      <Feather name={icon} size={15} color={color} />
    </Pressable>
  )
}
