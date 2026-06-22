import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Force the flag ON for this suite, preserving the real config (API_BASE,
// USE_MOCKS, …) so transitive importers don't break.
vi.mock('../api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/config')>()),
  NEEV_OWNER_ENABLED: true,
}))

import { OwnerSkinSync } from './OwnerSkinSync'
import { ThemeModeProvider } from './ThemeModeProvider'
import { qk } from '../api/queryKeys'
import type { Me } from '../api/auth'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('OwnerSkinSync', () => {
  it('switches to the neev skin for an owner when the flag is on', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(qk.me(), { role: 'owner' } as unknown as Me)
    render(
      <QueryClientProvider client={qc}>
        <ThemeModeProvider>
          <OwnerSkinSync />
        </ThemeModeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('neev'),
    )
  })

  it('keeps blueprint for a non-owner role', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(qk.me(), { role: 'accountant' } as unknown as Me)
    render(
      <QueryClientProvider client={qc}>
        <ThemeModeProvider>
          <OwnerSkinSync />
        </ThemeModeProvider>
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    )
  })
})
