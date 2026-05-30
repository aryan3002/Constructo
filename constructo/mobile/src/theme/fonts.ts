/**
 * Font loading for the three Constructo families:
 *   - Anek (display)            — Latin + Devanagari display face
 *   - Hind / Mukta (body)       — Hind covers Latin + Devanagari, our body face
 *   - Spline Sans Mono (numerals) — amounts / timestamps, tabular figures
 *
 * Loaded via expo-font. `FONT` maps logical roles to the registered family
 * names so Typography never references raw font keys. Hind handles Devanagari
 * for Hindi body copy; the Anek Devanagari faces are loaded too so a later wave
 * can swap the display face per language.
 */
import {
  AnekDevanagari_400Regular,
  AnekDevanagari_600SemiBold,
  AnekDevanagari_700Bold,
} from '@expo-google-fonts/anek-devanagari'
import {
  AnekLatin_400Regular,
  AnekLatin_600SemiBold,
  AnekLatin_700Bold,
} from '@expo-google-fonts/anek-latin'
import {
  Hind_400Regular,
  Hind_600SemiBold,
  Hind_700Bold,
} from '@expo-google-fonts/hind'
import {
  SplineSansMono_400Regular,
  SplineSansMono_500Medium,
} from '@expo-google-fonts/spline-sans-mono'
import { useFonts } from 'expo-font'

/** Registered family names → font assets (passed to expo-font). */
export const FONT_MAP = {
  'Anek-Regular': AnekLatin_400Regular,
  'Anek-SemiBold': AnekLatin_600SemiBold,
  'Anek-Bold': AnekLatin_700Bold,
  'AnekDev-Regular': AnekDevanagari_400Regular,
  'AnekDev-SemiBold': AnekDevanagari_600SemiBold,
  'AnekDev-Bold': AnekDevanagari_700Bold,
  'Hind-Regular': Hind_400Regular,
  'Hind-SemiBold': Hind_600SemiBold,
  'Hind-Bold': Hind_700Bold,
  'Mono-Regular': SplineSansMono_400Regular,
  'Mono-Medium': SplineSansMono_500Medium,
}

/** Logical role → registered family name. Typography consumes these. */
export const FONT = {
  display: 'Anek-Bold',
  displaySemibold: 'Anek-SemiBold',
  displayRegular: 'Anek-Regular',
  body: 'Hind-Regular',
  bodySemibold: 'Hind-SemiBold',
  bodyBold: 'Hind-Bold',
  mono: 'Mono-Regular',
  monoMedium: 'Mono-Medium',
} as const

/** Load all app fonts. Returns [loaded, error]. */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts(FONT_MAP)
  return [loaded, error ?? null]
}
