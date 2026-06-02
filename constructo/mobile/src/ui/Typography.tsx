/**
 * Typography primitives — the mobile type scale + three families (Anek display,
 * Hind body, Spline Sans Mono numerals). Screens never hardcode font sizes or
 * families; they compose these.
 *
 * The SIZE scale is theme-aware: the homeowner (Daylight) surface uses the Calm
 * Cockpit scale (`TYPE`); the contractor (Blueprint) surface keeps its tighter
 * engineered scale (`TYPE_BLUEPRINT`). Color comes from the active theme too.
 */
import { Text, type TextProps, type TextStyle } from 'react-native'

import { FONT } from '../theme/fonts'
import { useTheme } from '../theme/ThemeProvider'
import { TYPE, TYPE_BLUEPRINT, type TypeRole } from '../theme/tokens'

type Props = TextProps & { muted?: boolean; color?: string; style?: TextStyle | TextStyle[] }

function make(role: TypeRole, family: string) {
  return function Typo({ muted, color, style, ...rest }: Props) {
    const { theme } = useTheme()
    const base = (theme.name === 'blueprint' ? TYPE_BLUEPRINT : TYPE)[role]
    const resolved = color ?? (muted ? theme.colors.textMute : theme.colors.text)
    return (
      <Text
        {...rest}
        style={[base, { fontFamily: family, color: resolved }, style as TextStyle]}
      />
    )
  }
}

/** Hero greeting. Anek, bold. (Daylight 34/40 · Blueprint 28/34) */
export const Display = make('display', FONT.display)
/** Screen titles. Anek, bold. (Daylight 28/34 · Blueprint 22/28) */
export const H1 = make('h1', FONT.display)
/** Section / card headings. Anek, semibold. (Daylight 22/28 · Blueprint 18/24) */
export const H2 = make('h2', FONT.displaySemibold)
/** Card titles. Anek, semibold. */
export const Title = make('title', FONT.displaySemibold)
/** Primary reading copy (status sentence). Hind. */
export const BodyLg = make('bodyLg', FONT.body)
/** Default body copy. Hind. */
export const Body = make('body', FONT.body)
/** Emphasised body. Hind semibold. */
export const BodyStrong = make('body', FONT.bodySemibold)
/** Labels, captions, nav. Hind. Muted by default at call sites. */
export const Small = make('small', FONT.body)
/** Micro eyebrows / captions. Hind. (Daylight floors at 14px; Blueprint 12px.) */
export const Micro = make('micro', FONT.body)
/** ₹ amounts / counts. Spline Sans Mono, medium. */
export const DataNum = make('dataNum', FONT.monoMedium)
/** Dates / timestamps / mono eyebrows. Spline Sans Mono, medium. */
export const MonoSm = make('monoSm', FONT.monoMedium)
/** Numerals / amounts / timestamps — Spline Sans Mono. (Uses the `small` size.) */
export const Mono = make('small', FONT.mono)
