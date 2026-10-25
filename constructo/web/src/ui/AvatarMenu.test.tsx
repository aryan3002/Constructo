import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../i18n'
import { AvatarMenu } from './AvatarMenu'
import * as auth from '../api/auth'

const nav = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => nav,
}))

describe('AvatarMenu', () => {
  beforeEach(() => nav.mockClear())

  it('opens, shows identity + sign out, and signs out', () => {
    const spy = vi.spyOn(auth, 'clearToken').mockImplementation(() => {})
    render(
      <LanguageProvider>
        <MemoryRouter>
          <AvatarMenu roleBadge={{ name: 'Owner', initials: 'OW' }} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /owner/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(spy).toHaveBeenCalled()
    expect(nav).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('ends the login on the server with the token it is clearing', () => {
    vi.restoreAllMocks()
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    auth.setToken('jwt-out')
    render(
      <LanguageProvider>
        <MemoryRouter>
          <AvatarMenu roleBadge={{ name: 'Owner', initials: 'OW' }} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /owner/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/v1/auth/logout'))
    expect(call).toBeTruthy()
    const init = call![1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-out')
    expect(auth.getToken()).toBeNull()
    vi.unstubAllGlobals()
  })
})
