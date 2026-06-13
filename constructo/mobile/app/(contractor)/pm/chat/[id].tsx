/**
 * PM conversation detail — re-exports the role-agnostic owner conversation
 * screen so the PM's chat tab has its own in-group detail route (taps stay in
 * the PM navigator). The screen reads useAuth().me, so it behaves per-role.
 */
export { default } from '../../owner/chat/[id]'
