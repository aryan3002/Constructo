// On a phone a role with many tabs gets a short bar plus a "More" menu; the
// desktop sidebar still lists every tab.
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell, ROLE_TABS, phoneTabSplit } from './AppShell'

const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label)

describe('phoneTabSplit', () => {
  it("keeps the owner's four main tabs on the bar and folds the rest into More", () => {
    const { bar, overflow } = phoneTabSplit(ROLE_TABS.owner)
    expect(labels(bar)).toEqual(['Latest', 'Projects', 'Chat', 'Approvals'])
    expect(labels(overflow)).toEqual(['Requests', 'Drawings', 'Reports', 'Search', 'More'])
  })

  it('a PM bar is short too', () => {
    const { bar, overflow } = phoneTabSplit(ROLE_TABS.pm)
    expect(bar).toHaveLength(4)
    expect(bar.map((t) => t.to)).toContain('/approvals')
    expect(overflow.map((t) => t.to)).toContain('/more')
  })

  it('a role whose tabs fit keeps them all', () => {
    expect(phoneTabSplit(ROLE_TABS.accountant).overflow).toEqual([])
    expect(phoneTabSplit(ROLE_TABS.labor_contractor).overflow).toEqual([])
  })
})

describe('<AppShell> on a phone', () => {
  function renderOwner(path = '/owner') {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <AppShell role="owner">
            <p>page</p>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('the More button opens a menu of the other tabs', async () => {
    renderOwner()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const more = within(nav).getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    const menu = screen.getByRole('menu', { name: 'More' })
    expect(within(menu).getAllByRole('menuitem').map((a) => a.textContent)).toEqual([
      'Requests',
      'Drawings',
      'Reports',
      'Search',
      'More',
    ])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('every tab is still in the desktop nav (hidden on the phone bar only)', () => {
    renderOwner()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    for (const tab of ROLE_TABS.owner) {
      expect(within(nav).getByRole('link', { name: tab.label, hidden: true })).toBeInTheDocument()
    }
    const reports = within(nav).getByRole('link', { name: 'Reports', hidden: true })
    expect(reports.closest('li')).toHaveClass('hidden', 'md:block')
  })

  it('More is highlighted when the page is one of its tabs', () => {
    renderOwner('/reports')
    const more = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'More' })
    expect(more.className).toContain('text-primary-deep')
  })
})
