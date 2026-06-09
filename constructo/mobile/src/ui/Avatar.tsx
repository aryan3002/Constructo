/**
 * Avatar — a calm, warm "person pebble": a soft sage chip showing the name's
 * first letter (letters only, incl. Devanagari — a phone/number falls back to a
 * gentle user glyph). Decorative by default (the surrounding row carries the
 * accessible label). Used by Members and any people-list.
 */
import { View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP } from '../theme/tokens'
import { BodyStrong } from './Typography'

export interface AvatarProps {
  /** Display name — its first letter (if a letter) becomes the initial. */
  name?: string | null
  /** Pebble diameter (default 48 — the ≥48px row leading slot). */
  size?: number
  style?: ViewStyle
}

export function Avatar({ name, size = 48, style }: AvatarProps) {
  const { theme } = useTheme()
  const initial = name?.trim()?.[0]?.toUpperCase()
  const showInitial = Boolean(initial && /\p{L}/u.test(initial))
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.radii.pill,
          backgroundColor: AP.chip,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {showInitial ? (
        <BodyStrong color={AP.onChip}>{initial}</BodyStrong>
      ) : (
        <Feather name="user" size={Math.round(size * 0.42)} color={AP.onChip} />
      )}
    </View>
  )
}
