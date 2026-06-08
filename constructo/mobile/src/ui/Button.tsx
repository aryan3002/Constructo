/**
 * Button — the one decisive action per screen. Always ≥48px tall with a pressed
 * state. `primary` is the theme accent (amber on Blueprint, green on Daylight).
 */
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { BodyStrong } from './Typography'

export type ButtonVariant = 'primary' | 'celebrate' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps {
  title: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  disabled?: boolean
  loading?: boolean
  /** Optional leading element (e.g. an icon glyph). */
  leading?: React.ReactNode
  style?: ViewStyle
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  block,
  disabled,
  loading,
  leading,
  style,
}: ButtonProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const bg: Record<ButtonVariant, string> = {
    primary: c.accent, // sage green — the primary role
    celebrate: c.secondary, // warm clay — milestone / celebration ONLY
    secondary: c.card,
    ghost: 'transparent',
    danger: c.risk,
  }
  const fg: Record<ButtonVariant, string> = {
    primary: c.onAccent,
    celebrate: '#ffffff',
    secondary: c.text,
    ghost: c.accentDeep,
    danger: '#ffffff',
  }
  const isDisabled = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 56 : TAP,
          paddingHorizontal: size === 'lg' ? SPACE.xl : SPACE.lg,
          borderRadius: theme.radii.control,
          backgroundColor: bg[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: c.line,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          opacity: isDisabled ? 0.5 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        variant === 'primary' || variant === 'celebrate' ? theme.shadowCard : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {leading ? <View>{leading}</View> : null}
          <BodyStrong color={fg[variant]}>{title}</BodyStrong>
        </>
      )}
    </Pressable>
  )
}
