/**
 * Typography primitives — the mobile type scale, with families resolved PER
 * SURFACE. Screens never hardcode font sizes or families; they compose these.
 *
 *   Homeowner (Daylight)  → Eczar serif headlines · Hind body · IBM Plex Mono ₹
 *   Contractor (Blueprint)→ Anek display · Hind body · Spline Sans Mono ₹
 *
 * Both the SIZE scale (`TYPE` vs `TYPE_BLUEPRINT`) and the FACE (`FACES`) are
 * theme-aware; color comes from the active theme too. Eczar is HEADLINES ONLY on
 * the homeowner surface — the reassuring voice — and never used for body copy.
 */
import { Text, type TextProps, type TextStyle } from 'react-native'

import { FACES, type FaceRole } from '../theme/fonts'
import { useTheme } from '../theme/ThemeProvider'
import { TYPE, TYPE_BLUEPRINT, type TypeRole } from '../theme/tokens'

type Props = TextProps & { muted?: boolean; color?: string; style?: TextStyle | TextStyle[] }

function make(role: TypeRole, face: FaceRole) {
  return function Typo({ muted, color, style, ...rest }: Props) {
    const { theme } = useTheme()
    const base = (theme.name === 'blueprint' ? TYPE_BLUEPRINT : TYPE)[role]
    const family = FACES[theme.name][face]
    const resolved = color ?? (muted ? theme.colors.textMute : theme.colors.text)
    return (
      <Text
        {...rest}
        style={[base, { fontFamily: family, color: resolved }, style as TextStyle]}
      />
    )
  }
}

/** Hero greeting / the 3-second answer. (Daylight: Eczar 500 44px · Blueprint: Anek 28px) */
export const Display = make('display', 'hero')
/** Screen titles. (Daylight: Eczar 600 28px · Blueprint: Anek 22px) */
export const H1 = make('h1', 'h1')
/** Section / card headings. (Daylight: Eczar 600 22px · Blueprint: Anek 18px) */
export const H2 = make('h2', 'h2')
/** Card titles. (Daylight: Eczar 600 18px · Blueprint: Anek 16px) */
export const Title = make('title', 'title')
/** Primary reading copy (status sentence). Hind. */
export const BodyLg = make('bodyLg', 'body')
/** Default body copy. Hind. */
export const Body = make('body', 'body')
/** Emphasised body. Hind semibold. */
export const BodyStrong = make('body', 'bodyStrong')
/** Labels, captions, nav. Hind. Muted by default at call sites. */
export const Small = make('small', 'body')
/** Micro caption. Hind. (Daylight floors at 14px; Blueprint 12px.) */
export const Micro = make('micro', 'label')
/** ₹ amounts / counts. Mono, medium. (Daylight: IBM Plex Mono · Blueprint: Spline) */
export const DataNum = make('dataNum', 'dataNum')
/** Dates / timestamps / mono eyebrows. Mono, medium. */
export const MonoSm = make('monoSm', 'monoMedium')
/** Numerals / amounts / timestamps — mono. (Uses the `small` size.) */
export const Mono = make('small', 'mono')

const EyebrowBase = make('micro', 'bodyStrong')
/**
 * Eyebrow — the short uppercase kicker (TODAY · THIS WEEK · NEEDS YOU · 1 of 1).
 * Direction C: clay-700, uppercase, wide tracking. Sentence case is the default
 * everywhere ELSE; eyebrows are the one place we go uppercase.
 */
export function Eyebrow({ style, color, ...rest }: Props) {
  const { theme } = useTheme()
  // clay-700 on the homeowner surface; falls back to the accent on contractor.
  const clay = theme.name === 'daylight' ? '#92482a' : theme.colors.accentDeep
  return (
    <EyebrowBase
      {...rest}
      color={color ?? clay}
      style={[{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }, style as TextStyle]}
    />
  )
}
