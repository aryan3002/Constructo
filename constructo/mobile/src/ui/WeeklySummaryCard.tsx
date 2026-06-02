/**
 * WeeklySummaryCard — the warm editorial "this week" recap (handoff §4).
 *
 * A card with a Warm-Clay LEFT accent (`secondary` — the celebration tone, the
 * one place clay is allowed), an eyebrow "THIS WEEK · <range>", a 2-line AI
 * summary, and two affordances:
 *   - 🔊 Listen — reads the summary aloud via expo-speech in the active
 *     language (the §7 voice-out accessibility multiplier),
 *   - "Read the full letter →" — pushes the full weekly letter.
 *
 * Used on Home only (the spec keeps updates.tsx — founder WIP — untouched).
 */
import { Pressable, View } from 'react-native'
import { Link } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as Speech from 'expo-speech'

import { SPACE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { Body, Micro, Small } from './Typography'

export interface WeeklySummaryCardProps {
  /** Date range for the eyebrow, e.g. "26 May – 1 Jun". */
  rangeLabel: string
  /** Eyebrow prefix, localized, e.g. "THIS WEEK". */
  eyebrowPrefix: string
  /** 2-line AI summary text (already in the active language). */
  summary: string
  /** "Listen" label (localized). */
  listenLabel: string
  /** "Read the full letter →" label (localized). */
  readMoreLabel: string
  /** Pushed when "Read the full letter" is tapped. */
  readMoreHref: React.ComponentProps<typeof Link>['href']
  /** Active language — drives the TTS voice. */
  lang: 'en' | 'hi'
}

export function WeeklySummaryCard({
  rangeLabel,
  eyebrowPrefix,
  summary,
  listenLabel,
  readMoreLabel,
  readMoreHref,
  lang,
}: WeeklySummaryCardProps) {
  const { theme } = useTheme()
  const c = theme.colors

  const onListen = () => {
    Speech.stop()
    Speech.speak(summary, { language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.95 })
  }

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          borderLeftWidth: 4,
          borderLeftColor: c.secondary,
          padding: SPACE.lg,
          gap: SPACE.sm,
        },
        theme.shadowCard,
      ]}
    >
      <Micro color={c.secondary} style={{ letterSpacing: 1 }}>
        {`${eyebrowPrefix.toUpperCase()} · ${rangeLabel}`}
      </Micro>

      <Body numberOfLines={3}>{summary}</Body>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: SPACE.xs,
        }}
      >
        {/* Listen (TTS) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listenLabel}
          hitSlop={8}
          onPress={onListen}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="volume-2" size={16} color={c.secondary} />
          <Small color={c.secondary} style={{ fontWeight: '600' }}>
            {listenLabel}
          </Small>
        </Pressable>

        {/* Read the full letter → */}
        <Link href={readMoreHref} asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={readMoreLabel}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.xs,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Small color={c.accent} style={{ fontWeight: '600' }}>
              {readMoreLabel}
            </Small>
            <Feather name="arrow-right" size={14} color={c.accent} />
          </Pressable>
        </Link>
      </View>
    </View>
  )
}
