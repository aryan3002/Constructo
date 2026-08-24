import { describe, expect, it } from 'vitest'
import {
  digitsOnly,
  formatIndianMobile,
  isValidIndianMobile,
  maskPhone,
  toE164,
} from './phone'

describe('auth/phone', () => {
  it('digitsOnly strips formatting and a leading country code / trunk zero', () => {
    expect(digitsOnly('+91 98765-43210')).toBe('9876543210')
    expect(digitsOnly('09876543210')).toBe('9876543210')
    expect(digitsOnly('919876543210')).toBe('9876543210')
    expect(digitsOnly('98765')).toBe('98765')
    expect(digitsOnly('')).toBe('')
  })

  it('formatIndianMobile groups as 5 + 5 while typing', () => {
    expect(formatIndianMobile('98765')).toBe('98765')
    expect(formatIndianMobile('987654')).toBe('98765 4')
    expect(formatIndianMobile('9876543210')).toBe('98765 43210')
    expect(formatIndianMobile('')).toBe('')
  })

  it('isValidIndianMobile wants 10 digits starting 6-9', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true)
    expect(isValidIndianMobile('6000000000')).toBe(true)
    expect(isValidIndianMobile('5876543210')).toBe(false)
    expect(isValidIndianMobile('98765')).toBe(false)
    expect(isValidIndianMobile('98765432101')).toBe(false)
  })

  it('toE164 prefixes +91', () => {
    expect(toE164('9876543210')).toBe('+919876543210')
  })

  it('maskPhone renders an E.164 number for display', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98765 43210')
    expect(maskPhone('9876543210')).toBe('+91 98765 43210')
    // Non-Indian / odd input is passed through untouched rather than mangled.
    expect(maskPhone('+14155551234')).toBe('+14155551234')
  })
})
