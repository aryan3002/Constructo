import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { AiConsentGate, resetAiConsentCache } = await import('./AiConsentGate')
const { clearToken, getToken, setToken } = await import('../api/auth')
const { LanguageProvider } = await import('../i18n')

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

const ME = { id: 'u1', company_id: 'c1', name: 'Asha', phone: '+919800000003', role: 'pm', language: 'en' }

function stubServer(consented: boolean) {
  let agreedAt: string | null = consented ? '2026-10-27T10:00:00Z' : null
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/me')) return jsonOk({ ...ME, ai_consent_at: agreedAt })
    if (url.endsWith('/users/me/ai-consent') && init?.method === 'POST') {
      agreedAt = agreedAt ?? '2026-10-27T11:00:00Z'
      return jsonOk({ ...ME, ai_consent_at: agreedAt })
    }
    if (url.endsWith('/auth/logout')) return { ok: true, status: 204, json: async () => ({}) }
    throw new Error(`unexpected ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderGate() {
  return render(
    <LanguageProvider defaultLanguage="en">
      <MemoryRouter initialEntries={['/owner']}>
        <Routes>
          <Route
            path="/owner"
            element={
              <AiConsentGate>
                <p>The console</p>
              </AiConsentGate>
            }
          />
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/delete-account" element={<p>Delete page</p>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  resetAiConsentCache()
  setToken('jwt-1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearToken()
})

describe('AiConsentGate', () => {
  it('lets someone who already agreed straight through', async () => {
    stubServer(true)
    renderGate()
    expect(await screen.findByText('The console')).toBeInTheDocument()
  })

  it('shows what is sent, to whom and why before anything else', async () => {
    stubServer(false)
    renderGate()
    expect(await screen.findByText('Before you start: Neev uses AI')).toBeInTheDocument()
    expect(screen.getByText(/Photos, voice notes and chat messages/)).toBeInTheDocument()
    expect(screen.getByText(/OpenAI, or Microsoft Azure OpenAI/)).toBeInTheDocument()
    expect(screen.getByText(/read, transcribe and summarise/)).toBeInTheDocument()
    expect(screen.queryByText('The console')).toBeNull()
  })

  it('Agree records it on the server and opens the console; it is not asked again', async () => {
    const fetchMock = stubServer(false)
    const first = renderGate()
    await userEvent.click(await screen.findByRole('button', { name: 'I agree' }))
    expect(await screen.findByText('The console')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/users/me/ai-consent')),
    ).toHaveLength(1)

    // Another page for the same login: no screen, no second check.
    first.unmount()
    const meCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/me')).length
    renderGate()
    expect(screen.getByText('The console')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/me'))).toHaveLength(meCalls)
  })

  it('Not now blocks the console and offers sign out and deletion', async () => {
    stubServer(false)
    renderGate()
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.getByText("Neev can't be used without this")).toBeInTheDocument()
    expect(screen.queryByText('The console')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Delete page')).toBeInTheDocument()
  })

  it('Sign out from the declined screen ends the login', async () => {
    stubServer(false)
    renderGate()
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    await waitFor(() => expect(getToken()).toBeNull())
  })
})
