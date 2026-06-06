import { isSlash, parseSlash, type ParsedCapture } from './slash'

const ok = (r: ReturnType<typeof parseSlash>): ParsedCapture => {
  if (!r || 'error' in r) throw new Error(`expected parse, got ${JSON.stringify(r)}`)
  return r
}

describe('isSlash', () => {
  it('detects a slash-command', () => {
    expect(isSlash('/del cement 50 bori')).toBe(true)
    expect(isSlash('  /att 12')).toBe(true)
  })
  it('rejects plain text and a lone slash', () => {
    expect(isSlash('cement aa gaya')).toBe(false)
    expect(isSlash('/ ')).toBe(false)
    expect(isSlash('and/or')).toBe(false)
  })
})

describe('parseSlash — attendance', () => {
  it('bare headcount', () => {
    expect(ok(parseSlash('/att 24'))).toEqual({ capture_type: 'attendance', fields: { headcount: 24 } })
  })
  it('trade breakdown sums the headcount', () => {
    expect(ok(parseSlash('/att 12 mason 8 helper'))).toEqual({
      capture_type: 'attendance',
      fields: { headcount: 20, by_trade: { mason: 12, helper: 8 } },
    })
  })
  it('bare + trade mix', () => {
    expect(ok(parseSlash('/att 12 2 mason'))).toEqual({
      capture_type: 'attendance',
      fields: { headcount: 14, by_trade: { mason: 2 } },
    })
  })
  it('flags malformed', () => {
    expect(parseSlash('/att mason')).toEqual({ error: 'usage', command: 'att' })
  })
})

describe('parseSlash — delivery', () => {
  it('material qty unit vendor', () => {
    expect(ok(parseSlash('/del cement 50 bori ABC'))).toEqual({
      capture_type: 'delivery',
      fields: { material: 'cement', quantity: 50, unit: 'bori', vendor: 'ABC' },
    })
  })
  it('multi-word vendor', () => {
    expect(ok(parseSlash('/del steel 2 ton Sharma Traders')).fields).toEqual({
      material: 'steel',
      quantity: 2,
      unit: 'ton',
      vendor: 'Sharma Traders',
    })
  })
  it('needs a quantity', () => {
    expect(parseSlash('/del cement')).toEqual({ error: 'usage', command: 'del' })
  })
})

describe('parseSlash — payment & invoice', () => {
  it('payment amount + to (handles comma grouping)', () => {
    expect(ok(parseSlash('/pay 45,000 ramesh'))).toEqual({
      capture_type: 'payment',
      fields: { amount: 45000, to: 'ramesh' },
    })
  })
  it('invoice amount + vendor', () => {
    expect(ok(parseSlash('/inv 85000 sharma'))).toEqual({
      capture_type: 'invoice',
      fields: { amount: 85000, vendor: 'sharma' },
    })
  })
  it('payment needs an amount', () => {
    expect(parseSlash('/pay ramesh')).toEqual({ error: 'usage', command: 'pay' })
  })
})

describe('parseSlash — non-commands', () => {
  it('returns null for plain text and unknown commands', () => {
    expect(parseSlash('cement aa gaya')).toBeNull()
    expect(parseSlash('/foo bar')).toBeNull()
  })
})
