// Financial Tracking (W2.6) — a DISPLAY-ONLY money picture for one site:
// Quotation -> Billed -> Received -> Outstanding, as a single stacked bar plus
// mono ₹ figures. No rail: Constructo never moves money; this only tracks it.
// Quotation/Billed are owner-maintained; Received = ledger inflow and
// Outstanding = Billed − Received come from the server (never invented).
import { useQuery } from '@tanstack/react-query'
import { paymentsApi } from '../../api/payments'
import { qk } from '../../api/queryKeys'
import { useT } from '../../i18n'
import { formatRupees, formatRupeesCompact } from '../../lib/money'
import { H2, Mono, Small } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'

const num = (v: string | null) => {
  const n = v == null ? 0 : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function FinancialTracking({ siteId }: { siteId: string }) {
  const t = useT()
  const q = useQuery({
    queryKey: qk.financials(siteId),
    queryFn: () => paymentsApi.getFinancials(siteId),
  })

  if (q.isLoading) return <Spinner label={t('common.loading')} />
  if (q.isError)
    return (
      <ErrorState
        message={(q.error as Error)?.message ?? t('common.error')}
        onRetry={() => q.refetch()}
      />
    )
  if (!q.data) return null

  const quotation = num(q.data.quotation)
  const billed = num(q.data.billed)
  const received = num(q.data.received)
  const outstanding = num(q.data.outstanding)

  // Bar scale = the largest meaningful total (so segments never overflow).
  const base = Math.max(quotation, billed, received, 1)
  if (quotation === 0 && billed === 0 && received === 0) {
    return (
      <EmptyState
        title={t('finance.empty_title')}
        hint={t('finance.empty_hint')}
      />
    )
  }

  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`
  const unbilled = Math.max(0, quotation - billed)

  return (
    <section
      aria-labelledby="finance-heading"
      className="rounded-card border border-line bg-card p-4 shadow-card"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <H2 id="finance-heading">{t('finance.title')}</H2>
        <Small className="!text-text-mute">{t('finance.tracking_only')}</Small>
      </div>

      {/* Single stacked bar: Received | Outstanding | Unbilled (to Quotation). */}
      <div
        className="flex h-7 w-full overflow-hidden rounded-pill border border-line bg-paper"
        role="img"
        aria-label={t('finance.bar_label', {
          received: formatRupees(received),
          billed: formatRupees(billed),
          quotation: formatRupees(quotation),
        })}
      >
        <div className="h-full bg-ok" style={{ width: pct(received) }} />
        <div className="h-full bg-warn" style={{ width: pct(outstanding) }} />
        <div className="h-full bg-line" style={{ width: pct(unbilled) }} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('finance.quotation')} amount={quotation} tone="text-text" />
        <Stat label={t('finance.billed')} amount={billed} tone="text-text" />
        <Stat label={t('finance.received')} amount={received} tone="text-ok" dot="bg-ok" />
        <Stat
          label={t('finance.outstanding')}
          amount={outstanding}
          tone="text-warn"
          dot="bg-warn"
        />
      </dl>
    </section>
  )
}

function Stat({
  label,
  amount,
  tone,
  dot,
}: {
  label: string
  amount: number
  tone: string
  dot?: string
}) {
  return (
    <div className="rounded-control border border-line bg-paper px-3 py-2.5">
      <dt className="flex items-center gap-1.5">
        {dot ? <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden /> : null}
        <Small className="!text-text-mute">{label}</Small>
      </dt>
      <dd className="mt-1">
        <Mono className={`text-h2 font-semibold ${tone}`} title={formatRupees(amount)}>
          {formatRupeesCompact(amount)}
        </Mono>
      </dd>
    </div>
  )
}
