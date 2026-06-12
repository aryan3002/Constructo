/**
 * SubHeader — the sticky back-navigation header for pushed screens.
 *
 * Layout (prototype `SubHeader`):
 *   [back chevron ≥48px] [title + optional subtitle flex:1] [optional right]
 *
 * Rendered at zIndex 10 with a bottom hairline and a soft sand-200 bg.
 * The back chevron uses Feather `chevron-left` and fires `onBack`.
 *
 * Differences from the prototype (CSS) → RN adaptation:
 *   - No CSS backdrop-filter — native uses a solid semi-opaque bg token instead.
 *   - The container is a plain View; scroll-driven blur is opt-in at the screen level.
 */
import { Pressable, View, type ViewStyle } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Body, Small } from './Typography'

export interface SubHeaderProps {
  title: string
  subtitle?: string
  onBack: () => void
  /** Optional trailing slot (e.g. an action button or icon). */
  right?: React.ReactNode
  style?: ViewStyle
}

export function SubHeader({ title, subtitle, onBack, right, style }: SubHeaderProps) {
  const { theme } = useTheme()
  const c = theme.colors

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm + 2, // 10px
          backgroundColor: c.bg,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
          zIndex: 10,
        },
        style,
      ]}
    >
      {/* Back chevron — ≥48px tap target */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => ({
          width: TAP,
          height: TAP,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radii.chip,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Feather name="chevron-left" size={22} color={c.text} />
      </Pressable>

      {/* Title block */}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Body
          numberOfLines={1}
          style={{ fontWeight: '600' }}
        >
          {title}
        </Body>
        {subtitle ? (
          <Small muted numberOfLines={1}>
            {subtitle}
          </Small>
        ) : null}
      </View>

      {/* Optional right slot */}
      {right ? (
        <View style={{ flexShrink: 0 }}>{right}</View>
      ) : null}
    </View>
  )
}
