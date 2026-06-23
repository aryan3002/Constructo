/**
 * suggest.ts — unit tests (web Phase B). Mirrors the mobile smart-suggest test
 * (`constructo/mobile/src/capture/suggest.test.ts`) so the two stay in lock-step.
 */
import { describe, it, expect } from 'vitest'
import { suggestCapture } from './suggest'

describe('suggestCapture — delivery', () => {
  it('material + qty + unit', () => {
    const s = suggestCapture('cement 50 bori aa gaya')
    expect(s?.capture_type).toBe('delivery')
    expect(s?.fields).toEqual({ material: 'cement', quantity: 50, unit: 'bori' })
  })
  it('material + qty without a unit', () => {
    const s = suggestCapture('100 brick site pe')
    expect(s?.capture_type).toBe('delivery')
    expect(s?.fields).toEqual({ material: 'brick', quantity: 100 })
  })
})

describe('suggestCapture — attendance', () => {
  it('labor word + count', () => {
    const s = suggestCapture('aaj 24 mazdoor aaye')
    expect(s?.capture_type).toBe('attendance')
    expect(s?.fields).toEqual({ headcount: 24 })
  })
})

describe('suggestCapture — polarity guard & noise', () => {
  it('a NEED never suggests a delivery', () => {
    expect(suggestCapture('cement khatam ho gaya, order karo')).toBeNull()
    expect(suggestCapture('50 bori cement chahiye')).toBeNull()
  })
  it('no number → no suggestion', () => {
    expect(suggestCapture('cement aa gaya')).toBeNull()
  })
  it('plain greeting → nothing', () => {
    expect(suggestCapture('good morning team')).toBeNull()
    expect(suggestCapture('hi')).toBeNull()
  })
  it('does not auto-suggest money', () => {
    // payment-looking text yields no chip (money is slash-only)
    expect(suggestCapture('ramesh ko 45000 diya')).toBeNull()
  })
})

describe('suggestCapture — Hindi labels', () => {
  it('uses Hindi label when lang=hi', () => {
    const s = suggestCapture('24 mazdoor aaye', 'hi')
    expect(s?.label).toContain('हाज़िरी')
  })
})
