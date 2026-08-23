import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { mapAuthError } from './authErrors'

describe('auth/mapAuthError', () => {
  it('401 invalid_otp -> "code did not match", no action (screen clears the code)', () => {
    expect(mapAuthError(new ApiError(401, 'Invalid OTP', 'invalid_otp'))).toEqual({
      messageKey: 'auth.err.invalid_otp',
    })
  })

  it('403 not_allowed -> help action pointing at the "not enabled" guide section', () => {
    expect(
      mapAuthError(new ApiError(403, 'This number is not enabled for the pilot', 'not_allowed')),
    ).toEqual({
      messageKey: 'auth.err.not_allowed',
      action: 'help',
      helpSection: 'notEnabled',
    })
  })

  it('403 deactivated -> change number', () => {
    expect(mapAuthError(new ApiError(403, 'deactivated', 'deactivated'))).toEqual({
      messageKey: 'auth.err.deactivated',
      action: 'changeNumber',
    })
  })

  it('404 invalid_code / not_found -> join-code copy', () => {
    expect(mapAuthError(new ApiError(404, 'Unknown join code', 'invalid_code'))).toEqual({
      messageKey: 'auth.err.invalid_code',
    })
    expect(mapAuthError(new ApiError(404, 'gone', 'not_found'))).toEqual({
      messageKey: 'auth.err.not_found',
    })
  })

  it('409 already_claimed -> sign in instead', () => {
    expect(mapAuthError(new ApiError(409, 'used', 'already_claimed'))).toEqual({
      messageKey: 'auth.err.already_claimed',
      action: 'signIn',
    })
  })

  it('403 phone_mismatch -> change number', () => {
    expect(mapAuthError(new ApiError(403, 'x', 'phone_mismatch'))).toEqual({
      messageKey: 'auth.err.phone_mismatch',
      action: 'changeNumber',
    })
  })

  it('staff invite codes: invite_used -> sign in, invite_revoked -> no action', () => {
    expect(mapAuthError(new ApiError(409, 'x', 'invite_used'))).toEqual({
      messageKey: 'auth.err.invite_used',
      action: 'signIn',
    })
    expect(mapAuthError(new ApiError(409, 'x', 'invite_revoked'))).toEqual({
      messageKey: 'auth.err.invite_revoked',
    })
  })

  it('falls back to the message when the code is carried there (mock API)', () => {
    // authApi mocks throw `new ApiError(401, 'invalid_otp')` with no code field.
    expect(mapAuthError(new ApiError(401, 'invalid_otp'))).toEqual({
      messageKey: 'auth.err.invalid_otp',
    })
  })

  it('401 without a code still reads as a wrong code', () => {
    expect(mapAuthError(new ApiError(401, 'Unauthorized'))).toEqual({
      messageKey: 'auth.err.invalid_otp',
    })
  })

  it('network failure (fetch TypeError / status 0) -> retry', () => {
    expect(mapAuthError(new TypeError('Failed to fetch'))).toEqual({
      messageKey: 'auth.err.network',
      action: 'retry',
    })
    expect(mapAuthError(new ApiError(0, 'offline'))).toEqual({
      messageKey: 'auth.err.network',
      action: 'retry',
    })
  })

  it('anything else -> generic + retry', () => {
    expect(mapAuthError(new ApiError(500, 'boom', 'http_error'))).toEqual({
      messageKey: 'auth.err.generic',
      action: 'retry',
    })
    expect(mapAuthError('nope')).toEqual({ messageKey: 'auth.err.generic', action: 'retry' })
  })
})
