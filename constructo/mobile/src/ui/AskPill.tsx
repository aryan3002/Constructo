/**
 * AskPill — the persistent floating "Ask" pill (handoff §2.2). Opens the
 * grounded assistant. Sits *above* the floating tab bar, right-aligned, with a
 * Calm-Pine fill, white text + a Feather sparkle (`zap`) glyph. ≥48px tall,
 * soft warm shadow, subtle scale-down on press (Pressable `pressed` state, so
 * it respects Reduce Motion by being instant — §3.6).
 *
 * It positions itself absolutely just above the bar; the parent stacks it over
 * the tab content. Routes to the root `/ask` screen (the grounded assistant).
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE } from '../theme/tokens'
import { BodyStrong } from './Typography'

export interface AskPillProps {
  /** Localized short label ("Ask" / "पूछें"). */
  label: string
  /** Where to route. Defaults to the grounded assistant at `/ask`. */
  href?: string
}

export function AskPill({ label, href = '/ask' }: AskPillProps) {
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Above the bar: bar bottom (insets.bottom + 12) + bar height (64) + ~12 gap.
  const bottom = insets.bottom + 12 + 64 + 12

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          router.push(href)
        }}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: theme.colors.accent,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            opacity: pressed ? 0.95 : 1,
          },
        ]}
      >
        <Feather name="zap" size={18} color={theme.colors.onAccent} />
        <BodyStrong color={theme.colors.onAccent}>{label}</BodyStrong>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: SPACE.lg,
    alignItems: 'flex-end',
  },
  pill: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: 9999,
    // soft warm shadow (§3.5 floating)
    shadowColor: '#3c321e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
})
