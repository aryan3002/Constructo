// Maps a failed auth call to a friendly sentence + a next step (spec §6).
// Pure: returns i18n KEYS so the screen renders them in the active language.
import { ApiError } from '../../api/client'
import type { TranslationKey } from '../../i18n'
import type { GuideSectionId } from './guide.content'

export type AuthErrorAction = 'useJoinCode' | 'signIn' | 'help' | 'retry' | 'changeNumber'

export interface AuthErrorView {
  messageKey: TranslationKey
  action?: AuthErrorAction
  /** For `action: 'help'` — the "What's what" section to open. */
  helpSection?: GuideSectionId
}

type KnownCode =
  | 'invalid_otp'
  | 'not_allowed'
  | 'deactivated'
  | 'invalid_code'
  | 'not_found'
  | 'already_claimed'
  | 'phone_mismatch'
  | 'invite_used'
  | 'invite_revoked'

const VIEWS: Record<KnownCode, AuthErrorView> = {
  invalid_otp: { messageKey: 'auth.err.invalid_otp' },
  not_allowed: { messageKey: 'auth.err.not_allowed', action: 'help', helpSection: 'notEnabled' },
  deactivated: { messageKey: 'auth.err.deactivated', action: 'changeNumber' },
  invalid_code: { messageKey: 'auth.err.invalid_code' },
  not_found: { messageKey: 'auth.err.not_found' },
  already_claimed: { messageKey: 'auth.err.already_claimed', action: 'signIn' },
  phone_mismatch: { messageKey: 'auth.err.phone_mismatch', action: 'changeNumber' },
  invite_used: { messageKey: 'auth.err.invite_used', action: 'signIn' },
  invite_revoked: { messageKey: 'auth.err.invite_revoked' },
}

const NETWORK: AuthErrorView = { messageKey: 'auth.err.network', action: 'retry' }
const GENERIC: AuthErrorView = { messageKey: 'auth.err.generic', action: 'retry' }

function isKnownCode(s: string | undefined): s is KnownCode {
  return !!s && Object.prototype.hasOwnProperty.call(VIEWS, s)
}

/**
 * Resolve the backend code: the envelope `code` when the transport captured it,
 * else the message itself (the dev mocks throw `new ApiError(401, 'invalid_otp')`),
 * else a status-based guess (a bare 401 on login can only be a wrong code).
 */
function codeOf(err: ApiError): KnownCode | undefined {
  if (isKnownCode(err.code)) return err.code
  if (isKnownCode(err.message)) return err.message
  if (err.status === 401) return 'invalid_otp'
  return undefined
}

export function mapAuthError(err: unknown): AuthErrorView {
  if (err instanceof ApiError) {
    if (err.status === 0) return NETWORK
    const code = codeOf(err)
    return code ? VIEWS[code] : GENERIC
  }
  // `fetch` rejects with a TypeError when the network is unreachable.
  if (err instanceof TypeError) return NETWORK
  return GENERIC
}
