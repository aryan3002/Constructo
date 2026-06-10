import { formatINR } from './money'

describe('formatINR — Neev ink-first ₹, Indian grouping', () => {
  it('groups thousands the Indian way (lakh/crore), no sign by default', () => {
    expect(formatINR(124000)).toEqual({
      prefix: '',
      currency: '₹',
      value: '1,24,000',
      dir: 'none',
    })
  })

  it('groups a crore correctly', () => {
    expect(formatINR(12500000).value).toBe('1,25,00,000')
  })

  it('leaves <1000 ungrouped', () => {
    expect(formatINR(100).value).toBe('100')
    expect(formatINR(0)).toEqual({ prefix: '', currency: '₹', value: '0', dir: 'none' })
  })

  it("auto-signs a negative as paid-out with a real minus sign (−, U+2212)", () => {
    expect(formatINR(-4000)).toEqual({
      prefix: '−',
      currency: '₹',
      value: '4,000',
      dir: 'out',
    })
  })

  it('honours an explicit received (+) direction', () => {
    expect(formatINR(250000, { sign: 'in' })).toEqual({
      prefix: '+',
      currency: '₹',
      value: '2,50,000',
      dir: 'in',
    })
  })

  it('can force no sign even on a negative (sign="none")', () => {
    expect(formatINR(-4000, { sign: 'none' })).toEqual({
      prefix: '',
      currency: '₹',
      value: '4,000',
      dir: 'none',
    })
  })

  it('renders fixed decimals (paise) when asked', () => {
    expect(formatINR(1234.5, { decimals: 2 }).value).toBe('1,234.50')
  })

  it('drops paise by default (field users read whole rupees)', () => {
    expect(formatINR(1234.5).value).toBe('1,235') // rounds to whole
  })
})
