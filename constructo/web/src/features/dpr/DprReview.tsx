// DPR review (W3.5) — the PM reviews the AI-drafted Daily Progress Report and
// SHARES it with an explicit click. CA1 invariant: the AI proposes, the human
// commits — there is NO auto-send path here; `dprApi.send` (draft→sent) only
// fires from the Share button. Honest-AI: the ConfidenceMeter surfaces how sure
// the draft is, and a low band demands a tap-to-confirm before sharing.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dprApi, type Dpr, type DprSections } from '../../api/dpr'
import { ApiError } from '../../api/client'
import { useT } from '../../i18n'
import { formatDate, formatDateTime } from '../../lib/format'
import {
  Button,
  ConfidenceMeter,
  H2,
  Small,
  StatusPill,
  bandFor,
} from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'

const DPR_KEY = (siteId: string) => ['dpr', siteId] as const

function summaryOf(d: Dpr): string {
  const s = d.sections?.summary
  return typeof s === 'string' ? s : ''
}

/** Pull an honest confidence out of the draft if the backend supplied one. */
function confidenceOf(d: Dpr): number | null {
  const c = (d.sections as Record<string, unknown>)?.confidence
  return typeof c === 'number' ? c : null
}

/** Render the non-summary sections as readable lines (rows carry `summary`). */
function sectionLines(sections: DprSections): { key: string; lines: string[] }[] {
  const order = ['labour', 'materials', 'work_done', 'blockers', 'next']
  const out: { key: string; lines: string[] }[] = []
  for (const key of order) {
    const v = sections[key]
    const lines: string[] = []
    const eat = (x: unknown) => {
      if (typeof x === 'string') lines.push(x)
      else if (x && typeof x === 'object' && 'summary' in (x as object))
        lines.push(String((x as { summary: unknown }).summary))
    }
    if (Array.isArray(v)) v.forEach(eat)
    else if (v && typeof v === 'object') {
      for (const val of Object.values(v as object)) {
        if (Array.isArray(val)) val.forEach(eat)
      }
    }
    if (lines.length) out.push({ key, lines })
  }
  return out
}

export function DprReview({ siteId }: { siteId: string }) {
  const t = useT()
  const qc = useQueryClient()
  const [draftSummary, setDraftSummary] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const q = useQuery({
    queryKey: DPR_KEY(siteId),
    queryFn: () => dprApi.get(siteId),
    retry: false,
  })
  const dpr = q.data

  useEffect(() => {
    if (dpr) setDraftSummary(summaryOf(dpr))
  }, [dpr])

  const generate = useMutation({
    mutationFn: () => dprApi.draft(siteId),
    onSuccess: (d) => qc.setQueryData(DPR_KEY(siteId), d),
  })
  const saveEdits = useMutation({
    mutationFn: (sections: DprSections) => dprApi.edit(dpr!.id, sections),
    onSuccess: (d) => {
      qc.setQueryData(DPR_KEY(siteId), d)
      setToast(t('dpr.saved'))
    },
  })
  const share = useMutation({
    mutationFn: () => dprApi.send(dpr!.id),
    onSuccess: (d) => {
      qc.setQueryData(DPR_KEY(siteId), d)
      setToast(t('dpr.shared'))
    },
  })

  // 404 = no draft yet → offer to generate one.
  if (q.isLoading) return <Spinner label={t('common.loading')} />
  if (q.isError && (q.error as ApiError)?.status === 404) {
    return (
      <EmptyState
        title={t('dpr.none_title')}
        hint={t('dpr.none_hint')}
        action={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? t('dpr.generating') : t('dpr.generate')}
          </Button>
        }
      />
    )
  }
  if (q.isError)
    return <ErrorState message={t('common.error')} onRetry={() => q.refetch()} />
  if (!dpr) return null

  const sent = dpr.status === 'sent'
  const confidence = confidenceOf(dpr)
  const lowBand = confidence != null && bandFor(confidence) === 'confirm'
  const canShare = !sent && (!lowBand || confirmed)
  const summaryDirty = draftSummary !== summaryOf(dpr)

  return (
    <section
      aria-labelledby="dpr-heading"
      className="rounded-sheet border border-line bg-card p-5 shadow-card"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <H2 id="dpr-heading">{t('dpr.title')}</H2>
          <Small className="!text-text-mute">{formatDate(dpr.report_date)}</Small>
        </div>
        {sent ? (
          <StatusPill status="ok" label={t('dpr.sent_at', { when: formatDateTime(dpr.sent_at!) })} />
        ) : (
          <StatusPill status="warn" label={t('dpr.status_draft')} />
        )}
      </header>

      {/* Honest-AI confidence (when the backend scores the draft). */}
      {confidence != null ? (
        <div className="mb-4">
          <ConfidenceMeter
            confidence={confidence}
            labels={{
              high: t('dpr.conf_high'),
              review: t('dpr.conf_review'),
              confirm: t('dpr.conf_confirm'),
            }}
            onConfirm={() => setConfirmed(true)}
            confirmLabel={t('dpr.conf_confirm_cta')}
          />
        </div>
      ) : (
        <Small className="mb-4 block !text-text-mute">{t('dpr.ai_draft_note')}</Small>
      )}

      {/* Editable summary (the headline the PM reviews + tweaks). */}
      <label className="block">
        <Small className="mb-1 block font-semibold !text-text">{t('dpr.summary')}</Small>
        <textarea
          value={draftSummary}
          onChange={(e) => setDraftSummary(e.target.value)}
          disabled={sent}
          rows={3}
          className="w-full rounded-control border border-line bg-paper px-3 py-2 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
        />
      </label>
      {!sent && summaryDirty ? (
        <Button
          variant="secondary"
          size="md"
          className="mt-2"
          disabled={saveEdits.isPending}
          onClick={() => saveEdits.mutate({ ...dpr.sections, summary: draftSummary })}
        >
          {saveEdits.isPending ? t('dpr.saving') : t('dpr.save_edits')}
        </Button>
      ) : null}

      {/* Read-only section breakdown (evidence-backed). */}
      <dl className="mt-4 space-y-2">
        {sectionLines(dpr.sections).map((s) => (
          <div key={s.key}>
            <dt>
              <Small className="font-semibold uppercase tracking-wide !text-text-mute">
                {t(`dpr.section.${s.key}` as never)}
              </Small>
            </dt>
            <dd>
              <ul className="ml-4 list-disc font-body text-small text-text">
                {s.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>

      <Small className="mt-4 block !text-text-mute">
        {t('dpr.evidence', { n: dpr.evidence_event_ids.length })}
      </Small>

      {/* The human commit — the ONLY share path (never auto-sent). */}
      <footer className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {sent ? (
          <Small className="!text-ok font-semibold">{t('dpr.shared_done')}</Small>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={!canShare || share.isPending}
              onClick={() => share.mutate()}
            >
              {share.isPending ? t('dpr.sharing') : t('dpr.share')}
            </Button>
            <Small className="!text-text-mute">{t('dpr.share_note')}</Small>
          </>
        )}
        {toast ? (
          <Small role="status" className="ml-auto !text-ok font-semibold">
            {toast}
          </Small>
        ) : null}
      </footer>
    </section>
  )
}
