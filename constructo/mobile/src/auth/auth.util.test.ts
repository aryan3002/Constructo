/**
 * Pure auth helpers — phone shaping, error → guidance mapping, role → home.
 * (Screens can't be mounted in this jest harness; all screen logic that can
 * be extracted lives here so it IS tested.)
 */
import { ApiError } from '../api/client'
import {
  digitsOnly,
  formatIndianMobile,
  homeFor,
  isValidIndianMobile,
  mapAuthError,
  maskPhone,
  toE164,
  welcomeKey,
} from './auth.util'

const t = (k: string) => k

describe('phone shaping', () => {
  it('digitsOnly strips formatting and a leading country/trunk prefix', () => {
    expect(digitsOnly('+91 98765-43210')).toBe('9876543210')
    expect(digitsOnly('09876543210')).toBe('9876543210')
    expect(digitsOnly('919876543210')).toBe('9876543210')
    expect(digitsOnly('98765')).toBe('98765')
    expect(digitsOnly('')).toBe('')
  })

  it('digitsOnly caps at 10 digits', () => {
    expect(digitsOnly('98765432101234')).toBe('9876543210')
  })

  it('formatIndianMobile groups as 5 + 5 once past five digits', () => {
    expect(formatIndianMobile('')).toBe('')
    expect(formatIndianMobile('98765')).toBe('98765')
    expect(formatIndianMobile('987654')).toBe('98765 4')
    expect(formatIndianMobile('9876543210')).toBe('98765 43210')
  })

  it('isValidIndianMobile requires 10 digits starting 6–9', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true)
    expect(isValidIndianMobile('6000000000')).toBe(true)
    expect(isValidIndianMobile('5876543210')).toBe(false)
    expect(isValidIndianMobile('98765')).toBe(false)
    expect(isValidIndianMobile('')).toBe(false)
  })

  it('toE164 / maskPhone round-trip through the +91 form', () => {
    expect(toE164('9876543210')).toBe('+919876543210')
    expect(maskPhone('+919876543210')).toBe('+91 98765 43210')
    expect(maskPhone('9876543210')).toBe('+91 98765 43210')
    // Unknown shapes are returned untouched rather than mangled.
    expect(maskPhone('+14155550123')).toBe('+14155550123')
  })
})

describe('mapAuthError', () => {
  it.each([
    ['invalid_otp', 401, 'auth.err.invalid_otp', 'retry', undefined],
    ['not_allowed', 403, 'auth.err.not_allowed', 'help', 'notEnabled'],
    ['deactivated', 403, 'auth.err.deactivated', 'changeNumber', undefined],
    ['invalid_code', 404, 'auth.err.invalid_code', 'backToCode', undefined],
    ['not_found', 404, 'auth.err.not_found', 'backToCode', undefined],
    ['already_claimed', 409, 'auth.err.already_claimed', 'signIn', undefined],
  ] as const)('maps %s', (code, status, key, action, helpSection) => {
    const view = mapAuthError(new ApiError(status, 'raw backend text', code), t)
    expect(view.message).toBe(key)
    expect(view.action).toBe(action)
    expect(view.helpSection).toBe(helpSection)
  })

  it('treats a fetch TypeError as a network problem', () => {
    const view = mapAuthError(new TypeError('Network request failed'), t)
    expect(view).toEqual({ message: 'auth.err.network', action: 'retry' })
  })

  it('falls back to the generic message for unknown codes / errors', () => {
    expect(mapAuthError(new ApiError(500, 'boom', 'error'), t)).toEqual({
      message: 'auth.err.generic',
      action: 'retry',
    })
    expect(mapAuthError('nope', t)).toEqual({ message: 'auth.err.generic', action: 'retry' })
  })
})

describe('homeFor', () => {
  it.each([
    ['owner', '/(contractor)/owner/brief'],
    ['pm', '/(contractor)/pm/dpr'],
    ['supervisor', '/(contractor)/supervisor/home'],
    ['architect', '/(contractor)/architect/home'],
    ['accountant', '/(contractor)/accountant/reconcile'],
    ['labor_contractor', '/(contractor)/mukadam/attendance'],
    ['homeowner', '/(homeowner)/home'],
    ['procurement', '/(contractor)'],
    [null, '/(contractor)'],
  ] as const)('%s → %s', (role, href) => {
    expect(homeFor(role)).toBe(href)
  })
})

describe('welcomeKey', () => {
  it('is namespaced per user', () => {
    expect(welcomeKey('u1')).toBe('neev.welcome.u1')
    expect(welcomeKey('u1')).not.toBe(welcomeKey('u2'))
  })
})
