// ₹ + Indian lakh/crore money formatting for the Payments module.
//
// Lives in the owned payments page folder (lib/format.ts is foundation-owned).
// Uses Intl with the en-IN locale for correct digit grouping (1,23,45,678).

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** Full ₹ amount with Indian grouping, e.g. ₹1,23,45,678. */
export function formatRupees(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '₹0'
  return INR.format(n)
}

/**
 * Compact ₹ amount using lakh/crore for large numbers, e.g. ₹1.23 Cr, ₹4.5 L,
 * ₹85,000. Keeps the dense "ledger" surfaces readable while the full value is
 * still one tap away via the detail row.
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
