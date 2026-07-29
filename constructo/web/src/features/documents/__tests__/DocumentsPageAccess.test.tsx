/**
 * DocumentsPageAccess — RBAC gating for the Drawings Register page.
 *
 * Unlike DocumentsPage.test.tsx (which stubs useCan to owner), this file uses
 * the REAL capability logic (auth/permissions) and drives the caller's role
 * purely through the ['me'] query cache. That lets us assert the actual
 * per-role behaviour of the "company registers" group.
 *
 * Contract: the group owner | pm | architect | supervisor (capability
 * view_documents) has full VIEW + MANAGE of BOTH tabs. Everyone else is denied
 * and the nav item is hidden from them.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { LanguageProvider } from '../../../i18n'
import type { DrawingRegisterRow } from '../../../api/drawings'

// ---------------------------------------------------------------------------
// Network-free mocks (NOTE: auth/useCan is intentionally NOT mocked — we want
// the real roleCan() so this test exercises the actual permission model).
// ---------------------------------------------------------------------------

const mockListRegister = vi.fn()

vi.mock('../../../api/drawings', async (orig) => {
  const actual = await orig<typeof import('../../../api/drawings')>()
  return {
    ...actual,
    drawingsApi: {
      listRegister: (...a: unknown[]) => mockListRegister(...a),
      presign: vi.fn(),
      putToR2: vi.fn(),
      publish: vi.fn(),
    },
  }
})

vi.mock('../../../api/hooks', () => ({
  useSites: () => ({
    data: { items: [{ id: 'site-1', name: 'Tripathi Residence' }], next_cursor: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

vi.mock('../../../api/documents', () => ({
  documentsApi: { list: () => Promise.resolve([]) },
}))

const rowElevation: DrawingRegisterRow = {
  id: 'drw-1',
  site_id: 'site-1',
  title: 'North Elevation',
  version: 'v1',
  kind: 'elevation',
  change_note: null,
  published_at: '2026-06-10T09:15:00Z',
  supersedes_id: null,
  site_name: 'Tripathi Residence',
  is_current: true,
  file_url: 'https://r2/north-elevation-v1.pdf',
}

const { DocumentsPage } = await import('../DocumentsPage')

function renderAs(role: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

const GROUP = ['owner', 'pm', 'architect', 'supervisor']
const OUTSIDERS = ['accountant', 'procurement', 'labor_contractor']

describe('DocumentsPage access control', () => {
  beforeEach(() => {
    mockListRegister.mockReset()
    mockListRegister.mockResolvedValue([rowElevation])
  })

  it.each(GROUP)('%s can VIEW the register (no denial card)', async (role) => {
    renderAs(role)
    expect(await screen.findByRole('heading', { name: /North Elevation/i })).toBeInTheDocument()
    expect(screen.queryByText(/no access/i)).not.toBeInTheDocument()
  })

  it.each(GROUP)('%s can MANAGE — "New drawing" button + Documents tab shown', async (role) => {
    renderAs(role)
    await screen.findByRole('heading', { name: /North Elevation/i })
    expect(screen.getByRole('button', { name: /new drawing/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^documents$/i })).toBeInTheDocument()
  })

  it.each(OUTSIDERS)('%s is DENIED — no register, no "New drawing"', async (role) => {
    renderAs(role)
    // The denial card renders instead of the register.
    expect(await screen.findByText(/no access/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /North Elevation/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new drawing/i })).not.toBeInTheDocument()
  })
})
