/**
 * Tests for the owner decision helpers in src/screens/owner/approvals.util.
 */
import { batchSummary } from '../screens/owner/approvals.util'

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
