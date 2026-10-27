// Home → Payments card display logic (T5). Pure, so it is unit-tested under
// src/homeowner/. Every line on the card comes from real data: "Paid so far"
// is the money the builder recorded as received (never ₹0 when nothing has been
// paid), and "Changes so far" is the net cost of the change log. There is no
// status pill — nothing in the data backs one.
import type { SpendSummary } from '../../api/types'
import { formatINR } from '../../ui/money'

type Lang = 'en' | 'hi'

const COPY = {
  en: {
    paid: 'Paid so far',
    changes: 'Changes so far',
    meta: (n: number, approved: number) =>
      `${n} change${n === 1 ? '' : 's'} · ${approved} approved`,
    seeChanges: 'See all changes',
  },
  hi: {
    paid: 'अब तक भुगतान',
    changes: 'अब तक के बदलाव',
    meta: (n: number, approved: number) => `${n} बदलाव · ${approved} मंज़ूर`,
    seeChanges: 'सभी बदलाव देखें',
  },
} as const

export interface PaymentsTile {
  label: string
  value: string
}

export interface PaymentsCardView {
  /** "Paid so far" — null (tile hidden) when no payment has been recorded. */
  paid: PaymentsTile | null
  /** "Changes so far" — signed net change cost; null when there are no changes. */
  changes: PaymentsTile | null
  /** "2 changes · 1 approved" — null when there are no changes. */
  meta: string | null
  /** Link to the Changes tab of Updates — null when there are no changes. */
  link: { label: string; tab: 'changes' } | null
}

function money(n: number, sign: 'none' | 'signed'): string {
  const dir = sign === 'signed' ? (n > 0 ? 'in' : n < 0 ? 'out' : 'none') : 'none'
  const p = formatINR(n, { sign: dir })
  return `${p.prefix}${p.currency}${p.value}`
}

/** What the Home payments card shows, or null when the card should be hidden. */
export function paymentsCardView(
  s: SpendSummary | null | undefined,
  lang: Lang,
): PaymentsCardView | null {
  if (!s) return null
  const t = COPY[lang]
  const paid = s.total_paid != null ? { label: t.paid, value: money(s.total_paid, 'none') } : null
  const hasChanges = s.change_count > 0
  const view: PaymentsCardView = {
    paid,
    changes: hasChanges
      ? { label: t.changes, value: money(s.total_change_cost_delta, 'signed') }
      : null,
    meta: hasChanges ? t.meta(s.change_count, s.approved_change_count) : null,
    link: hasChanges ? { label: t.seeChanges, tab: 'changes' } : null,
  }
  return view.paid || view.changes ? view : null
}
