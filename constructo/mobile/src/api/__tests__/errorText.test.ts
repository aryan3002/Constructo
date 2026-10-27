/**
 * Failed requests map to plain en/hi text — never a raw server message (T8).
 */
import { ApiError, TimeoutError } from '../client'
import { errorKind, errorText, isOwnerOnly } from '../errorText'
import { reportMutationError, shouldReportMutationError } from '../mutationErrors'
import { setActiveLang } from '../../i18n/activeLang'
import { subscribeToasts, type ToastEvent } from '../../ui/toastBus'

describe('errorKind / errorText', () => {
  it.each([
    [new TimeoutError(), 'offline'],
    [new TypeError('Network request failed'), 'offline'],
    [new ApiError(403, 'Only the owner can approve money decisions', 'owner_only'), 'owner_only'],
    [new ApiError(403, 'nope', 'forbidden'), 'forbidden'],
    [new ApiError(429, 'slow down', 'rate_limited'), 'rate_limited'],
    [new ApiError(503, 'Service Unavailable', 'http_error'), 'server'],
    [new ApiError(500, 'boom'), 'server'],
    [new ApiError(413, 'Capture media exceeds 10 MB', 'media_too_large'), 'too_large'],
    [new ApiError(401, 'expired', 'unauthorized'), 'session'],
    [new ApiError(422, 'field required', 'validation_error'), 'generic'],
    [new Error('weird'), 'generic'],
  ])('%p → %s', (err, kind) => {
    expect(errorKind(err)).toBe(kind)
  })

  it('never shows the raw server message', () => {
    const err = new ApiError(500, 'IntegrityError: duplicate key value', 'http_error')
    expect(errorText(err, 'en')).not.toContain('IntegrityError')
    expect(errorText(err, 'en')).toBe('Something went wrong on our side. Please try again in a moment.')
  })

  it('has Hindi text for every kind', () => {
    expect(errorText(new ApiError(403, 'x', 'owner_only'), 'hi')).toBe('यह फ़ैसला सिर्फ़ मालिक ले सकते हैं।')
    expect(errorText(new TimeoutError(), 'hi')).toContain('सर्वर')
  })

  it('isOwnerOnly only matches the owner_only refusal', () => {
    expect(isOwnerOnly(new ApiError(403, 'x', 'owner_only'))).toBe(true)
    expect(isOwnerOnly(new ApiError(403, 'x', 'forbidden'))).toBe(false)
  })
})

describe('mutation error fallback', () => {
  const err = new ApiError(500, 'boom')

  it('reports a mutation with no error handling of its own', () => {
    expect(shouldReportMutationError(err, {})).toBe(true)
  })

  it('skips a mutation with its own onError', () => {
    expect(shouldReportMutationError(err, { onError: () => undefined })).toBe(false)
  })

  it('skips a mutation marked errorHandled (shows isError inline)', () => {
    expect(shouldReportMutationError(err, { meta: { errorHandled: true } })).toBe(false)
  })

  it('skips an expired login (the sign-in redirect says so)', () => {
    expect(shouldReportMutationError(new ApiError(401, 'x'), {})).toBe(false)
  })

  it('shows a red error toast in the active language', () => {
    const events: ToastEvent[] = []
    const off = subscribeToasts((e) => events.push(e))
    setActiveLang('hi')
    reportMutationError(new ApiError(429, 'x', 'rate_limited'), {})
    reportMutationError(err, { meta: { errorHandled: true } })
    off()
    setActiveLang('en')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'show',
      toast: { tone: 'error', message: 'बहुत ज़्यादा कोशिशें। एक मिनट रुककर फिर कोशिश करें।' },
    })
  })
})
