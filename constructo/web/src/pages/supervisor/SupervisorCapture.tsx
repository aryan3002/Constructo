// Supervisor Capture home — the field worker's primary screen.
//
// Voice/photo FIRST (big CaptureBar), a recent-captures timeline, a
// "find a drawing / past proof" affordance, and an always-visible sync-queue
// state. Optimistic UI: a capture appears instantly and syncs in the
// background via useCaptureQueue (offline-tolerant — queued, never lost).

import { useMemo, useState } from 'react'
import { todayIso } from '../../api/config'
import { useSites } from '../../api/hooks'
import { attendanceApi } from '../../api/attendance'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import {
  AppShell,
  Body,
  Button,
  CaptureBar,
  H2,
  Icons,
  Mono,
  Small,
  StatusPill,
  TimelineItem,
  type SiteSummary,
} from '../../ui'
import { useCaptureQueue, type QueuedCapture } from './useCaptureQueue'

function queueLabelKey(item: QueuedCapture): string {
  switch (item.state) {
    case 'synced':
      return 'capture.queue.synced'
    case 'error':
      return 'capture.queue.error'
    default:
      return 'capture.queue.pending'
  }
}

export function SupervisorCapture() {
  const t = useT()
  const date = todayIso()
  const { data: sitesPage } = useSites()
  const sites = sitesPage?.items ?? []
  const [siteId, setSiteId] = useState<string | null>(null)
  const activeSiteId = siteId ?? sites[0]?.id ?? null

  const [typing, setTyping] = useState(false)
  const [headcount, setHeadcount] = useState('')
  const [note, setNote] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  const serverList = useQuery({
    queryKey: ['attendance-list', activeSiteId, date],
    queryFn: () => attendanceApi.list(activeSiteId!, date),
    enabled: Boolean(activeSiteId),
  })
  const summary = useQuery({
    queryKey: ['attendance-summary', activeSiteId, date],
    queryFn: () => attendanceApi.summary(activeSiteId!, date),
    enabled: Boolean(activeSiteId),
  })

  const queue = useCaptureQueue(() => {
    void serverList.refetch()
    void summary.refetch()
  })

  const siteSummaries = useMemo<SiteSummary[]>(
    () => sites.map((s) => ({ id: s.id, name: s.name, status: 'info' as const })),
    [sites],
  )

  function submitTyped() {
    const n = Number.parseInt(headcount, 10)
    if (!activeSiteId || Number.isNaN(n) || n < 0) return
    queue.enqueue({ siteId: activeSiteId, headcount: n, occurredOn: date, note: note.trim() || undefined })
    setFlash(t('capture.logged', { count: n }))
    setHeadcount('')
    setNote('')
    setTyping(false)
  }

  // Optimistic rows (still syncing/queued) shown above already-synced server rows.
  const optimistic = queue.queue.filter((q) => q.state !== 'synced')
  const serverRows = serverList.data?.items ?? []
  const isEmpty = optimistic.length === 0 && serverRows.length === 0

  const queueStatus =
    queue.errorCount > 0 ? 'risk' : queue.pendingCount > 0 ? 'warn' : 'ok'
  const queueLabel =
    queue.errorCount > 0
      ? t('capture.queue.error', { count: queue.errorCount })
      : queue.pendingCount > 0
        ? t('capture.queue.pending', { count: queue.pendingCount })
        : t('capture.queue.synced')

  return (
    <AppShell
      role="supervisor"
      sites={siteSummaries}
      selectedSiteId={activeSiteId}
      onSelectSite={setSiteId}
      roleBadge={{ name: 'Supervisor', initials: 'SV' }}
    >
      <header className="mb-4">
        <H2>{t('capture.title')}</H2>
        <Small className="mt-0.5 block">{t('capture.subtitle')}</Small>
      </header>

      {sites.length === 0 ? (
        <div className="rounded-sheet border border-dashed border-line bg-card p-8 text-center">
          <Body className="font-semibold">{t('capture.no_sites')}</Body>
        </div>
      ) : (
        <>
          {/* Capture-first input */}
          <CaptureBar
            onPhoto={() => setFlash(t('capture.photo_hint'))}
            onTalkEnd={() => setFlash(t('capture.voice_hint'))}
            onType={() => setTyping((v) => !v)}
          />

          {/* Sync-queue state — always visible, offline-tolerant. */}
          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-control border border-line bg-paper px-3 py-2"
            role="status"
            aria-live="polite"
          >
            <span className="flex items-center gap-2">
              <StatusPill status={queueStatus} size="sm" label={queueLabel} />
              <Small className="hidden sm:inline">{t('capture.queue.never_lose')}</Small>
            </span>
            {queue.errorCount > 0 && (
              <Button variant="secondary" size="md" onClick={queue.retry}>
                {t('capture.queue.retry')}
              </Button>
            )}
          </div>

          {flash && (
            <Small className="mt-2 block text-primary-deep" role="status">
              {flash}
            </Small>
          )}

          {/* Type-instead sheet */}
          {typing && (
            <section className="mt-3 rounded-sheet border border-line bg-card p-4 shadow-card">
              <H2 className="!text-h2">{t('capture.type_title')}</H2>
              <div className="mt-3">
                <label
                  htmlFor="headcount"
                  className="block font-body text-small font-semibold text-text"
                >
                  {t('capture.headcount_label')}
                </label>
                <input
                  id="headcount"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  className="mt-1 min-h-tap w-full rounded-control border border-line bg-paper-2 px-3 cstk-mono text-body text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="mt-3">
                <label
                  htmlFor="note"
                  className="block font-body text-small font-semibold text-text"
                >
                  {t('capture.note_label')}
                </label>
                <input
                  id="note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('capture.note_placeholder')}
                  className="mt-1 min-h-tap w-full rounded-control border border-line bg-paper-2 px-3 font-body text-body text-text placeholder:text-text-mute focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <Button
                className="mt-4"
                variant="primary"
                block
                onClick={submitTyped}
                disabled={headcount.trim() === ''}
              >
                {t('capture.submit')}
              </Button>
            </section>
          )}

          {/* Planned-vs-actual snapshot */}
          {summary.data && (
            <div className="mt-4 flex items-center justify-between rounded-control border border-line bg-card px-3 py-2">
              <Small className="font-semibold">
                {t('attendance.actual')}:{' '}
                <Mono className="text-text">{summary.data.actual}</Mono>
                {summary.data.expected != null && (
                  <>
                    {' / '}
                    <Mono className="text-text-mute">{summary.data.expected}</Mono>
                  </>
                )}
              </Small>
              <StatusPill
                status={summary.data.status}
                size="sm"
                label={
                  summary.data.expected == null
                    ? t('attendance.no_baseline')
                    : summary.data.variance! < 0
                      ? t('attendance.short', { count: -summary.data.variance! })
                      : t('attendance.on_track')
                }
              />
            </div>
          )}

          {/* Find a drawing / past proof */}
          <button
            type="button"
            className="mt-4 flex min-h-tap w-full items-center gap-3 rounded-control border border-line bg-card px-3 py-2 text-left cstk-animate transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="text-xl text-primary-deep" aria-hidden>
              <Icons.SearchIcon />
            </span>
            <span>
              <Body className="font-semibold">{t('capture.find_proof')}</Body>
              <Small className="block">{t('capture.find_proof_hint')}</Small>
            </span>
          </button>

          {/* Recent captures timeline */}
          <section className="mt-6">
            <H2 className="!text-h2">{t('capture.recent')}</H2>
            {isEmpty ? (
              <div className="mt-3 rounded-sheet border border-dashed border-line bg-card p-6 text-center">
                <Body className="font-semibold">{t('capture.empty')}</Body>
                <Small className="mt-1 block">{t('capture.empty_hint')}</Small>
              </div>
            ) : (
              <ul className="mt-3">
                {optimistic.map((item, i) => (
                  <TimelineItem
                    key={item.clientCaptureId}
                    typeLabel={t('attendance.tab_capture')}
                    typeClassName="bg-info/10 text-info border border-info/30"
                    summary={
                      <span className="flex items-center gap-2">
                        <Mono className="text-text">{item.headcount}</Mono>
                        <span>{item.note ?? t('capture.headcount_label')}</span>
                        <StatusPill
                          status={item.state === 'error' ? 'risk' : 'warn'}
                          size="sm"
                          label={t(queueLabelKey(item) as never)}
                        />
                      </span>
                    }
                    occurredOn={item.occurredOn}
                    isLast={i === optimistic.length - 1 && serverRows.length === 0}
                  />
                ))}
                {serverRows.map((ev, i) => (
                  <TimelineItem
                    key={ev.id}
                    typeLabel={t('attendance.tab_capture')}
                    typeClassName="bg-info/10 text-info border border-info/30"
                    summary={ev.summary}
                    occurredOn={ev.occurred_on}
                    confidence={ev.confidence}
                    hasEvidence={ev.proof_media_urls.length > 0}
                    isLast={i === serverRows.length - 1}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  )
}
