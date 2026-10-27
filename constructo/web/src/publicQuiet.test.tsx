// Public pages make no signed-in calls (the skin sync and command palette used
// to ask /auth/me and fail), and the frame starts with a skip link.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { App } = await import('./App')
const { OwnerSkinSync } = await import('./ui/OwnerSkinSync')
const { AppShell } = await import('./ui/AppShell')
const { clearToken, setToken } = await import('./api/auth')
const { LanguageProvider } = await import('./i18n')
const { ThemeModeProvider } = await import('./ui/ThemeModeProvider')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter } = await import('react-router-dom')

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeModeProvider>
        <OwnerSkinSync />
        <LanguageProvider defaultLanguage="en">
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </LanguageProvider>
      </ThemeModeProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearToken()
})

describe('public pages stay quiet', () => {
  it.each(['/login', '/join/tok-1', '/delete-account', '/vendor-confirm/tok-1'])(
    '%s never asks /auth/me without a login',
    async (path) => {
      clearToken()
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      renderApp(path)
      await new Promise((r) => setTimeout(r, 50))
      const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))
      expect(urls.filter((u) => u.includes('/auth/me'))).toEqual([])
    },
  )

  it('a signed-in visitor still gets their role', async () => {
    setToken('jwt')
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'u1', role: 'owner', ai_consent_at: 'x' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/login')
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String((c as unknown[])[0]).endsWith('/auth/me'))).toBe(true),
    )
  })
})

describe('skip link', () => {
  it('is the first focusable element in the frame and jumps to the page', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider defaultLanguage="hi">
          <MemoryRouter>
            <AppShell role="owner">
              <p>page</p>
            </AppShell>
          </MemoryRouter>
        </LanguageProvider>
      </QueryClientProvider>,
    )
    await userEvent.tab()
    const skip = screen.getByRole('link', { name: 'सीधे सामग्री पर जाएँ' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})
