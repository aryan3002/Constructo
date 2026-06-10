/**
 * Neev money formatting — the "Site Register" is dispute-grade, so every amount
 * is **ink-first, tabular, Indian-grouped** (₹1,24,000). Direction is shown with
 * an explicit sign AND colour (never colour alone): `−` paid-out / `+` received.
 *
 * Grouping is done by hand (lakh/crore: last 3 digits, then pairs) rather than
 * `toLocaleString('en-IN')` because Hermes (RN's engine) does NOT reliably honour
 * the `en-IN` locale — the same reason `chat/MessageView` groups manually.
 */

export type MoneySign = 'auto' | 'in' | 'out' | 'none'
export type MoneyDir = 'in' | 'out' | 'none'

export interface MoneyParts {
  /** Leading sign glyph: '−' (out, U+2212) · '+' (in) · '' (none). */
  prefix: string
  /** Currency glyph (always rendered, never spelled out). */
  currency: string
  /** The Indian-grouped magnitude, e.g. "1,24,000". */
  value: string
  /** Resolved direction — drives colour at the call site (out=risk, in=ok). */
  dir: MoneyDir
}

export interface FormatINROptions {
  sign?: MoneySign
  /** Fixed fraction digits (paise). Omitted → whole rupees (rounded). */
  decimals?: number
  currency?: string
}

/** Indian digit grouping on a non-negative integer string: 1234567 → 12,34,567. */
function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr
  const last3 = intStr.slice(-3)
  let rest = intStr.slice(0, -3)
  const parts: string[] = []
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2))
    rest = rest.slice(0, -2)
  }
  if (rest) parts.unshift(rest)
  return `${parts.join(',')},${last3}`
}

/**
 * Format a rupee amount into styleable parts. The component renders prefix +
 * currency + value with one tabular mono face, colouring by `dir`.
 */
export function formatINR(amount: number, opts: FormatINROptions = {}): MoneyParts {
  const { sign = 'auto', decimals, currency = '₹' } = opts
  const n = Number(amount) || 0

  let dir: MoneyDir
  if (sign === 'auto') dir = n < 0 ? 'out' : 'none'
  else dir = sign

  const abs = Math.abs(n)
  let intPart: string
  let frac = ''
  if (decimals != null) {
    const fixed = abs.toFixed(decimals)
    const dot = fixed.indexOf('.')
    intPart = dot === -1 ? fixed : fixed.slice(0, dot)
    frac = dot === -1 ? '' : fixed.slice(dot) // includes the leading "."
  } else {
    intPart = String(Math.round(abs))
  }

  const value = `${groupIndian(intPart)}${frac}`
  const prefix = dir === 'out' ? '−' : dir === 'in' ? '+' : ''

  return { prefix, currency, value, dir }
}
