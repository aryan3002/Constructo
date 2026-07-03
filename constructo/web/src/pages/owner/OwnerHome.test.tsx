import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import { ThemeModeProvider } from '../../ui/ThemeModeProvider'
import type { ActivityPage } from '../../api/activity'
import type { Site } from '../../api/types'

const activityPage = vi.fn()
vi.mock('../../api/activity', async () => {
  const actual = await vi.importActual<typeof import('../../api/activity')>('../../api/activity')
  return { ...actual, activityApi: { page: (...a: unknown[]) => activityPage(...a) } }
})

// Child feature panels are unit-tested elsewhere; stub to keep this a composition test.
vi.mock('../../features/owner/NeedsYou', () => ({ NeedsYou: () => <div data-testid="needs-you" /> }))
const activityStreamProps = vi.fn()
vi.mock('../../features/owner/ActivityStream', () => ({
  ActivityStream: (props: unknown) => {
    activityStreamProps(props)
    return <div data-testid="activity-stream" />
  },
}))
const projectsStripProps = vi.fn()
vi.mock('../../features/owner/ProjectsStrip', () => ({
  ProjectsStrip: (props: unknown) => {
    projectsStripProps(props)
    return <div data-testid="projects-strip" />
  },
}))

// Cold-start gate reads dashboardApi.getHome — return a non-cold-start home by default.
const getHome = vi.fn()
vi.mock('../../api/dashboard', async () => {
  const actual = await vi.importActual<typeof import('../../api/dashboard')>('../../api/dashboard')
  return { ...actual, dashboardApi: { ...actual.dashboardApi, getHome: (...a: unknown[]) => getHome(...a) } }
})

// Sites list drives siteNames + AppShell switcher (useSites → api.listSites, qk.sites()).
const listSites = vi.fn()
vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return { ...actual, api: { ...actual.api, listSites: (...a: unknown[]) => listSites(...a) } }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const { OwnerHome } = await import('./OwnerHome')

const SITES: Site[] = [
  { id: 'site-a', company_id: 'co', name: 'Tower B', location: 'Bandra', type: 'residential', status: 'active', created_at: '2026-07-01T00:00:00Z' },
]

const NON_COLD_START = {
  cold_start: false,
  setup_checklist: [],
  sites: [],
  sites_total: 2,
  needs_attention_count: 0,
  brief_date: '2026-07-03',
  sites_needing_attention: 0,
}

const COLD_START = {
  cold_start: true,
  setup_checklist: [
    { key: 'add_site', done: false, title_key: 'owner.setup.add_site' },
  ],
  sites: [],
  sites_total: 0,
  needs_attention_count: 0,
  brief_date: '2026-07-03',
  sites_needing_attention: 0,
}

function page(over: Partial<ActivityPage> = {}): ActivityPage {
  return {
    items: [
      {
        id: 'update_posted:1',
        kind: 'update_posted',
        site_id: 'site-a',
        site_name: 'Tower B',
        title: 'Daily update',
        subtitle: null,
        occurred_at: '2026-07-03T07:00:00Z',
        actor: null,
        link: { type: 'update', id: 'site-a' },
        severity: 'info',
      },
    ],
    summary: { updates_today: 3, needs_decision_count: 1, sites_total: 2 },
    next_cursor: null,
    ...over,
  }
}

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role: 'owner' })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/owner']}>
        <ThemeModeProvider>
          <LanguageProvider defaultLanguage="en">
            <OwnerHome />
          </LanguageProvider>
        </ThemeModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('<OwnerHome> (activity-first)', () => {
  beforeEach(() => {
    activityPage.mockReset()
    getHome.mockReset()
    listSites.mockReset()
    activityStreamProps.mockReset()
    projectsStripProps.mockReset()
    mockNavigate.mockReset()
    listSites.mockResolvedValue({ items: SITES, next_cursor: null })
  })

  it('renders the HonestHero headline from the activity summary + all three panels', async () => {
    getHome.mockResolvedValue(NON_COLD_START)
    activityPage.mockResolvedValue(page())
    renderHome()

    expect(await screen.findByText(/3 updates today · 1 needs you/)).toBeInTheDocument()
    expect(screen.getByTestId('needs-you')).toBeInTheDocument()
    expect(screen.getByTestId('activity-stream')).toBeInTheDocument()
    expect(screen.getByTestId('projects-strip')).toBeInTheDocument()
  })

  it('does not render the removed CommandCenter columns (Portfolio / This Week)', async () => {
    getHome.mockResolvedValue(NON_COLD_START)
    activityPage.mockResolvedValue(page())
    renderHome()

    await screen.findByTestId('activity-stream')
    expect(screen.queryByText(/Sites at a glance/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/This week/i)).not.toBeInTheDocument()
  })

  it('cold start renders the SetupChecklist instead of the activity composition', async () => {
    getHome.mockResolvedValue(COLD_START)
    activityPage.mockResolvedValue(page({ summary: { updates_today: 0, needs_decision_count: 0, sites_total: 0 } }))
    renderHome()

    expect(await screen.findByText('Finish setting up')).toBeInTheDocument()
    expect(screen.queryByTestId('needs-you')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activity-stream')).not.toBeInTheDocument()
    expect(screen.queryByTestId('projects-strip')).not.toBeInTheDocument()
  })

  it('passes only { sites } to ProjectsStrip (D4 contract — no selectedSiteId/onSelectSite)', async () => {
    getHome.mockResolvedValue(NON_COLD_START)
    activityPage.mockResolvedValue(page())
    renderHome()

    await screen.findByTestId('projects-strip')
    expect(projectsStripProps).toHaveBeenCalledWith(
      expect.objectContaining({ sites: expect.arrayContaining([expect.objectContaining({ id: 'site-a' })]) }),
    )
    const lastCall = projectsStripProps.mock.calls[projectsStripProps.mock.calls.length - 1][0]
    expect(lastCall).not.toHaveProperty('selectedSiteId')
    expect(lastCall).not.toHaveProperty('onSelectSite')
  })

  it('wires ActivityStream onReply to navigate a request item to /requests', async () => {
    getHome.mockResolvedValue(NON_COLD_START)
    activityPage.mockResolvedValue(page())
    renderHome()

    await screen.findByTestId('activity-stream')
    const lastCall = activityStreamProps.mock.calls[activityStreamProps.mock.calls.length - 1][0] as {
      onReply?: (item: unknown) => void
    }
    expect(typeof lastCall.onReply).toBe('function')
    lastCall.onReply?.({ id: 'homeowner_request:1', link: { type: 'request', id: 'r1' } })
    expect(mockNavigate).toHaveBeenCalledWith('/requests')
  })
})
