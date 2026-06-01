/**
 * HomeWidget — a compact 88pt tappable tile used in the Home dashboard widget
 * row. Four instances form a 2-column grid (Next Up, Photos, Changes, Ask).
 *
 * Design rules:
 *  - No shadow (inset-surface level — AP.surfaceLow vs c.bg).
 *  - When bgImageUri is provided: full-bleed Image + dark scrim; all text white.
 *  - When bgColor is provided (e.g. c.accent for Next Up): solid fill; text AP.onDark.
 *  - Default: AP.surfaceLow background; text from active theme.
 *  - Pressable with 0.7 opacity feedback; naturally 88pt tall (exceeds TAP=48).
 */
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Link } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import type { Href } from 'expo-router'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE } from '../theme/tokens'
import { Micro, Small } from './Typography'

export interface HomeWidgetProps {
  /** SCREAMING-caps eyebrow label (e.g. "NEXT UP", "PHOTOS"). */
  eyebrow: string
  /** Bold primary value — milestone name, photo count, rupee string, CTA label. */
  primary: string
  /** Muted secondary line — date, "this week", count, subtitle. */
  secondary?: string
  /** Optional background image URI (real contractor-published photo thumbnail).
   *  When provided a dark scrim keeps text legible. */
  bgImageUri?: string
  /** Solid background tint. Defaults to AP.surfaceLow.
   *  Use c.accent for the "Next Up" widget. */
  bgColor?: string
  /** expo-router href pushed on tap. */
  href: Href
  /** Accessible label for the whole tile. */
  accessibilityLabel: string
}

const TILE_HEIGHT = 88

export function HomeWidget({
  eyebrow,
  primary,
  secondary,
  bgImageUri,
  bgColor,
  href,
  accessibilityLabel,
}: HomeWidgetProps) {
  const { theme } = useTheme()

  const hasDarkBg = Boolean(bgImageUri) || (bgColor && bgColor !== AP.surfaceLow)
  const eyebrowColor = hasDarkBg ? AP.onDarkMuted : theme.colors.textMute
  const textColor = hasDarkBg ? AP.onDark : theme.colors.text
  const arrowColor = hasDarkBg ? AP.onDark : theme.colors.accent
  const bg = bgColor ?? AP.surfaceLow

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.tile,
          { borderRadius: theme.radii.card, backgroundColor: bg },
          pressed && styles.pressed,
        ]}
      >
        {/* Background photo layer */}
        {bgImageUri ? (
          <>
            <Image
              source={{ uri: bgImageUri }}
              style={[StyleSheet.absoluteFill, { borderRadius: theme.radii.card }]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
              style={[StyleSheet.absoluteFill, { borderRadius: theme.radii.card }]}
            />
          </>
        ) : null}

        {/* Content */}
        <View style={styles.inner}>
          <Micro
            color={eyebrowColor}
            style={{ letterSpacing: 1 }}
            numberOfLines={1}
          >
            {eyebrow.toUpperCase()}
          </Micro>
          <Small
            color={textColor}
            style={styles.primary}
            numberOfLines={2}
          >
            {primary}
          </Small>
          {secondary ? (
            <Micro color={eyebrowColor} numberOfLines={1} style={{ marginTop: 2 }}>
              {secondary}
            </Micro>
          ) : null}
        </View>

        {/* Arrow */}
        <Micro color={arrowColor} style={styles.arrow}>
          →
        </Micro>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    padding: SPACE.md,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.7,
  },
  inner: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  primary: {
    fontWeight: '600',
    marginTop: 2,
  },
  arrow: {
    position: 'absolute',
    bottom: SPACE.md,
    right: SPACE.md,
  },
})
