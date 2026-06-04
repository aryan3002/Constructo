import { describe, expect, it } from 'vitest'
import { formatInr, formatRupees, formatRupeesCompact } from './money'

describe('lib/money — formatInr (deterministic, locale-independent)', () => {
  it('groups whole rupees the Indian way, no decimals', () => {
    expect(formatInr(1234567)).toBe('₹12,34,567')
    expect(formatInr(1240)).toBe('₹1,240')
    expect(formatInr(999)).toBe('₹999')
  })

  it('rounds to whole rupees', () => {
    expect(formatInr(1240.6)).toBe('₹1,241')
  })

  it('keeps the sign for negative amounts', () => {
    expect(formatInr(-1240)).toBe('-₹1,240')
  })
})

describe('lib/money — formatRupees / formatRupeesCompact (Intl en-IN)', () => {
  it('formats full rupees with Indian digit grouping', () => {
    expect(formatRupees('12345678')).toBe('₹1,23,45,678')
    expect(formatRupees(85000)).toBe('₹85,000')
  })

  it('uses crore / lakh thresholds', () => {
    expect(formatRupeesCompact('12300000')).toBe('₹1.23 Cr')
    expect(formatRupeesCompact(20000000)).toBe('₹2 Cr')
    expect(formatRupeesCompact('450000')).toBe('₹4.5 L')
    expect(formatRupeesCompact(100000)).toBe('₹1 L')
    expect(formatRupeesCompact('85000')).toBe('₹85,000')
  })

  it('handles negatives and non-numeric input', () => {
    expect(formatRupeesCompact(-12300000)).toBe('-₹1.23 Cr')
    expect(formatRupees('not-a-number')).toBe('₹0')
    expect(formatRupeesCompact('')).toBe('₹0')
  })
})
