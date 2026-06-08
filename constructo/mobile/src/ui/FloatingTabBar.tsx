/**
 * FloatingTabBar — the homeowner "Calm Cockpit" bottom navigation (handoff
 * §2.1). A custom Expo-Router `tabBar`: **floating** (detached from the screen
 * edges, ~16px horizontal margin, ~12px above the bottom safe-area inset,
 * 28px radius, soft warm shadow) and **translucent** (an `expo-blur` frosted
 * pane + a warm-paper fill over it, like WhatsApp). Content scrolls *behind*
 * it. Never an opaque edge-to-edge bar (§8).
 *
 * Renders only the 5 top-level destinations
 * (Home · Photos · Updates · Messages · Design) as icon + label — active tinted
 * Calm Pine, inactive textMuted. Sub-routes
 * (`href: null`) are filtered out so pushed screens cover the bar full-screen.
 *
 * Press feedback uses Pressable's `pressed` state (instant scale 0.98) rather
 * than a timed animation, so it inherently respects Reduce Motion (§3.6).
 */
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Feather } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { Micro } from './Typography'

/** Premium Feather glyph per destination (§8: icons, never emoji). */
const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  home: 'home',
  photos: 'image',
  updates: 'file-text',
  messages: 'message-circle',
  design: 'layout',
}

/** Warm-sand surface fill over the blur (Direction C: surface #FCFAF3, like the
 *  skill's color-mix(surface-card 88%, transparent)). Higher opacity on Android
 *  where the blur is weaker. */
const FILL = Platform.OS === 'android' ? 'rgba(252,250,243,0.94)' : 'rgba(252,250,243,0.80)'

/**
 * Vertical space a scrolling tab screen must reserve at its bottom so content
 * clears BOTH the floating bar and the Ask pill that floats above it. Excludes
 * the safe-area inset — add `insets.bottom`. = bar-gap 12 + bar 64 + gap 12 +
 * pill 48 + 16 breathing. Consumed by the homeowner layout's `sceneStyle`.
 */
export const FLOATING_NAV_CLEARANCE = 12 + 64 + 12 + 48 + 16

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  // Only the 5 top-level destinations. A custom tabBar receives *every* route
  // in `state.routes`; Expo Router consumes `href: null` and does NOT surface it
  // on `descriptors[...].options`, so filtering by `href` is unreliable and lets
  // pushed routes (settings, members, onboarding…) leak in as extra tabs. Filter
  // by the explicit allowlist of the four tab routes (the `TAB_ICONS` keys).
  const routes = state.routes.filter((r) => r.name in TAB_ICONS)

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 12 }]}
    >
      <View style={[styles.bar, theme.shadowCard, { shadowOpacity: 0.12 }]}>
        <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.fill]} />
        <View style={styles.hairline} pointerEvents="none" />
        <View style={styles.row}>
          {routes.map((route) => {
            const { options } = descriptors[route.key]
            // `state.index` points into the full route list, so compare by key.
            const focused = state.routes[state.index].key === route.key
            const label =
              typeof options.title === 'string' ? options.title : route.name
            const color = focused ? theme.colors.accent : theme.colors.textMute
            const iconName = TAB_ICONS[route.name] ?? 'circle'

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.item,
                  { transform: [{ scale: pressed ? 0.96 : 1 }] },
                ]}
              >
                <Feather name={iconName} size={22} color={color} />
                <Micro color={color} style={styles.label} numberOfLines={1}>
                  {label}
                </Micro>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
  },
  bar: {
    height: 64,
    borderRadius: 28,
    overflow: 'hidden',
    // soft warm shadow `0 6px 20px rgba(60,50,30,0.12)` (§2.1)
    shadowColor: '#3c321e',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    elevation: 8,
  },
  fill: {
    backgroundColor: FILL,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    textAlign: 'center',
  },
})
