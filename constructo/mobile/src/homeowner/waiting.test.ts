import { summarizeWaiting } from './waiting'
import type { HomeownerDecision, Update } from '../api/types'

const upd = (id: string, type: string): Update =>
  ({ id, type, published_at: '2026-06-08T10:00:00Z' }) as unknown as Update
const dec = (id: string, state: string): HomeownerDecision =>
  ({ id, state, created_at: '2026-06-08T10:00:00Z' }) as unknown as HomeownerDecision

describe('summarizeWaiting', () => {
  it('counts pending decisions as "needs you" and ignores answered ones', () => {
    const s = summarizeWaiting([], [dec('d1', 'pending'), dec('d2', 'approved')])
    expect(s.needsYouCount).toBe(1)
  })

  it('counts published updates, excluding decision_needed (deduped by the decision)', () => {
    const s = summarizeWaiting([upd('u1', 'progress'), upd('u2', 'decision_needed')], [])
    expect(s.updateCount).toBe(1)
    expect(s.needsYouCount).toBe(0)
  })

  it('returns zeros for empty inputs', () => {
    const s = summarizeWaiting([], [])
    expect(s).toEqual({ updateCount: 0, needsYouCount: 0 })
  })
})
