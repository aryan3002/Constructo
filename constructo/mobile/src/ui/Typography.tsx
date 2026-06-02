/**
 * Typography primitives — the mobile type scale + three families (Anek display,
 * Hind body, Spline Sans Mono numerals). Screens never hardcode font sizes or
 * families; they compose these. Color comes from the active theme.
 */
import { Text, type TextProps, type TextStyle } from 'react-native'

import { FONT } from '../theme/fonts'
import { useTheme } from '../theme/ThemeProvider'
import { TYPE } from '../theme/tokens'

type Props = TextProps & { muted?: boolean; color?: string; style?: TextStyle | TextStyle[] }

function make(base: TextStyle, family: string) {
  return function Typo({ muted, color, style, ...rest }: Props) {
    const { theme } = useTheme()
    const resolved = color ?? (muted ? theme.colors.textMute : theme.colors.text)
    return (
      <Text
        {...rest}
        style={[base, { fontFamily: family, color: resolved }, style as TextStyle]}
      />
    )
  }
}

/** 34/40 — hero greeting. Anek, bold. */
export const Display = make(TYPE.display, FONT.display)
/** 28/34 — screen titles. Anek, bold. */
export const H1 = make(TYPE.h1, FONT.display)
/** 22/28 — section / card headings. Anek, semibold. */
export const H2 = make(TYPE.h2, FONT.displaySemibold)
/** 18/24 — card titles. Anek, semibold. */
export const Title = make(TYPE.title, FONT.displaySemibold)
/** 18/28 — primary reading copy (status sentence). Hind. */
export const BodyLg = make(TYPE.bodyLg, FONT.body)
/** 16/24 — default body copy. Hind. */
export const Body = make(TYPE.body, FONT.body)
/** 16/24 — emphasised body. Hind semibold. */
export const BodyStrong = make(TYPE.body, FONT.bodySemibold)
/** 14/20 — labels, captions, nav. Hind. Muted by default at call sites. */
export const Small = make(TYPE.small, FONT.body)
/** 14/18 — micro eyebrows / captions (the 14px floor). Hind. */
export const Micro = make(TYPE.micro, FONT.body)
/** 16/22 — ₹ amounts / counts. Spline Sans Mono, medium. */
export const DataNum = make(TYPE.dataNum, FONT.monoMedium)
/** 13/18 — dates / timestamps / mono eyebrows. Spline Sans Mono, medium. */
export const MonoSm = make(TYPE.monoSm, FONT.monoMedium)
/** Numerals / amounts / timestamps — Spline Sans Mono. (Default 14/20.) */
export const Mono = make({ ...TYPE.small }, FONT.mono)
