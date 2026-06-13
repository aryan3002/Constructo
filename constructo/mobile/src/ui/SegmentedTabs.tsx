/**
 * SegmentedTabs — an even-width pill tab bar (from prototype `SubTabs`).
 *
 * Active tab: filled with ink (neev) / accent (daylight) bg + contrasting text.
 * Idle tabs: transparent bg + hairline border + muted text.
 *
 * Each tab flex: 1 so all tabs share equal width in the container.
 * ≥36px height; ≥48px minimum tap height.
 */
import { Pressable, View, type ViewStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Small } from './Typography'

export interface TabItem {
  key: string
  label: string
}

export interface SegmentedTabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  style?: ViewStyle
}

export function SegmentedTabs({ tabs, active, onChange, style }: SegmentedTabsProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const neev = theme.name === 'neev'

  // Active fill: ink on neev (survives direct sun), accent on daylight.
  const activeBg = neev ? c.text : c.accent
  const activeFg = neev ? c.paper : c.onAccent // ON_INK on neev, onAccent on daylight

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
        },
        style,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => ({
              flex: 1,
              height: 36,
              minHeight: TAP,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radii.pill,
              backgroundColor: isActive ? activeBg : 'transparent',
              borderWidth: 1,
              borderColor: isActive ? 'transparent' : c.line,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Small
              color={isActive ? activeFg : c.textMute}
              style={{ fontWeight: '600' }}
            >
              {tab.label}
            </Small>
          </Pressable>
        )
      })}
    </View>
  )
}
