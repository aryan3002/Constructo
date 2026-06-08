import { elapsedDays, formatTypicalRange } from './_updates.util'

describe('elapsedDays', () => {
  const now = new Date('2026-06-08T10:00:00+05:30')

  it('counts the start day itself as day 1', () => {
    expect(elapsedDays('2026-06-08', now)).toBe(1)
  })

  it('returns an inclusive "day N" (7 days after start = day 8)', () => {
    expect(elapsedDays('2026-06-01', now)).toBe(8)
  })

  it('returns null when there is no start date', () => {
    expect(elapsedDays(null, now)).toBeNull()
  })

  it('returns null for a future start (not begun yet)', () => {
    expect(elapsedDays('2026-06-20', now)).toBeNull()
  })

  it('returns null for an unparseable date', () => {
    expect(elapsedDays('not-a-date', now)).toBeNull()
  })
})

describe('formatTypicalRange', () => {
  it('labels the industry-typical range in English', () => {
    expect(formatTypicalRange([10, 18], 'en')).toBe('usually 10–18 days')
  })

  it('labels the range in Hindi', () => {
    expect(formatTypicalRange([10, 18], 'hi')).toBe('आमतौर पर 10–18 दिन')
  })

  it('returns null when there is no curated range (never fabricates)', () => {
    expect(formatTypicalRange(null, 'en')).toBeNull()
  })
})
