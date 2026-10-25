/** T3: a 401 for the stored login is handled in one place (the handler the
 * AuthProvider registers); a wrong step-up OTP or a stale reply is not. */
let mockStoredToken: string | null = 'jwt-1'
jest.mock('../../store/secure', () => ({ getToken: async () => mockStoredToken }))

import { ApiError, request, setUnauthorizedHandler } from '../client'

const realFetch = global.fetch
const handler = jest.fn()

function respond(status: number, code: string) {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ error: { code, message: code } }), { status }),
  ) as unknown as typeof fetch
}

beforeEach(() => {
  mockStoredToken = 'jwt-1'
  handler.mockReset()
  setUnauthorizedHandler(handler)
})
afterEach(() => {
  global.fetch = realFetch
  setUnauthorizedHandler(null)
})

test('a 401 for the stored token fires the handler and still throws', async () => {
  respond(401, 'invalid_token')
  await expect(request('/api/v1/x')).rejects.toMatchObject({ status: 401 })
  expect(handler).toHaveBeenCalledTimes(1)
})

test('a wrong step-up OTP (401 invalid_otp) does not sign anyone out', async () => {
  respond(401, 'invalid_otp')
  await expect(request('/api/v1/auth/step-up/verify')).rejects.toBeInstanceOf(ApiError)
  expect(handler).not.toHaveBeenCalled()
})

test('a guest 401 (no stored token) does not fire', async () => {
  mockStoredToken = null
  respond(401, 'not_authenticated')
  await expect(request('/api/v1/x')).rejects.toBeInstanceOf(ApiError)
  expect(handler).not.toHaveBeenCalled()
})

test('other errors do not fire', async () => {
  respond(403, 'forbidden')
  await expect(request('/api/v1/x')).rejects.toBeInstanceOf(ApiError)
  respond(500, 'boom')
  await expect(request('/api/v1/x')).rejects.toBeInstanceOf(ApiError)
  expect(handler).not.toHaveBeenCalled()
})
