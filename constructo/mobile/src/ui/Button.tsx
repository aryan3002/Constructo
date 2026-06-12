/**
 * Button — the one decisive action per screen. Always ≥48px tall with a pressed
 * state.
 *
 *   Daylight (homeowner) → `primary` is the sage accent; `danger` is red.
 *   Neev (contractor)    → `primary` is INK (it survives direct sun); the single
 *     affirmative "yes" (Approve / Order / Send) is `accent` = the marigold spark
 *     — never two marigold fills competing; the cautionary Hold/stop is `danger`
 *     rendered as an INK-OUTLINE (per the locked Neev rule), not a red fill.
 */
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { BodyStrong } from './Typography'

/** on-ink (paper-50) — text/glyph colour on a Neev ink surface. */
const ON_INK = '#f4f0e7'

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'celebrate'
  | 'secondary'
  | 'ghost'
  | 'danger'
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
  const neev = theme.name === 'neev'

  const bg: Record<ButtonVariant, string> = {
    primary: neev ? c.text : c.accent, // Neev: ink (sun-proof) · Daylight: sage
    accent: c.accent, // the single affirmative "yes" — marigold on Neev
    celebrate: c.secondary, // warm clay — milestone / celebration ONLY
    secondary: c.card,
    ghost: 'transparent',
    danger: neev ? 'transparent' : c.risk, // Neev: cautionary ink-OUTLINE, not red
  }
  const fg: Record<ButtonVariant, string> = {
    primary: neev ? ON_INK : c.onAccent,
    accent: c.onAccent, // Neev: ink on marigold · Daylight: white on sage
    celebrate: '#ffffff',
    secondary: c.text,
    ghost: neev ? c.text : c.accentDeep,
    danger: neev ? c.text : '#ffffff',
  }
  // Border: bordered secondary on both surfaces; Neev's danger is an ink outline.
  const bordered = variant === 'secondary' || (neev && variant === 'danger')
  const borderColor = neev && variant === 'danger' ? c.text : c.line
  const lifts = variant === 'primary' || variant === 'accent' || variant === 'celebrate'
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
          borderWidth: bordered ? (neev && variant === 'danger' ? 1.5 : 1) : 0,
          borderColor,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          opacity: isDisabled ? 0.5 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        lifts ? theme.shadowCard : null,
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
