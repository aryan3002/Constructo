/**
 * Pure helpers for the supervisor's asks (task reply + the old asks list).
 */
import { errorKindText } from '../../api/errorText'
import { isMoneyDecision } from '../owner/approvals.util'

type Lang = 'en' | 'hi'

/** An owner can assign a money decision (approval, payment hold) to a
 *  supervisor, but only the owner may answer it — the server refuses anyone
 *  else with 403 `owner_only`. Returns the note to show instead of Confirm /
 *  Reject, or null when the supervisor can answer. */
export function ownerOnlyNote(ask: { kind: string }, lang: Lang): string | null {
  return isMoneyDecision(ask) ? errorKindText('owner_only', lang) : null
}
