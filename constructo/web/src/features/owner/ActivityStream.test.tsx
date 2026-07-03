import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import type { ActivityItem, ActivityPage } from '../../api/activity'

const page = vi.fn()
vi.mock('../../api/activity', async () => {
  const actual = await vi.importActual<typeof import('../../api/activity')>('../../api/activity')
  return { ...actual, activityApi: { page: (...a: unknown[]) => page(...a) } }
})

const { ActivityStream, linkFor } = await import('./ActivityStream')

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'photo_shared:1',
    kind: 'photo_shared',
    site_id: 'site-a',
    site_name: 'Tower B',
    title: 'New site photo shared',
    subtitle: 'east face',
    occurred_at: new Date().toISOString(),
    actor: 'Suresh',
    link: { type: 'feed_photo', id: 'p1' },
    severity: 'success',
    ...over,
  }
}
function pageOf(items: ActivityItem[], next: string | null): ActivityPage {
  return { items, summary: { updates_today: 1, needs_decision_count: 0, sites_total: 2 }, next_cursor: next }
}

function renderStream(selectedSiteId: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider defaultLanguage="en">
          <ActivityStream selectedSiteId={selectedSiteId} />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('linkFor', () => {
  it('maps every link type to a live route', () => {
    expect(linkFor({ type: 'feed_photo', id: 'p1' })).toBe('/chat')
    expect(linkFor({ type: 'update', id: 'site-a' })).toBe('/sites/site-a')
    expect(linkFor({ type: 'milestone', id: 'site-a' })).toBe('/sites/site-a')
    expect(linkFor({ type: 'request', id: 'r1' })).toBe('/requests')
    expect(linkFor({ type: 'decision', id: 'd1' })).toBe('/approvals')
    expect(linkFor({ type: 'finding', id: 'site-a' })).toBe('/health/site-a')
  })
})

describe('<ActivityStream>', () => {
  beforeEach(() => page.mockReset())

  it('renders populated rows with title, site and a link to linkFor', async () => {
    page.mockResolvedValueOnce(pageOf([item()], null))
    renderStream()
    expect(await screen.findByText('New site photo shared')).toBeInTheDocument()
    expect(screen.getByText(/Tower B/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /New site photo shared/i })
    expect(link).toHaveAttribute('href', '/chat')
  })

  it('shows the honest empty state when the first page is empty', async () => {
    page.mockResolvedValueOnce(pageOf([], null))
    renderStream()
    expect(await screen.findByText(/No activity yet/i)).toBeInTheDocument()
  })

  it('shows an inline error + retry when the query rejects', async () => {
    page.mockRejectedValueOnce(new Error('boom'))
    renderStream()
    expect(await screen.findByText(/Could not load activity/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('loads the next page when Load more is clicked', async () => {
    page
      .mockResolvedValueOnce(pageOf([item({ id: 'photo_shared:1', title: 'First' })], '2026-07-03T00:00:00Z'))
      .mockResolvedValueOnce(pageOf([item({ id: 'update_posted:2', title: 'Second', kind: 'update_posted', link: { type: 'update', id: 'site-a' } })], null))
    renderStream()
    expect(await screen.findByText('First')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(page).toHaveBeenCalledTimes(2)
    // second call carried the cursor
    expect(page).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: '2026-07-03T00:00:00Z' }))
  })

  it('passes the site filter through to activityApi.page', async () => {
    page.mockResolvedValueOnce(pageOf([item()], null))
    renderStream('site-a')
    await waitFor(() => expect(page).toHaveBeenCalled())
    expect(page).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-a' }))
  })

  it('renders the Reply button as a sibling of the row link, not nested inside it, and keeps both affordances working', async () => {
    page.mockResolvedValueOnce(
      pageOf(
        [item({ id: 'homeowner_request:1', title: 'Homeowner asked a question', kind: 'homeowner_request', link: { type: 'request', id: 'r1' } })],
        null,
      ),
    )
    const onReply = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LanguageProvider defaultLanguage="en">
            <ActivityStream selectedSiteId={null} onReply={onReply} />
          </LanguageProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const link = await screen.findByRole('link', { name: /Homeowner asked a question/i })
    const replyButton = screen.getByRole('button', { name: /reply/i })

    // Structural invariant: a <button> must never be a descendant of an <a> —
    // interactive-in-interactive is invalid HTML and creates nested tab stops.
    expect(link.contains(replyButton)).toBe(false)
    expect(replyButton.closest('a')).toBeNull()

    // Behavioral invariant: Reply calls onReply and does not navigate...
    await userEvent.click(replyButton)
    expect(onReply).toHaveBeenCalledTimes(1)
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'homeowner_request:1' }))

    // ...while the row's title/body link still resolves to linkFor's href.
    expect(link).toHaveAttribute('href', '/requests')
  })
})
