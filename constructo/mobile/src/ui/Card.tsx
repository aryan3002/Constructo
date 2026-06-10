/**
 * Card — the base warm surface. Direction C: a warm card bg, a single hairline
 * border, theme radius, and a soft "lifted paper" lift (never a hard drop).
 *
 *   variant="plain"  → standard content card (default)
 *   variant="letter" → warm sand "letter" panel (weekly-summary feel)
 *   variant="quiet"  → low-emphasis empty/quiet state (transparent + dashed, flat)
 */
import { View, type ViewProps, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE, type Status } from '../theme/tokens'
import { StatusFlag } from './StatusFlag'

export type CardVariant = 'plain' | 'letter' | 'quiet'

export interface CardProps extends ViewProps {
  variant?: CardVariant
  /** Apply default inner padding (16). */
  padded?: boolean
  /**
   * Neev "Site Register" signature: a folded-corner status flag in the top-right
   * (pairs with a StatusPill, never colour-alone). Opt-in — homeowner cards omit
   * it. `size` follows field vs desk density at the call site.
   */
  flag?: Status
  flagSize?: number
  style?: ViewStyle | ViewStyle[]
}

export function Card({
  variant = 'plain',
  padded = true,
  flag,
  flagSize,
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme()
  const quiet = variant === 'quiet'
  const bg =
    variant === 'letter'
      ? theme.name === 'daylight'
        ? AP.letter
        : theme.colors.paper
      : quiet
        ? 'transparent'
        : theme.colors.card
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: bg,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: quiet ? AP.borderStrong : theme.colors.line,
          borderStyle: quiet ? 'dashed' : 'solid',
          padding: padded ? SPACE.lg : 0,
        },
        quiet ? null : theme.shadowCard,
        style as ViewStyle,
      ]}
    >
      {children}
      {flag ? <StatusFlag status={flag} size={flagSize} /> : null}
    </View>
  )
}
