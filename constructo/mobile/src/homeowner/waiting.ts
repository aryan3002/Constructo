/**
 * Pure summary of what's waiting for the homeowner — drives the pinned
 * ThreadSummaryStrip above her chat thread. No React: trivially unit-testable.
 * Lives in `src/` (not `app/`) because Expo Router evaluates every module under
 * `app/`, so test files must never sit there.
 */
import type { HomeownerDecision, Update } from '../api/types'

/** Counts that drive the pinned ThreadSummaryStrip. `needsYouCount` = pending
 *  decisions (the actionable approvals); `updateCount` = published updates,
 *  excluding `decision_needed` (those are represented by their pending Decision,
 *  mirroring the old weave's dedupe). */
export interface WaitingSummary {
  updateCount: number
  needsYouCount: number
}

export function summarizeWaiting(
  updates: Update[],
  decisions: HomeownerDecision[],
): WaitingSummary {
  const needsYouCount = decisions.filter((d) => d.state === 'pending').length
  const updateCount = updates.filter((u) => u.type !== 'decision_needed').length
  return { updateCount, needsYouCount }
}
