/**
 * ActionItemsDrawer — unit tests (Phase D T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../../ui/Toast'
import type { ActionItem } from '../../../api/actionItems'

vi.mock('../../../api/actionItems', async (io) => {
  const o = await io<typeof import('../../../api/actionItems')>()
  return { ...o, actionItemsApi: { ...o.actionItemsApi, list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }
})

import { actionItemsApi } from '../../../api/actionItems'
import { ActionItemsDrawer } from './ActionItemsDrawer'

const mockList = actionItemsApi.list as ReturnType<typeof vi.fn>
const mockCreate = actionItemsApi.create as ReturnType<typeof vi.fn>
const mockUpdate = actionItemsApi.update as ReturnType<typeof vi.fn>

function item(over: Partial<ActionItem>): ActionItem {
  return {
    id: 'a1', site_id: 's1', title: 'T', detail: null, status: 'open', created_by: 'u1',
    created_by_ai: false, assignee_id: null, due_on: null, source_message_id: null,
    created_at: '', updated_at: '', completed_at: null, ...over,
  }
}

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('ActionItemsDrawer', () => {
  it('lists items and toggles an open one to done', async () => {
    mockList.mockResolvedValue([item({ id: 'a1', title: 'Order cement', status: 'open' }), item({ id: 'a2', title: 'Pay vendor', status: 'done' })])
    mockUpdate.mockResolvedValue(item({ id: 'a1', status: 'done' }))
    renderWithProviders(<ActionItemsDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText('Order cement')).toBeInTheDocument()
    expect(screen.getByText('Pay vendor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /complete order cement/i }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('a1', { status: 'done' }))
  })

  it('adds a to-do', async () => {
    mockList.mockResolvedValue([])
    mockCreate.mockResolvedValue(item({ id: 'a9', title: 'Inspect slab' }))
    renderWithProviders(<ActionItemsDrawer open onClose={() => {}} siteId="s1" />)
    fireEvent.change(await screen.findByLabelText(/new to-do/i), { target: { value: 'Inspect slab' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ site_id: 's1', title: 'Inspect slab' }))
  })

  it('badges AI-created items as Nivaan', async () => {
    mockList.mockResolvedValue([item({ id: 'a1', title: 'Auto todo', created_by_ai: true })])
    renderWithProviders(<ActionItemsDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText('Nivaan')).toBeInTheDocument()
  })
})
