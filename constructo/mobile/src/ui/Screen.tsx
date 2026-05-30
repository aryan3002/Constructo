/**
 * Screen — a themed, safe-area-aware page scaffold. Fills with the theme canvas
 * and (by default) scrolls with comfortable padding. The optional sticky
 * {@link SyncStatus} can be rendered above content by screens that need it.
 */
import type { ReactNode } from 'react'
import { ScrollView, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode
  scroll?: boolean
  padded?: boolean
  style?: ViewStyle
}) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const pad: ViewStyle = padded
    ? { padding: SPACE.lg, gap: SPACE.md }
    : {}
  const base: ViewStyle = {
    backgroundColor: theme.colors.bg,
    flex: 1,
  }

  if (!scroll) {
    return (
      <View style={[base, { paddingTop: insets.top }, pad, style]}>{children}</View>
    )
  }
  return (
    <ScrollView
      style={base}
      contentContainerStyle={[
        { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.xl },
        pad,
        style,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}
