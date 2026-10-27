import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

async function renderLinks() {
  vi.resetModules()
  const { LegalLinks } = await import('./LegalLinks')
  const { LanguageProvider } = await import('../i18n')
  return render(
    <LanguageProvider defaultLanguage="en">
      <LegalLinks />
    </LanguageProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('LegalLinks', () => {
  it('links the configured privacy policy and terms in a new tab', async () => {
    vi.stubEnv('VITE_PRIVACY_URL', 'https://neev.example/privacy')
    vi.stubEnv('VITE_TERMS_URL', 'https://neev.example/terms')
    await renderLinks()
    const privacy = screen.getByRole('link', { name: 'Privacy policy' })
    expect(privacy).toHaveAttribute('href', 'https://neev.example/privacy')
    expect(privacy).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      'https://neev.example/terms',
    )
  })

  it('hides the links and warns once when the URLs are not configured', async () => {
    vi.stubEnv('VITE_PRIVACY_URL', '')
    vi.stubEnv('VITE_TERMS_URL', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { container } = await renderLinks()
    expect(container).toBeEmptyDOMElement()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/VITE_PRIVACY_URL/)
  })

  it('shows only the configured one', async () => {
    vi.stubEnv('VITE_PRIVACY_URL', 'https://neev.example/privacy')
    vi.stubEnv('VITE_TERMS_URL', '')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await renderLinks()
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Terms of use' })).toBeNull()
  })
})
