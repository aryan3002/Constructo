// Canonical ₹ money formatting for the whole web console (vault 11/01 §5, 04 §13).
//
// Consolidates the two formatters that grew up in separate features:
//   - reconcile/helpers.ts `formatInr` (deterministic, locale-independent)
//   - payments/money.ts `formatRupees` / `formatRupeesCompact` (Intl en-IN)
// Those modules now re-export from here so there is ONE source of truth for
// Indian digit grouping (lakh/crore) and the "ledger" no-decimal convention.

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/**
 * Whole-rupee amount with Indian digit grouping, computed WITHOUT Intl so the
 * output is identical regardless of the runner's ICU data (tests stay
 * deterministic). e.g. 1234567 -> "₹12,34,567", -1240 -> "-₹1,240".
 */
export function formatInr(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded < 0 ? '-' : ''
  const digits = String(Math.abs(rounded))
  if (digits.length <= 3) return `${sign}₹${digits}`
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${sign}₹${grouped},${last3}`
}

/** Full ₹ amount via Intl en-IN (accepts string|number), e.g. ₹1,23,45,678. */
export function formatRupees(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '₹0'
  return INR.format(n)
}

/**
 * Compact ₹ using lakh/crore for large numbers, e.g. ₹1.23 Cr, ₹4.5 L,
 * ₹85,000 — keeps dense ledger surfaces readable while the full value stays one
 * tap away.
 */
export function formatRupeesCompact(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '₹0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_00_00_000) {
    return `${sign}₹${trim(abs / 1_00_00_000)} Cr`
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${trim(abs / 1_00_000)} L`
  }
  return formatRupees(n)
}

function trim(value: number): string {
  // Up to 2 decimals, no trailing zeros: 1.20 -> "1.2", 1.00 -> "1".
  return Number(value.toFixed(2)).toString()
}
