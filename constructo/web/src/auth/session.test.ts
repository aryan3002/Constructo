import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logout = vi.fn()
vi.mock('../api/auth', async () => {
  const actual = await vi.importActual<typeof import('../api/auth')>('../api/auth')
  return { ...actual, authApi: { ...actual.authApi, logout: () => logout() } }
})

const { queryClient } = await import('../api/queryClient')
const { getToken, setToken } = await import('../api/auth')
const { API_BASE } = await import('../api/config')
const session = await import('./session')
const pending = await import('../features/owner/pendingDecisions')

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('signOut', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue(undefined)
    setToken('owner-token')
  })

  it('clears the token, every cached query and per-user storage', async () => {
    queryClient.setQueryData(['decisions'], { items: [{ id: 'owner-secret' }] })
    queryClient.setQueryData(['me'], { id: 'owner' })
    localStorage.setItem('cstk.capture.queue', '[{"siteId":"s"}]')
    await session.signOut()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(getToken()).toBeNull()
    expect(queryClient.getQueryData(['decisions'])).toBeUndefined()
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
    expect(localStorage.getItem('cstk.capture.queue')).toBeNull()
  })

  it('sends a money action still in its undo window before the token is revoked', async () => {
    const order: string[] = []
    const send = vi.fn(async () => {
      order.push('sent')
    })
    logout.mockImplementation(async () => {
      order.push('logout')
    })
    pending.schedulePending({ ids: ['d1'], send, message: 'Approved' })
    await session.signOut()
    expect(order).toEqual(['sent', 'logout'])
  })

  it('still signs out when the server is unreachable', async () => {
    logout.mockRejectedValue(new TypeError('offline'))
    await session.signOut()
    expect(getToken()).toBeNull()
  })
})

describe('an ended session (401 on any API call)', () => {
  const navigate = vi.fn()
  let target: { fetch: typeof fetch }
  let reply: Response

  beforeEach(() => {
    navigate.mockReset()
    session.setSessionNavigator(navigate)
    setToken('stale')
    sessionStorage.clear()
    target = { fetch: vi.fn(async () => reply) as unknown as typeof fetch }
    session.installSessionGuard(target)
    window.history.replaceState(null, '', '/approvals?tab=open')
  })
  afterEach(() => {
    session.setSessionNavigator(null)
    window.history.replaceState(null, '', '/')
  })

  const authed = { headers: { Authorization: 'Bearer stale' } }

  it('clears the session and goes to sign-in, keeping where the person was', async () => {
    queryClient.setQueryData(['home'], { sites: ['secret'] })
    reply = json(401, { error: { code: 'invalid_token', message: 'expired' } })
    const res = await target.fetch(`${API_BASE}/api/v1/approvals`, authed)
    expect(res.status).toBe(401)
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/approvals?tab=open')}`)
    expect(getToken()).toBeNull()
    expect(queryClient.getQueryData(['home'])).toBeUndefined()
    // The sign-in screen says why, once.
    expect(session.takeSessionEnded()).toBe(true)
    expect(session.takeSessionEnded()).toBe(false)
  })

  it('leaves a wrong OTP (401 invalid_otp) to the caller', async () => {
    reply = json(401, { error: { code: 'invalid_otp', message: 'Invalid OTP' } })
    await target.fetch(`${API_BASE}/api/v1/auth/step-up/verify`, authed)
    await new Promise((r) => setTimeout(r, 0))
    expect(navigate).not.toHaveBeenCalled()
    expect(getToken()).toBe('stale')
  })

  it('ignores a 401 for a request that carried no token', async () => {
    reply = json(401, { error: { code: 'not_authenticated', message: 'Missing' } })
    await target.fetch(`${API_BASE}/api/v1/auth/me`, {})
    await new Promise((r) => setTimeout(r, 0))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('never redirects from a public page', async () => {
    for (const path of ['/login', '/join/abc', '/delete-account', '/vendor-confirm/t1']) {
      window.history.replaceState(null, '', path)
      reply = json(401, { error: { code: 'invalid_token', message: 'expired' } })
      await target.fetch(`${API_BASE}/api/v1/auth/me`, authed)
    }
    await new Promise((r) => setTimeout(r, 0))
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('safeNext', () => {
  it('only returns paths inside the app', () => {
    expect(session.safeNext('/approvals?tab=open')).toBe('/approvals?tab=open')
    expect(session.safeNext('//evil.example')).toBeNull()
    expect(session.safeNext('https://evil.example')).toBeNull()
    expect(session.safeNext(null)).toBeNull()
  })
})
