import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Dpr } from '../../api/dpr'

const get = vi.fn()
const send = vi.fn()
const edit = vi.fn()
const draft = vi.fn()
vi.mock('../../api/dpr', () => ({
  dprApi: {
    get: (...a: unknown[]) => get(...a),
    send: (...a: unknown[]) => send(...a),
    edit: (...a: unknown[]) => edit(...a),
    draft: (...a: unknown[]) => draft(...a),
  },
}))

const { DprReview } = await import('./DprReview')

function renderDpr() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <DprReview siteId="site-1" />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

function mkDpr(over: Partial<Dpr> = {}): Dpr {
  return {
    id: 'dpr-1',
    site_id: 'site-1',
    report_date: '2026-06-04',
    status: 'draft',
    generated_at: '2026-06-04T06:00:00Z',
    sent_at: null,
    evidence_event_ids: ['e1', 'e2'],
    sections: { confidence: 91, summary: 'Slab tied on bay 3.', blockers: [{ summary: 'Cement unverified' }] },
    ...over,
  }
}

describe('DprReview (CA1: review-then-share)', () => {
  beforeEach(() => {
    get.mockReset()
    send.mockReset()
    edit.mockReset()
    draft.mockReset()
  })

  it('renders the draft and NEVER auto-sends; share fires only on click', async () => {
    get.mockResolvedValue(mkDpr())
    send.mockResolvedValue(mkDpr({ status: 'sent', sent_at: '2026-06-04T10:00:00Z' }))
    renderDpr()

    expect(await screen.findByText('Slab tied on bay 3.')).toBeInTheDocument()
    // Critical: nothing is sent on render.
    expect(send).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /review & share/i }))
    await waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(await screen.findByText(/shared with the homeowner/i)).toBeInTheDocument()
  })

  it('low confidence blocks share until the human confirms', async () => {
    get.mockResolvedValue(mkDpr({ sections: { confidence: 70, summary: 'Unsure draft.' } }))
    renderDpr()

    await screen.findByText('Unsure draft.')
    const shareBtn = screen.getByRole('button', { name: /review & share/i })
    expect(shareBtn).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(screen.getByRole('button', { name: /review & share/i })).toBeEnabled()
    expect(send).not.toHaveBeenCalled()
  })

  it('offers to generate when no draft exists (404)', async () => {
    const err = Object.assign(new Error('not found'), { status: 404 })
    get.mockRejectedValue(err)
    draft.mockResolvedValue(mkDpr())
    renderDpr()

    const gen = await screen.findByRole('button', { name: /generate draft/i })
    await userEvent.click(gen)
    await waitFor(() => expect(draft).toHaveBeenCalledWith('site-1'))
  })
})
