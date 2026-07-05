/**
 * Pure grouping for the Design tab's "From your design brief" strip: the
 * decisions that exist because a routed Spec asked the homeowner to sign off
 * on a material choice (see backend sync_spec_routed_decision). A decision
 * with no spec_id is unrelated approvals/questions and stays out of this
 * group. No React: trivially unit-testable. Lives in `src/` (not `app/`)
 * because Expo Router evaluates every module under `app/`.
 */
import type { HomeownerDecision } from '../api/types'

export function briefBornDecisions(decisions: HomeownerDecision[]): HomeownerDecision[] {
  return decisions.filter((d) => d.spec_id != null)
}
