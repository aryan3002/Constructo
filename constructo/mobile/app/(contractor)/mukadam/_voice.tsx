/**
 * Voice-out (🔊 "Sun lo") affordance — the accessibility MULTIPLIER for the
 * mukadam, who may not read. A big, labelled button that reads a screen's
 * contents aloud.
 *
 * expo-speech is NOT installed in this app (cannot add deps from this
 * worktree), so the actual TTS is stubbed as a no-op with a TODO. The
 * AFFORDANCE is the deliverable: every read-heavy screen exposes it, icon +
 * word, ≥56px, so wiring real speech later is a one-line swap.
 */
import { Pressable, View } from 'react-native'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { BodyStrong } from '../../../src/ui'

/**
 * Speak the given text aloud.
 *
 * TODO(speech): swap for `expo-speech` once it's a dependency:
 *   import * as Speech from 'expo-speech'
 *   Speech.speak(text, { language: lang === 'hi' ? 'hi-IN' : 'en-IN' })
 * For now this is an intentional no-op so the UI affordance ships today.
 */
export function speak(_text: string, _lang: 'en' | 'hi'): void {
  // no-op stub — see TODO above.
}

const MUKADAM_TAP = 56

/** Big, labelled "🔊 Sun lo" button. Pass the text the screen should read. */
export function VoiceOutButton({
  text,
  label,
  lang,
}: {
  text: string
  label: string
  lang: 'en' | 'hi'
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={lang === 'hi' ? 'स्क्रीन ज़ोर से पढ़ता है' : 'Reads the screen aloud'}
      onPress={() => speak(text, lang)}
      style={({ pressed }) => ({
        minHeight: MUKADAM_TAP,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        alignSelf: 'flex-start',
        paddingVertical: SPACE.sm,
        paddingHorizontal: SPACE.lg,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <BodyStrong style={{ fontSize: 20 }}>🔊</BodyStrong>
      <BodyStrong>{label}</BodyStrong>
    </Pressable>
  )
}

export { MUKADAM_TAP }
