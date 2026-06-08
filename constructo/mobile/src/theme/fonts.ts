/**
 * Font loading for the two Constructo surfaces.
 *
 * The HOMEOWNER (Daylight, "Calm Cockpit" — Direction C) and CONTRACTOR
 * (Blueprint) surfaces use DIFFERENT type faces, so faces are resolved per
 * active theme (see {@link FACES}). Both load up front; the body face (Hind)
 * is shared.
 *
 *   Homeowner (Daylight)              Contractor (Blueprint)
 *   ─────────────────────             ──────────────────────
 *   Eczar          → HEADLINES ONLY   Anek            → display/headlines
 *   Hind           → body / UI        Hind            → body / UI
 *   IBM Plex Mono  → money / numerals Spline Sans Mono → money / numerals
 *
 * Eczar + Hind + IBM Plex Mono all render Devanagari (Hindi) + Latin. Headlines
 * are Eczar serif on the homeowner surface — the reassuring "You're okay." voice
 * — and never used for body. `FACES` maps logical type roles to the registered
 * family name per theme so Typography never references raw font keys.
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
  Eczar_400Regular,
  Eczar_500Medium,
  Eczar_600SemiBold,
  Eczar_700Bold,
} from '@expo-google-fonts/eczar'
import {
  Hind_400Regular,
  Hind_600SemiBold,
  Hind_700Bold,
} from '@expo-google-fonts/hind'
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono'
import {
  SplineSansMono_400Regular,
  SplineSansMono_500Medium,
} from '@expo-google-fonts/spline-sans-mono'
import { useFonts } from 'expo-font'

import type { ThemeName } from './tokens'

/** Registered family names → font assets (passed to expo-font). */
export const FONT_MAP = {
  // ── Contractor (Blueprint) display + numerals ───────────────────────────
  'Anek-Regular': AnekLatin_400Regular,
  'Anek-SemiBold': AnekLatin_600SemiBold,
  'Anek-Bold': AnekLatin_700Bold,
  'AnekDev-Regular': AnekDevanagari_400Regular,
  'AnekDev-SemiBold': AnekDevanagari_600SemiBold,
  'AnekDev-Bold': AnekDevanagari_700Bold,
  'Spline-Regular': SplineSansMono_400Regular,
  'Spline-Medium': SplineSansMono_500Medium,
  // ── Shared body face (Latin + Devanagari) ───────────────────────────────
  'Hind-Regular': Hind_400Regular,
  'Hind-SemiBold': Hind_600SemiBold,
  'Hind-Bold': Hind_700Bold,
  // ── Homeowner (Daylight · Calm Cockpit) headlines + numerals ────────────
  'Eczar-Regular': Eczar_400Regular,
  'Eczar-Medium': Eczar_500Medium, // hero "You're okay." (Eczar 500)
  'Eczar-SemiBold': Eczar_600SemiBold, // screen / section / card headings
  'Eczar-Bold': Eczar_700Bold,
  'PlexMono-Regular': IBMPlexMono_400Regular,
  'PlexMono-Medium': IBMPlexMono_500Medium, // ₹ amounts / counts
  'PlexMono-SemiBold': IBMPlexMono_600SemiBold,
}

/** Logical role → registered family name. Distinct per surface. */
export type FaceRole =
  | 'hero'
  | 'h1'
  | 'h2'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'dataNum'
  | 'mono'
  | 'monoMedium'

export const FACES: Record<ThemeName, Record<FaceRole, string>> = {
  // Contractor — Anek display, Hind body, Spline numerals (unchanged).
  blueprint: {
    hero: 'Anek-Bold',
    h1: 'Anek-Bold',
    h2: 'Anek-SemiBold',
    title: 'Anek-SemiBold',
    body: 'Hind-Regular',
    bodyStrong: 'Hind-SemiBold',
    label: 'Hind-Regular',
    dataNum: 'Spline-Medium',
    mono: 'Spline-Regular',
    monoMedium: 'Spline-Medium',
  },
  // Homeowner — Eczar serif headlines (ONLY), Hind body, IBM Plex Mono numerals.
  daylight: {
    hero: 'Eczar-Medium', // the 3-second answer, serif, 500
    h1: 'Eczar-SemiBold',
    h2: 'Eczar-SemiBold',
    title: 'Eczar-SemiBold', // card titles (skill h3)
    body: 'Hind-Regular',
    bodyStrong: 'Hind-SemiBold',
    label: 'Hind-Regular',
    dataNum: 'PlexMono-Medium',
    mono: 'PlexMono-Regular',
    monoMedium: 'PlexMono-Medium',
  },
}

/** Load all app fonts. Returns [loaded, error]. */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts(FONT_MAP)
  return [loaded, error ?? null]
}
