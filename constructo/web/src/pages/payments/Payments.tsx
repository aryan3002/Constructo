import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { paymentsApi, type Payment, type PaymentStatus } from '../../api/payments'
import { useSites } from '../../api/hooks'
import { useT, type TranslationKey } from '../../i18n'
import {
  Body,
  EvidenceCard,
  H1,
  H2,
  Mono,
  Small,
  StatusPill,
  ThemeSurface,
  type EvidenceItem,
  type Status,
} from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { FinancialTracking } from '../../features/payments/FinancialTracking'
import { formatDate } from '../../lib/format'
import { formatRupees, formatRupeesCompact } from '../../lib/money'

const STATUS_TO_SPINE: Record<PaymentStatus, Status> = {
  recorded: 'info',
  confirmed: 'ok',
  disputed: 'risk',
}

const STATUS_KEY: Record<PaymentStatus, TranslationKey> = {
  recorded: 'payments.status.recorded',
  confirmed: 'payments.status.confirmed',
  disputed: 'payments.status.disputed',
}

/**
 * Payments ledger — the Cash pulse plus an evidence-dense list of recorded money
 * movements. Each row is an EvidenceCard so the reference/method proof is one tap
 * away (the soul of the product). Amounts use ₹ + lakh/crore; the Site theme.
 */
export function Payments() {
  const t = useT()
  const sites = useSites()
  const [siteId, setSiteId] = useState<string | null>(null)
  const siteOptions = sites.data?.items ?? []
  const ledger = useQuery({
    queryKey: ['payments', 'ledger', siteId],
    queryFn: () => paymentsApi.ledger(siteId ? { siteId } : {}),
  })

  return (
    <ThemeSurface theme="site" className="-mx-4 -my-6 min-h-[60vh] bg-bg px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <H1>{t('payments.title')}</H1>
          <Small className="mt-1">{t('payments.subtitle')}</Small>
        </div>
        {siteOptions.length > 0 ? (
          <label className="flex items-center gap-2">
            <Small className="font-semibold !text-text">{t('payments.site_label')}</Small>
            <select
              value={siteId ?? ''}
              onChange={(e) => setSiteId(e.target.value || null)}
              className="min-h-tap rounded-control border border-line bg-card px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">{t('owner.home.rollup_title')}</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {/* Per-site financial tracking (W2.6) — display only, above the ledger. */}
      {siteId ? <div className="mb-5"><FinancialTracking siteId={siteId} /></div> : null}

      {ledger.isLoading && <Spinner label={t('common.loading')} />}
      {ledger.isError && (
        <ErrorState
          message={(ledger.error as Error)?.message ?? t('common.error')}
          onRetry={() => ledger.refetch()}
        />
      )}

      {ledger.data && (
        <>
          <CashPulse
            inflow={ledger.data.totals.inflow}
            outflow={ledger.data.totals.outflow}
            net={ledger.data.totals.net}
            count={ledger.data.totals.count}
          />

          <H2 className="mb-3 mt-7">{t('payments.ledger')}</H2>
          {ledger.data.items.length === 0 ? (
            <EmptyState title={t('payments.empty')} hint={t('payments.empty_hint')} />
          ) : (
            <ul className="grid gap-3">
              {ledger.data.items.map((p) => (
                <li key={p.id}>
                  <PaymentRow payment={p} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ThemeSurface>
  )
}

function CashPulse({
  inflow,
  outflow,
  net,
  count,
}: {
  inflow: string
  outflow: string
  net: string
  count: number
}) {
  const t = useT()
  const netNum = Number(net)
  const netStatus: Status = netNum < 0 ? 'risk' : 'ok'
  return (
    <section
      aria-label={t('payments.cash_pulse')}
      className="rounded-card border border-line bg-card p-4 shadow-card"
    >
      <div className="flex items-center justify-between">
        <H2>{t('payments.cash_pulse')}</H2>
        <Small>{t('payments.count', { count })}</Small>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PulseStat label={t('payments.inflow')} amount={inflow} tone="ok" />
        <PulseStat label={t('payments.outflow')} amount={outflow} tone="warn" />
        <PulseStat label={t('payments.net')} amount={net} tone={netStatus} />
      </dl>
    </section>
  )
}

function PulseStat({
  label,
  amount,
  tone,
}: {
  label: string
  amount: string
  tone: Status
}) {
  const toneClass =
    tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'risk' ? 'text-risk' : 'text-info'
  return (
    <div className="rounded-control border border-line bg-paper px-3 py-2.5">
      <dt>
        <Small className="!text-text-mute">{label}</Small>
      </dt>
      <dd className="mt-1">
        <Mono className={`text-h1 font-semibold ${toneClass}`} title={formatRupees(amount)}>
          {formatRupeesCompact(amount)}
        </Mono>
      </dd>
    </div>
  )
}

function PaymentRow({ payment }: { payment: Payment }) {
  const t = useT()
  const dirKey: TranslationKey =
    payment.direction === 'homeowner_to_contractor' ? 'payments.dir.in' : 'payments.dir.out'

  const evidence: EvidenceItem[] = []
  if (payment.reference_no) {
    evidence.push({
      kind: 'challan',
      label: `${t('payments.reference')}: ${payment.reference_no}`,
      detail: payment.method ? `${t('payments.method')}: ${payment.method}` : undefined,
      meta: formatRupees(payment.amount),
    })
  }
  if (payment.source_event_id) {
    evidence.push({
      kind: 'message',
      label: t('payments.linked_event'),
      detail: payment.source_event_id,
    })
  }
  if (payment.notes) {
    evidence.push({ kind: 'message', label: payment.notes })
  }

  return (
    <EvidenceCard
      status={STATUS_TO_SPINE[payment.status]}
      claim={
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate">{payment.counterparty_name}</span>
          <Mono className="shrink-0 font-semibold" title={formatRupees(payment.amount)}>
            {formatRupeesCompact(payment.amount)}
          </Mono>
        </span>
      }
      detail={
        <span className="flex flex-wrap items-center gap-2">
          <Body as="span" className="!text-small !text-text-mute">
            {t(dirKey)}
          </Body>
          <span aria-hidden>·</span>
          <Body as="span" className="!text-small !text-text-mute">
            {t('payments.paid_on')} {formatDate(payment.paid_on)}
          </Body>
        </span>
      }
      evidence={evidence}
      trailing={<StatusPill status={STATUS_TO_SPINE[payment.status]} label={t(STATUS_KEY[payment.status])} size="sm" />}
    />
  )
}
