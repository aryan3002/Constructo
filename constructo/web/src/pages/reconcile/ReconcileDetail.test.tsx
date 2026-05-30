import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LanguageProvider } from '../../i18n'
import { ReconcileDetail } from './ReconcileDetail'
import type { ReconcileItem } from '../../api/reconcile'

const NEEDS_APPROVAL: ReconcileItem = {
  key: 'd1:i1',
  status: 'needs_approval',
  vendor: 'UltraTech Cement',
  item: 'cement',
  site_id: 'site-1',
  amount_at_risk: 20000,
  reasons: ['quantity_variance'],
  delivery: {
    event_id: 'd1',
    occurred_on: '2026-05-20',
    vendor: 'UltraTech Cement',
    material: 'cement',
    quantity: 100,
    unit: 'bag',
    summary: '100 bags cement received',
    confidence: 0.9,
    source_message_ids: [],
  },
  invoice: {
    event_id: 'i1',
    occurred_on: '2026-05-22',
    vendor: 'UltraTech Cement',
    material: 'cement',
    quantity: 150,
    amount: 60000,
    currency: 'INR',
    invoice_number: 'INV-1',
    summary: 'Invoice INV-1',
    confidence: 0.9,
    source_message_ids: [],
  },
}

function renderDetail(item: ReconcileItem, onHeld = vi.fn()) {
  return render(
    <LanguageProvider defaultLanguage="en">
      <ReconcileDetail item={item} onHeld={onHeld} />
    </LanguageProvider>,
  )
}

describe('ReconcileDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows both sides of the mismatch and the amount at risk', () => {
    renderDetail(NEEDS_APPROVAL)
    expect(screen.getByText('Delivery (site)')).toBeInTheDocument()
    expect(screen.getByText('Invoice (supplier)')).toBeInTheDocument()
    expect(screen.getByText('₹20,000')).toBeInTheDocument()
    expect(screen.getByText('Needs approval')).toBeInTheDocument()
  })

  it('holds payment and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        decision_id: 'dec-1',
        state: 'pending',
        title: 'Hold payment to UltraTech Cement',
        assigned_to: 'owner-1',
        site_id: 'site-1',
        amount_at_risk: 20000,
        created_at: '2026-05-22T00:00:00Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const onHeld = vi.fn()
    renderDetail(NEEDS_APPROVAL, onHeld)

    await userEvent.click(screen.getByRole('button', { name: 'Hold & notify owner' }))

    await waitFor(() =>
      expect(
        screen.getByText('Payment held — sent to owner for approval.'),
      ).toBeInTheDocument(),
    )
    expect(onHeld).toHaveBeenCalledOnce()

    // The POST carried both event ids and the amount at risk.
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.invoice_event_id).toBe('i1')
    expect(body.delivery_event_id).toBe('d1')
    expect(body.amount_at_risk).toBe(20000)
  })

  it('drafts a GRN from the delivery side', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        delivery_event_id: 'd1',
        site_id: 'site-1',
        received_on: '2026-05-20',
        vendor: 'UltraTech Cement',
        material: 'cement',
        quantity: 100,
        unit: 'bag',
        reference: 'GRN-ABCD1234',
        note: 'Goods received from UltraTech Cement: cement (100 bag).',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderDetail(NEEDS_APPROVAL)

    await userEvent.click(screen.getByRole('button', { name: 'Draft GRN' }))
    await waitFor(() => expect(screen.getByText('GRN-ABCD1234')).toBeInTheDocument())
    expect(screen.getByText('Draft Goods Received Note')).toBeInTheDocument()
  })

  it('hides the hold action for matched rows', () => {
    const matched: ReconcileItem = {
      ...NEEDS_APPROVAL,
      key: 'd2:i2',
      status: 'matched',
      amount_at_risk: 0,
      reasons: [],
    }
    renderDetail(matched)
    expect(
      screen.queryByRole('button', { name: 'Hold & notify owner' }),
    ).not.toBeInTheDocument()
  })
})
