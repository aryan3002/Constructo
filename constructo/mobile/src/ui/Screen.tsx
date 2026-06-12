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
import { FLOATING_NAV_CLEARANCE } from './FloatingTabBar'

export function Screen({
  children,
  scroll = true,
  padded = true,
  floatingNav = false,
  style,
}: {
  children: ReactNode
  scroll?: boolean
  padded?: boolean
  /**
   * Reserve bottom room for the homeowner floating bar + Ask pill. The four tab
   * screens pad themselves, but the off-tab routes (settings/members/
   * notifications/welcome/household) render inside the same Tabs navigator — the
   * bar + pill float over them too — so they opt in here to scroll fully clear
   * (handoff §2.6). Off by default so contractor (Neev) screens are
   * unaffected.
   */
  floatingNav?: boolean
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
  const bottomPad = insets.bottom + (floatingNav ? FLOATING_NAV_CLEARANCE : SPACE.xl)

  if (!scroll) {
    return (
      <View style={[base, { paddingTop: insets.top }, pad, style]}>{children}</View>
    )
  }
  return (
    <ScrollView
      style={base}
      contentContainerStyle={[
        { paddingTop: insets.top + SPACE.md, paddingBottom: bottomPad },
        pad,
        style,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}
