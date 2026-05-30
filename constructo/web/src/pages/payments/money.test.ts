import { describe, expect, it } from 'vitest'
import { formatRupees, formatRupeesCompact } from './money'

describe('money formatting', () => {
  it('formats full rupees with Indian digit grouping', () => {
    // en-IN groups as 1,23,45,678
    expect(formatRupees('12345678')).toBe('₹1,23,45,678')
    expect(formatRupees(85000)).toBe('₹85,000')
  })

  it('uses crore for >= 1 crore', () => {
    expect(formatRupeesCompact('12300000')).toBe('₹1.23 Cr')
    expect(formatRupeesCompact(20000000)).toBe('₹2 Cr')
  })

  it('uses lakh between 1 lakh and 1 crore', () => {
    expect(formatRupeesCompact('450000')).toBe('₹4.5 L')
    expect(formatRupeesCompact(100000)).toBe('₹1 L')
  })

  it('falls back to full rupees under a lakh', () => {
    expect(formatRupeesCompact('85000')).toBe('₹85,000')
  })

  it('handles negative net positions', () => {
    expect(formatRupeesCompact(-12300000)).toBe('-₹1.23 Cr')
  })

  it('guards against non-numeric input', () => {
    expect(formatRupees('not-a-number')).toBe('₹0')
    expect(formatRupeesCompact('')).toBe('₹0')
  })
})
