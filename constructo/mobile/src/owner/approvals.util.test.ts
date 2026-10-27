/**
 * Tests for the owner decision helpers in src/screens/owner/approvals.util.
 */
import {
  batchConfirm,
  batchSummary,
  decisionConfirm,
  homeownerWaitText,
  isMoneyDecision,
  undoCopy,
  waitsOnHomeowner,
} from '../screens/owner/approvals.util'

describe('batchSummary (Approve all toast)', () => {
  it('reports the approved count when nothing was skipped', () => {
    expect(batchSummary({ updated: ['a', 'b'], skipped: [] }, 'en')).toBe('2 approved · released to site')
    expect(batchSummary({ updated: ['a', 'b'], skipped: [] }, 'hi')).toBe('2 मंज़ूर · साइट पर भेजे')
  })

  it('says how many were skipped and why', () => {
    const msg = batchSummary({ updated: ['a'], skipped: ['b', 'c'] }, 'en')
    expect(msg).toBe('1 approved · released to site · 2 skipped (no longer pending or not yours to decide)')
    expect(batchSummary({ updated: ['a'], skipped: ['b'] }, 'hi')).toContain('1 छोड़े गए')
  })

  it('does not claim success when everything was skipped', () => {
    expect(batchSummary({ updated: [], skipped: ['b'] }, 'en')).toMatch(/^Nothing approved · 1 skipped/)
  })
})

describe('money confirm copy', () => {
  const invoice = {
    kind: 'approval',
    title: 'Approve ACC cement invoice (₹72,000)?',
    detail: 'Delivered 2 Oct, 120 bags',
  }

  it('treats approval and hold_payment as money, the rest not', () => {
    expect(isMoneyDecision({ kind: 'approval' })).toBe(true)
    expect(isMoneyDecision({ kind: 'hold_payment' })).toBe(true)
    expect(isMoneyDecision({ kind: 'generic' })).toBe(false)
    expect(isMoneyDecision({ kind: 'homeowner_question' })).toBe(false)
  })

  it('shows the title, detail and site, and what happens', () => {
    const c = decisionConfirm(invoice, 'approve', 'Sunrise Heights', 'en')!
    expect(c.heading).toBe('Approve this?')
    expect(c.lines).toEqual([
      'Approve ACC cement invoice (₹72,000)?',
      'Delivered 2 Oct, 120 bags',
      'Site: Sunrise Heights',
    ])
    expect(c.consequence).toMatch(/approves it/)
    expect(c.confirmLabel).toBe('Approve')
    expect(c.undoNote).toMatch(/undo for 5 seconds/)
  })

  it('says a payment hold stays on hold when held', () => {
    const c = decisionConfirm({ ...invoice, kind: 'hold_payment', detail: null }, 'reject', null, 'en')!
    expect(c.heading).toBe('Hold this?')
    expect(c.lines).toEqual(['Approve ACC cement invoice (₹72,000)?'])
    expect(c.consequence).toBe('The payment stays on hold and goes back to the team.')
  })

  it('skips the confirm for non-money kinds', () => {
    expect(decisionConfirm({ ...invoice, kind: 'generic' }, 'approve', null, 'en')).toBeNull()
    expect(decisionConfirm({ ...invoice, kind: 'homeowner_question' }, 'reject', null, 'en')).toBeNull()
  })

  it('has Hindi copy', () => {
    const c = decisionConfirm(invoice, 'approve', 'Sunrise', 'hi')!
    expect(c.heading).toBe('इसे मंज़ूर करें?')
    expect(c.lines[2]).toBe('साइट: Sunrise')
  })

  it('Approve all says how many items and how many move money', () => {
    const c = batchConfirm([{ kind: 'approval' }, { kind: 'generic' }, { kind: 'hold_payment' }], 'en')!
    expect(c.heading).toBe('Approve 3 items?')
    expect(c.lines).toEqual(['3 items selected · 2 involve money.'])
    expect(c.confirmLabel).toBe('Approve 3')
    expect(batchConfirm([{ kind: 'generic' }], 'en')).toBeNull()
  })
})

describe('undoCopy', () => {
  it('reads "Approved · Undo" and says what failed', () => {
    expect(undoCopy('approve', 'en')).toEqual({ message: 'Approved', undoLabel: 'Undo', failMessage: 'Not approved.' })
    expect(undoCopy('reject', 'en').message).toBe('Held')
    expect(undoCopy('approve', 'en', 3).message).toBe('3 approved')
    expect(undoCopy('approve', 'hi')).toEqual({ message: 'मंज़ूर', undoLabel: 'वापस लें', failMessage: 'मंज़ूर नहीं हुआ।' })
  })
})

describe('questions the homeowner answers', () => {
  const now = Date.parse('2026-07-03T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('only homeowner-audience decisions wait on the homeowner', () => {
    expect(waitsOnHomeowner({ audience: 'homeowner' })).toBe(true)
    expect(waitsOnHomeowner({ audience: 'internal' })).toBe(false)
    // Older payloads without the field are the builder's own calls.
    expect(waitsOnHomeowner({})).toBe(false)
  })

  it('says how long it has waited, in English and Hindi', () => {
    expect(homeownerWaitText(ago(30 * 1000), 'en', now)).toBe('Waiting for the homeowner for 1 min')
    expect(homeownerWaitText(ago(3 * 3600 * 1000), 'en', now)).toBe(
      'Waiting for the homeowner for 3 hours',
    )
    expect(homeownerWaitText(ago(25 * 3600 * 1000), 'en', now)).toBe(
      'Waiting for the homeowner for 1 day',
    )
    expect(homeownerWaitText(ago(3 * 3600 * 1000), 'hi', now)).toBe(
      '3 घंटे से गृहस्वामी के जवाब का इंतज़ार',
    )
  })
})
