/**
 * LivingHomeHero — the signature "Calm Cockpit" header for the Home screen.
 *
 * The hero IS the header (handoff §2.3): there is no separate top bar. It is a
 * FULL-BLEED REAL PHOTO (never an AI/3D render — Hard Rule §8) with a bottom-up
 * dark scrim so the white overlay text stays legible on any photo. Overlaid:
 *   - "CONSTRUCTO" wordmark (top-left) + a circular avatar/settings button
 *     (top-right, 48px) that opens Settings.
 *   - greeting + property name + a status chip {tone, icon, label} bottom-left.
 *
 * Height tracks the screen state: ~45% of the viewport on-track, a calmer ~40%
 * in needs-attention / quiet (so the card content rises into view). A brand-new
 * project with no photo shows a warm placeholder + "Starting soon" — never a
 * rendered house.
 */
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Link } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AP, SPACE, STATUS, type Status } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { Display, Micro, Small } from './Typography'

export interface LivingHomeHeroStatusChip {
  tone: Status
  /** A distinct Feather glyph (shape cue independent of color). */
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
}

export interface LivingHomeHeroProps {
  /** Real contractor-published photo. When absent → warm "Starting soon". */
  imageUri?: string | null
  greeting: string
  /** Property display name (rendered as a caps eyebrow). Optional. */
  propertyName?: string | null
  /** The big reassuring headline (status sentence headline). */
  headline: string
  statusChip: LivingHomeHeroStatusChip
  /** Pushed when the avatar/settings button is tapped. */
  onAvatarHref: React.ComponentProps<typeof Link>['href']
  /** Accessible label for the avatar/settings button. */
  avatarLabel: string
  /** "Starting soon" copy for the empty (no-photo) state. */
  startingSoonLabel: string
  /** Compact mode (needs-attention / quiet) → ~40% vs ~45%. */
  compact?: boolean
}

/** Translucent white chip with a tone-colored dot + icon + word (never color
 *  alone) that reads on a dark hero. */
function HeroChip({ chip }: { chip: LivingHomeHeroStatusChip }) {
  const tone = STATUS[chip.tone]
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={chip.label}
      style={styles.chip}
    >
      <View style={[styles.chipDot, { backgroundColor: tone }]}>
        <Feather name={chip.icon} size={9} color="#ffffff" />
      </View>
      <Micro color="#ffffff">{chip.label}</Micro>
    </View>
  )
}

export function LivingHomeHero({
  imageUri,
  greeting,
  propertyName,
  headline,
  statusChip,
  onAvatarHref,
  avatarLabel,
  startingSoonLabel,
  compact,
}: LivingHomeHeroProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const { height: vh } = useWindowDimensions()
  // ~45% on-track, ~40% compact, with sane floors for short/odd viewports.
  const height = Math.max(300, Math.round(vh * (compact ? 0.4 : 0.45)))

  return (
    <View style={{ height }}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      ) : (
        // Warm placeholder — NEVER an AI/3D render. A calm clay→pine paper wash.
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[theme.colors.secondaryContainer, AP.surfaceLow, theme.colors.accentWarm]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* Bottom-up dark scrim — keeps white overlay text legible on any photo. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Top row: wordmark (left) + avatar/settings (right). */}
      <View
        style={[
          styles.topRow,
          { top: insets.top + 6, left: SPACE.gutter, right: SPACE.gutter },
        ]}
      >
        <Small color="#ffffff" style={styles.wordmark}>
          NEEV
        </Small>
        <Link href={onAvatarHref} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarLabel}
            hitSlop={10}
            style={styles.avatar}
          >
            <Feather name="user" size={20} color="#ffffff" />
          </Pressable>
        </Link>
      </View>

      {/* Bottom block: greeting + property + headline + status chip. */}
      <View style={[styles.bottom, { left: SPACE.gutter, right: SPACE.gutter }]}>
        <Small color="rgba(255,255,255,0.92)">{greeting}</Small>
        {propertyName ? (
          <Micro color="rgba(255,255,255,0.82)" style={styles.property}>
            {propertyName.toUpperCase()}
          </Micro>
        ) : null}
        {imageUri ? null : (
          <Micro color="rgba(255,255,255,0.82)" style={styles.property}>
            {startingSoonLabel}
          </Micro>
        )}
        <Display color="#ffffff" style={styles.headline}>
          {headline}
        </Display>
        <View style={styles.chipWrap}>
          <HeroChip chip={statusChip} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    letterSpacing: 3,
    fontWeight: '700',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    position: 'absolute',
    // Sits above the 24px-overlapping StatusCard; leaves room for the card lip.
    bottom: 44,
  },
  property: {
    letterSpacing: 2,
    marginTop: 2,
  },
  headline: {
    marginTop: SPACE.sm,
  },
  chipWrap: {
    alignSelf: 'flex-start',
    marginTop: SPACE.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    alignSelf: 'flex-start',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: SPACE.md,
    paddingVertical: 6,
  },
  chipDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
