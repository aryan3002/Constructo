// Home payments card (T5). Lives under src/ (never app/ — files there are routes).
import { paymentsCardView } from '../screens/homeowner/home_payments.util'

const base = {
  total_change_cost_delta: 22500,
  change_count: 2,
  approved_change_count: 1,
  total_paid: 500000,
}

describe('paymentsCardView', () => {
  it('shows the real amount paid, the signed net change cost and the counts', () => {
    const v = paymentsCardView(base, 'en')!
    expect(v.paid).toEqual({ label: 'Paid so far', value: '₹5,00,000' })
    expect(v.changes).toEqual({ label: 'Changes so far', value: '+₹22,500' })
    expect(v.meta).toBe('2 changes · 1 approved')
    expect(v.link).toEqual({ label: 'See all changes', tab: 'changes' })
  })

  it('has no status pill (nothing in the data backs one)', () => {
    const v = paymentsCardView(base, 'en')!
    expect(Object.keys(v).sort()).toEqual(['changes', 'link', 'meta', 'paid'])
    expect(JSON.stringify(v)).not.toMatch(/Pre-approved/i)
  })

  it('hides "Paid so far" when nothing has been paid (never ₹0)', () => {
    const v = paymentsCardView({ ...base, total_paid: null }, 'en')!
    expect(v.paid).toBeNull()
    expect(v.changes?.value).toBe('+₹22,500')
  })

  it('hides the changes figure, meta and link when there are no changes', () => {
    const v = paymentsCardView(
      { total_change_cost_delta: 0, change_count: 0, approved_change_count: 0, total_paid: 250000 },
      'en',
    )!
    expect(v.paid?.value).toBe('₹2,50,000')
    expect(v.changes).toBeNull()
    expect(v.meta).toBeNull()
    expect(v.link).toBeNull()
  })

  it('signs a net saving with a minus', () => {
    const v = paymentsCardView({ ...base, total_change_cost_delta: -4000 }, 'en')!
    expect(v.changes?.value).toBe('−₹4,000')
  })

  it('uses the singular for one change', () => {
    const v = paymentsCardView({ ...base, change_count: 1, approved_change_count: 0 }, 'en')!
    expect(v.meta).toBe('1 change · 0 approved')
  })

  it('is null when there is no summary or nothing to show', () => {
    expect(paymentsCardView(null, 'en')).toBeNull()
    expect(
      paymentsCardView(
        { total_change_cost_delta: 0, change_count: 0, approved_change_count: 0, total_paid: null },
        'en',
      ),
    ).toBeNull()
  })

  it('speaks Hindi', () => {
    const v = paymentsCardView(base, 'hi')!
    expect(v.paid?.label).toBe('अब तक भुगतान')
    expect(v.changes?.label).toBe('अब तक के बदलाव')
    expect(v.meta).toBe('2 बदलाव · 1 मंज़ूर')
    expect(v.link?.label).toBe('सभी बदलाव देखें')
  })
})
