/**
 * MoneyCell — Neev's dispute-grade amount. One tabular mono face (Spline) owns
 * every ₹, Indian-grouped, **ink by default**; colour appears ONLY for direction
 * (− paid-out = risk, + received = ok), always alongside the explicit sign so it
 * never reads on colour alone. An optional mono UPPERCASE label sits above and a
 * quiet sublabel below.
 *
 * Theme-aware: it reads `text`/`risk`/`ok` from the active surface, so it renders
 * correctly on either client — but it is a Neev signature.
 */
import { Text, View, type ViewStyle } from 'react-native'

import { FACES } from '../theme/fonts'
import { useTheme } from '../theme/ThemeProvider'
import { formatINR, type MoneySign } from './money'
import { MonoSm } from './Typography'

export type MoneySize = 'xl' | 'lg' | 'md' | 'sm'

const SIZE: Record<MoneySize, { fontSize: number; lineHeight: number }> = {
  xl: { fontSize: 30, lineHeight: 34 },
  lg: { fontSize: 23, lineHeight: 28 },
  md: { fontSize: 18, lineHeight: 24 },
  sm: { fontSize: 15, lineHeight: 20 },
}

export interface MoneyCellProps {
  amount: number
  sign?: MoneySign
  size?: MoneySize
  /** Mono UPPERCASE caption above the amount (e.g. "VARIANCE"). */
  label?: string
  /** Quiet caption below the amount. */
  sublabel?: string
  align?: 'left' | 'right'
  /** Fixed paise. Omit → whole rupees. */
  decimals?: number
  currency?: string
  /** Force a colour (overrides direction colour) — e.g. on an ink chip. */
  color?: string
  style?: ViewStyle
}

export function MoneyCell({
  amount,
  sign = 'auto',
  size = 'md',
  label,
  sublabel,
  align = 'left',
  decimals,
  currency = '₹',
  color,
  style,
}: MoneyCellProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const { prefix, currency: cur, value, dir } = formatINR(amount, { sign, decimals, currency })
  const dirColor = dir === 'out' ? c.risk : dir === 'in' ? c.ok : c.text
  const amountColor = color ?? dirColor
  const sz = SIZE[size]
  const mono = FACES[theme.name].dataNum

  return (
    <View style={[{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }, style]}>
      {label ? (
        <MonoSm
          color={c.textMute}
          style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
        >
          {label}
        </MonoSm>
      ) : null}
      <Text
        accessibilityLabel={`${prefix}${cur}${value}`}
        style={{
          fontFamily: mono,
          fontSize: sz.fontSize,
          lineHeight: sz.lineHeight,
          letterSpacing: -0.2,
          color: amountColor,
          fontVariant: ['tabular-nums'],
        }}
      >
        {prefix ? <Text style={{ fontWeight: '700' }}>{prefix}</Text> : null}
        <Text style={{ opacity: 0.92 }}>{cur}</Text>
        {value}
      </Text>
      {sublabel ? (
        <MonoSm color={c.textMute}>{sublabel}</MonoSm>
      ) : null}
    </View>
  )
}
