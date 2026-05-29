import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LanguageProvider, useLanguage, useT } from './index'

function Probe() {
  const t = useT()
  const { lang, setLanguage } = useLanguage()
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="approve">{t('action.approve')}</span>
      <span data-testid="allsites">{t('common.all_sites', { count: 3 })}</span>
      <button onClick={() => setLanguage('hi')}>to-hindi</button>
    </div>
  )
}

describe('i18n', () => {
  it('defaults to English and interpolates placeholders', () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
    expect(screen.getByTestId('approve')).toHaveTextContent('Approve')
    expect(screen.getByTestId('allsites')).toHaveTextContent('All Sites (3)')
  })

  it('switches language, updates strings, and persists to localStorage', async () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <Probe />
      </LanguageProvider>,
    )
    await userEvent.click(screen.getByText('to-hindi'))

    expect(screen.getByTestId('lang')).toHaveTextContent('hi')
    expect(screen.getByTestId('approve')).toHaveTextContent('मंज़ूर करें')
    expect(screen.getByTestId('allsites')).toHaveTextContent('सभी साइट (3)')
    expect(window.localStorage.getItem('cstk.lang')).toBe('hi')
    expect(document.documentElement.getAttribute('lang')).toBe('hi')
  })

  it('throws if hooks are used outside the provider', () => {
    function Bare() {
      useT()
      return null
    }
    // Suppress React's error boundary console noise for this expected throw.
    expect(() => render(<Bare />)).toThrow(/LanguageProvider/)
  })
})
