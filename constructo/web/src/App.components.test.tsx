// The design-system gallery is a development aid: a production build has no
// /components route (and doesn't ship the page).
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.stubEnv('DEV', false)

const { App } = await import('./App')
const { LanguageProvider } = await import('./i18n')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter, useLocation } = await import('react-router-dom')
const { ThemeModeProvider } = await import('./ui/ThemeModeProvider')

let at = ''
function Where() {
  at = useLocation().pathname
  return null
}

describe('/components in production', () => {
  it('is not a route: it falls through to sign-in', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemeModeProvider>
          <LanguageProvider defaultLanguage="en">
            <MemoryRouter initialEntries={['/components']}>
              <App />
              <Where />
            </MemoryRouter>
          </LanguageProvider>
        </ThemeModeProvider>
      </QueryClientProvider>,
    )
    await vi.waitFor(() => expect(at).toBe('/login'))
  })
})
