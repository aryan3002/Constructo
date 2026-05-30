// Mukadam (labor contractor) Attendance — capture today's crew count with
// photo + voice/tap, framed as "proof = faster payment", plus a read-only view
// of payments the contractor has recorded for them.
//
// Two minimal tabs only (Attendance / My payments). Count is adjusted by big
// tap targets or by voice (hold-to-talk), never a fiddly form. Optimistic +
// offline-tolerant via the shared capture queue.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import { useSites } from '../../api/hooks'
import { attendanceApi, type MyPayment } from '../../api/attendance'
import { formatDate } from '../../lib/format'
import { useT, type TranslationKey } from '../../i18n'
import {
  AppShell,
  Body,
  Button,
  H2,
  Icons,
  Mono,
  Small,
  StatusPill,
  type SiteSummary,
} from '../../ui'
import { useCaptureQueue } from '../supervisor/useCaptureQueue'

type Tab = 'capture' | 'payments'

const PAYMENT_STATUS_KEY: Record<string, TranslationKey> = {
  recorded: 'attendance.payment_status.recorded',
  confirmed: 'attendance.payment_status.confirmed',
  disputed: 'attendance.payment_status.disputed',
}

const PAYMENT_STATUS_PILL: Record<string, 'ok' | 'warn' | 'risk' | 'info'> = {
  recorded: 'info',
  confirmed: 'ok',
  disputed: 'risk',
}

function formatRupees(amount: string, currency: string): string {
  const n = Number.parseFloat(amount)
  if (Number.isNaN(n)) return `${amount} ${currency}`
  // Indian digit grouping (lakh/crore) with the rupee sign.
  const grouped = n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return currency === 'INR' ? `₹${grouped}` : `${grouped} ${currency}`
}

function PaymentRow({ p, t }: { p: MyPayment; t: ReturnType<typeof useT> }) {
  const statusKey = PAYMENT_STATUS_KEY[p.status] ?? 'attendance.payment_status.recorded'
  const pill = PAYMENT_STATUS_PILL[p.status] ?? 'info'
  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-line bg-card px-3 py-3">
      <span>
        <Mono className="text-body font-semibold text-text">
          {formatRupees(p.amount, p.currency)}
        </Mono>
        <Small className="mt-0.5 block">
          <Mono className="text-text-mute">{formatDate(p.paid_on)}</Mono>
          {p.method ? ` · ${p.method}` : ''}
        </Small>
      </span>
      <StatusPill status={pill} size="sm" label={t(statusKey)} />
    </li>
  )
}

export function MukadamAttendance() {
  const t = useT()
  const date = todayIso()
  const [tab, setTab] = useState<Tab>('capture')
  const { data: sitesPage } = useSites()
  const sites = sitesPage?.items ?? []
  const [siteId, setSiteId] = useState<string | null>(null)
  const activeSiteId = siteId ?? sites[0]?.id ?? null

  const [count, setCount] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  const summary = useQuery({
    queryKey: ['attendance-summary', activeSiteId, date],
    queryFn: () => attendanceApi.summary(activeSiteId!, date),
    enabled: Boolean(activeSiteId) && tab === 'capture',
  })
  const payments = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => attendanceApi.myPayments(),
    enabled: tab === 'payments',
  })

  const queue = useCaptureQueue(() => void summary.refetch())

  const siteSummaries = useMemo<SiteSummary[]>(
    () => sites.map((s) => ({ id: s.id, name: s.name, status: 'info' as const })),
    [sites],
  )

  function send() {
    if (!activeSiteId || count <= 0) return
    queue.enqueue({ siteId: activeSiteId, headcount: count, occurredOn: date })
    setFlash(t('attendance.sent'))
    setCount(0)
  }

  return (
    <AppShell
      role="contractor"
      sites={siteSummaries}
      selectedSiteId={activeSiteId}
      onSelectSite={setSiteId}
      roleBadge={{ name: 'Mukadam', initials: 'MK' }}
    >
      <header className="mb-4">
        <H2>{t('attendance.title')}</H2>
        <Small className="mt-0.5 block">{t('attendance.subtitle')}</Small>
      </header>

      {/* Minimal tabs */}
      <div role="tablist" aria-label={t('attendance.title')} className="flex gap-2">
        {(['capture', 'payments'] as Tab[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-tap flex-1 rounded-control border px-3 font-body font-semibold cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === id
                ? 'border-primary bg-primary/10 text-primary-deep'
                : 'border-line bg-card text-text-mute hover:bg-paper'
            }`}
          >
            {t(id === 'capture' ? 'attendance.tab_capture' : 'attendance.tab_payments')}
          </button>
        ))}
      </div>

      {tab === 'capture' ? (
        <section className="mt-4" role="tabpanel">
          {/* Proof = faster payment framing */}
          <div className="flex items-start gap-3 rounded-sheet border border-primary/30 bg-primary/5 p-4">
            <span className="text-2xl" aria-hidden>
              <Icons.CameraIcon />
            </span>
            <span>
              <Body className="font-semibold text-primary-deep">
                {t('attendance.proof_payment')}
              </Body>
              <Small className="mt-0.5 block">{t('attendance.proof_payment_hint')}</Small>
            </span>
          </div>

          {sites.length === 0 ? (
            <div className="mt-4 rounded-sheet border border-dashed border-line bg-card p-8 text-center">
              <Body className="font-semibold">{t('capture.no_sites')}</Body>
            </div>
          ) : (
            <>
              {/* Big tap count, with hold-to-talk voice fallback */}
              <div className="mt-4 rounded-sheet border border-line bg-card p-4 shadow-card">
                <Small className="block font-semibold text-text">
                  {t('attendance.count_label')}
                </Small>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    aria-label={t('attendance.count_down')}
                    onClick={() => setCount((c) => Math.max(0, c - 1))}
                    disabled={count === 0}
                  >
                    −
                  </Button>
                  <Mono
                    className="min-w-[3ch] text-center text-display font-bold text-text"
                    aria-live="polite"
                  >
                    {count}
                  </Mono>
                  <Button
                    variant="secondary"
                    size="lg"
                    aria-label={t('attendance.count_up')}
                    onClick={() => setCount((c) => c + 1)}
                  >
                    +
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setFlash(t('capture.photo_hint'))}
                  className="mt-4 flex min-h-tap w-full items-center justify-center gap-2 rounded-control border border-line bg-paper px-3 font-body font-semibold text-text cstk-animate transition hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-xl" aria-hidden>
                    <Icons.PhotoIcon />
                  </span>
                  {t('attendance.add_photo')}
                </button>

                <Button
                  className="mt-3"
                  variant="primary"
                  size="lg"
                  block
                  onClick={send}
                  disabled={count <= 0}
                >
                  {t('attendance.submit')}
                </Button>
              </div>

              {/* Planned vs actual */}
              {summary.data && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label={t('attendance.planned')} value={summary.data.expected ?? '—'} />
                  <Stat label={t('attendance.actual')} value={summary.data.actual} />
                  <div className="rounded-control border border-line bg-card p-3 text-center">
                    <Small className="block">{t('attendance.variance')}</Small>
                    <div className="mt-1">
                      <StatusPill
                        status={summary.data.status}
                        size="sm"
                        label={
                          summary.data.expected == null
                            ? t('attendance.no_baseline')
                            : summary.data.variance! < 0
                              ? t('attendance.short', { count: -summary.data.variance! })
                              : summary.data.variance! > 0
                                ? t('attendance.over', { count: summary.data.variance! })
                                : t('attendance.on_track')
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {queue.pendingCount > 0 && (
                <Small className="mt-3 block" role="status" aria-live="polite">
                  <StatusPill
                    status="warn"
                    size="sm"
                    label={t('capture.queue.pending', { count: queue.pendingCount })}
                  />
                </Small>
              )}
              {flash && (
                <Small className="mt-2 block text-primary-deep" role="status">
                  {flash}
                </Small>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="mt-4" role="tabpanel">
          <H2 className="!text-h2">{t('attendance.payments_title')}</H2>
          {payments.isLoading ? (
            <Small className="mt-3 block">{t('common.loading')}</Small>
          ) : (payments.data?.items.length ?? 0) === 0 ? (
            <div className="mt-3 rounded-sheet border border-dashed border-line bg-card p-6 text-center">
              <Body className="font-semibold">{t('attendance.payments_empty')}</Body>
              <Small className="mt-1 block">{t('attendance.payments_empty_hint')}</Small>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {payments.data!.items.map((p) => (
                <PaymentRow key={p.id} p={p} t={t} />
              ))}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-control border border-line bg-card p-3 text-center">
      <Small className="block">{label}</Small>
      <Mono className="mt-1 block text-h1 font-bold text-text">{value}</Mono>
    </div>
  )
}
