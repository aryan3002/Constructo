/**
 * Architect conversation detail — re-exports the role-agnostic owner
 * conversation screen so the architect's chat tab has its own in-group detail
 * route (taps stay in the architect navigator). The screen reads useAuth().me,
 * so it behaves per-role.
 */
export { default } from '../../owner/chat/[id]'
