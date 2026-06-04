// Col-3 of the Owner Command Center (W1-D): This Week — the only chart zone in
// the product. Cash in / Cash out (this week, real ₹ from the payments ledger,
// never an invented series) each with a tiny lazy SVG sparkline, plus the count
// of approvals still pending, plus a one-tap CSV export of the week's rows. Four
// states on every region (skeleton / positive-empty / inline error / calm).
import { Suspense, lazy, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { paymentsApi, type Payment } from '../../api/payments'
import { qk } from '../../api/queryKeys'
import { useDecisions } from './DecisionLog'
import { formatRupeesCompact } from '../../pages/payments/money'
import { useT } from '../../i18n'
import { H2, Mono, Small, StatusDot, type Status } from '../../ui'
import { Spinner, ErrorState } from '../../components/states'

const Sparkline = lazy(() => import('./Sparkline'))

const WINDOW_DAYS = 7

/** Local YYYY-MM-DD for `d` (matches how the ledger stores `paid_on`). */
function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface WeekStats {
  cashIn: number
  cashOut: number
  inSeries: number[]
  outSeries: number[]
}

/** Bucket the ledger's rows into the trailing 7 days, by direction. */
function computeWeek(items: Payment[]): WeekStats {
  const today = new Date()
  const keys: string[] = []
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    keys.push(dayKey(d))
  }
  const index = new Map(keys.map((k, i) => [k, i]))
  const inSeries = new Array(WINDOW_DAYS).fill(0)
  const outSeries = new Array(WINDOW_DAYS).fill(0)

  for (const p of items) {
    const k = (p.paid_on ?? '').slice(0, 10)
    const i = index.get(k)
    if (i == null) continue
    const amt = Number(p.amount)
    if (!Number.isFinite(amt)) continue
    if (p.direction === 'homeowner_to_contractor') inSeries[i] += amt
    else outSeries[i] += amt
  }
  return {
    cashIn: inSeries.reduce((a, b) => a + b, 0),
    cashOut: outSeries.reduce((a, b) => a + b, 0),
    inSeries,
    outSeries,
  }
}

function toCsv(items: Payment[]): string {
  const head = ['paid_on', 'direction', 'counterparty', 'amount', 'status']
  const rows = items.map((p) =>
    [p.paid_on, p.direction, p.counterparty_name, p.amount, p.status]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  )
  return [head.join(','), ...rows].join('\n')
}

export function ThisWeek() {
  const t = useT()
  const ledger = useQuery({
    queryKey: qk.payments(),
    queryFn: () => paymentsApi.ledger(),
  })
  const decisions = useDecisions()

  const items = useMemo(() => ledger.data?.items ?? [], [ledger.data])
  const week = useMemo(() => computeWeek(items), [items])
  const weekItems = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)
    const cut = dayKey(cutoff)
    return items.filter((p) => (p.paid_on ?? '').slice(0, 10) >= cut)
  }, [items])

  const pending = (decisions.data?.items ?? []).filter(
    (d) => d.state === 'pending',
  ).length

  function exportCsv() {
    const blob = new Blob([toCsv(weekItems)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `this-week-${dayKey(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="owner-week-heading" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-2">
        <H2 id="owner-week-heading">{t('owner.week.title')}</H2>
        <button
          type="button"
          onClick={exportCsv}
          disabled={ledger.isLoading || weekItems.length === 0}
          className="inline-flex min-h-tap items-center rounded-control border border-line bg-card px-3 font-body text-small font-semibold text-text-mute cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-50"
        >
          {t('owner.week.export')}
        </button>
      </header>

      {ledger.isLoading ? (
        <Spinner label={t('owner.week.loading')} />
      ) : ledger.isError ? (
        <ErrorState
          message={t('owner.week.error')}
          onRetry={() => ledger.refetch()}
          retryLabel={t('owner.home.error')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          <StatRow
            label={t('owner.week.cash_in')}
            value={formatRupeesCompact(week.cashIn)}
            tone="ok"
            series={week.inSeries}
            seriesLabel={t('owner.week.cash_in_trend')}
          />
          <StatRow
            label={t('owner.week.cash_out')}
            value={formatRupeesCompact(week.cashOut)}
            tone="info"
            series={week.outSeries}
            seriesLabel={t('owner.week.cash_out_trend')}
          />
          <StatRow
            label={t('owner.week.pending')}
            value={String(pending)}
            tone={pending > 0 ? 'warn' : 'ok'}
          />
        </ul>
      )}
    </section>
  )
}

function StatRow({
  label,
  value,
  tone,
  series,
  seriesLabel,
}: {
  label: string
  value: string
  tone: Status
  series?: number[]
  seriesLabel?: string
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-card border border-line bg-card p-3 shadow-card">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusDot status={tone} />
          <Small className="font-semibold uppercase tracking-wide !text-text-mute">
            {label}
          </Small>
        </div>
        <Mono className="mt-1 block font-display text-h2 font-bold leading-none text-text">
          {value}
        </Mono>
      </div>
      {series && seriesLabel ? (
        <Suspense fallback={<span className="h-7 w-24" aria-hidden />}>
          <Sparkline
            values={series}
            label={seriesLabel}
            tone={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'info'}
          />
        </Suspense>
      ) : null}
    </li>
  )
}
