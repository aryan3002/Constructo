/** Card — the base themed surface: card bg, hairline border, theme radius, soft lift. */
import { View, type ViewProps, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'

export interface CardProps extends ViewProps {
  /** Apply default inner padding (16). */
  padded?: boolean
  style?: ViewStyle | ViewStyle[]
}

export function Card({ padded = true, style, children, ...rest }: CardProps) {
  const { theme } = useTheme()
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: theme.colors.line,
          padding: padded ? SPACE.lg : 0,
        },
        theme.shadowCard,
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  )
}
