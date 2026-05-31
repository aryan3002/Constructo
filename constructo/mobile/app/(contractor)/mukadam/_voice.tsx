/**
 * Voice-out (🔊 "Sun lo") affordance — the accessibility MULTIPLIER for the
 * mukadam, who may not read. A big, labelled button that reads a screen's
 * contents aloud via expo-speech, with a light haptic tap on press.
 */
import { Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Speech from 'expo-speech'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { BodyStrong } from '../../../src/ui'

/** Speak the given text aloud in the active language. */
export function speak(text: string, lang: 'en' | 'hi'): void {
  Speech.stop()
  Speech.speak(text, { language: lang === 'hi' ? 'hi-IN' : 'en-IN', rate: 0.95 })
}

/** A light confirmation haptic (no-op where haptics are unsupported). */
export function tapFeedback(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
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
      onPress={() => {
        tapFeedback()
        speak(text, lang)
      }}
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
