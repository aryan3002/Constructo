import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LanguageProvider } from '../../i18n'
import { AuthLayout, useAuthGuide } from './AuthLayout'

function renderLayout(ui: React.ReactNode = <p>form-here</p>, steps?: 'signin' | 'firstrun') {
  return render(
    <LanguageProvider defaultLanguage="en">
      <AuthLayout steps={steps}>{ui}</AuthLayout>
    </LanguageProvider>,
  )
}

describe('auth/AuthLayout', () => {
  it('renders the brand panel with the 3 "how signing in works" steps and the homeowner note', () => {
    renderLayout()
    expect(screen.getByText('form-here')).toBeInTheDocument()
    expect(screen.getAllByText('How signing in works').length).toBeGreaterThan(0)
    for (const step of [
      'Enter your phone number',
      'Type the 6-digit code we text you',
      "You're in — no password, ever",
    ]) {
      expect(screen.getAllByText(step).length).toBeGreaterThan(0)
    }
    expect(
      screen.getAllByText('The Neev app is your door — ask your builder for a join code.').length,
    ).toBeGreaterThan(0)
  })

  it('shows the 4 first-run steps instead when steps="firstrun"', () => {
    renderLayout(<p>form-here</p>, 'firstrun')
    expect(screen.getAllByText('Setting up takes a minute').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Name your company').length).toBeGreaterThan(0)
    expect(screen.getAllByText("Connect the site's WhatsApp group").length).toBeGreaterThan(0)
    expect(screen.queryByText('Enter your phone number')).toBeNull()
  })

  it('toggles the language EN -> HI from the header cluster', async () => {
    renderLayout()
    const toHindi = screen.getByRole('button', { name: /switch to hindi/i })
    expect(toHindi).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toHindi)
    expect(toHindi).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('साइन इन कैसे होता है').length).toBeGreaterThan(0)
    expect(document.documentElement.getAttribute('lang')).toBe('hi')
  })

  it('opens the "What\'s what" guide from the ? button and closes on Escape', async () => {
    renderLayout()
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /what's what/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName("What's what")
    for (const title of [
      'Two doors',
      'Join code',
      'One-time code',
      "Who's who on a site",
      'Number not enabled?',
      'Your number & privacy',
    ]) {
      expect(within(dialog).getByText(title)).toBeInTheDocument()
    }
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('lets children open the guide at a section via useAuthGuide()', async () => {
    function Child() {
      const { openGuide } = useAuthGuide()
      return <button onClick={() => openGuide('notEnabled')}>why</button>
    }
    renderLayout(<Child />)
    await userEvent.click(screen.getByText('why'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Number not enabled?')).toBeInTheDocument()
  })
})
