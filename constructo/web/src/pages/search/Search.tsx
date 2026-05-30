import { useState, type FormEvent } from 'react'
import {
  Body,
  Button,
  Display,
  EvidenceCard,
  Micro,
  Small,
  StatusPill,
  ThemeProvider,
  Icons,
  type EvidenceItem,
} from '../../ui'
import { useT } from '../../i18n'
import { ApiError } from '../../api/client'
import { search, type SearchHit, type SearchResponse } from '../../api/search'
import { eventTypeLabel, eventTypeStatus } from './eventType'

type Phase = 'idle' | 'loading' | 'done' | 'error'

/** Build the EvidenceCard rows from a hit's source messages (P1: every result
 *  is one tap from its proof). */
function evidenceItems(hit: SearchHit, label: string): EvidenceItem[] {
  return hit.evidence.source_message_ids.map((id) => ({
    kind: 'message',
    label,
    detail: id,
  }))
}

function ResultCard({ hit }: { hit: SearchHit }) {
  const t = useT()
  const status = eventTypeStatus(hit.event_type)
  const pct = Math.round(hit.score * 100)

  return (
    <EvidenceCard
      status={status}
      claim={hit.summary}
      detail={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-text">{hit.site_name}</span>
          <span aria-hidden>·</span>
          <span className="cstk-mono">{hit.occurred_on}</span>
        </span>
      }
      evidence={evidenceItems(hit, t('search.evidence.message'))}
      trailing={
        <div className="flex flex-col items-end gap-1.5">
          <StatusPill status={status} size="sm" label={eventTypeLabel(hit.event_type)} />
          <Micro className="cstk-mono text-text-mute" title={t('search.score', { pct })}>
            {t('search.score', { pct })}
          </Micro>
          {hit.evidence.needs_clarification ? (
            <StatusPill status="warn" size="sm" label={t('search.needsClarification')} />
          ) : null}
        </div>
      }
    />
  )
}

function UnderstoodChips({ query }: { query: SearchResponse['query'] }) {
  const t = useT()
  const chips: string[] = []
  if (query.event_type) chips.push(eventTypeLabel(query.event_type))
  if (query.date_from) chips.push(t('search.filter.from', { date: query.date_from }))
  if (query.date_to) chips.push(t('search.filter.to', { date: query.date_to }))
  if (query.site_name_hint) chips.push(t('search.filter.site', { name: query.site_name_hint }))
  if (chips.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Micro className="font-semibold uppercase tracking-wide text-text-mute">
        {t('search.understood')}
      </Micro>
      {chips.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-pill border border-line bg-paper px-2.5 py-0.5 font-body text-micro font-semibold text-text"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

export function Search() {
  const t = useT()
  const [q, setQ] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    setPhase('loading')
    setErrorMsg(null)
    try {
      const res = await search({ q: query })
      setResponse(res)
      setPhase('done')
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : t('search.error'))
      setPhase('error')
    }
  }

  const fieldClass =
    'w-full min-h-tap flex-1 rounded-control border border-line bg-paper-2 px-4 ' +
    'font-body text-body text-text placeholder:text-text-mute ' +
    'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

  const hits = response?.hits ?? []
  const resultCountLabel =
    hits.length === 1
      ? t('search.results.one')
      : t('search.results.count', { count: hits.length })

  return (
    <ThemeProvider defaultTheme="site">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header>
          <Micro className="font-semibold uppercase tracking-widest text-primary-deep">
            {t('app.name')}
          </Micro>
          <Display as="h1" className="mt-1 !text-h1">
            {t('search.title')}
          </Display>
          <Body className="mt-1 text-text-mute">{t('search.subtitle')}</Body>
        </header>

        <form onSubmit={handleSubmit} className="mt-6" role="search">
          <label htmlFor="search-q" className="sr-only">
            {t('search.input.label')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-mute"
                aria-hidden
              >
                <Icons.SearchIcon />
              </span>
              <input
                id="search-q"
                name="q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.input.placeholder')}
                className={`${fieldClass} !pl-10`}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={phase === 'loading' || !q.trim()}
            >
              {phase === 'loading' ? t('search.searching') : t('search.submit')}
            </Button>
          </div>
          {response ? <UnderstoodChips query={response.query} /> : null}
        </form>

        <section className="mt-6" aria-live="polite">
          {phase === 'idle' ? (
            <EmptyHint title={t('search.empty.title')} hint={t('search.empty.hint')} />
          ) : null}

          {phase === 'error' ? (
            <div
              role="alert"
              className="rounded-card border border-risk/30 bg-risk/10 p-4"
            >
              <Body className="font-semibold !text-risk">{t('search.error')}</Body>
              {errorMsg ? <Small className="mt-1 !text-risk">{errorMsg}</Small> : null}
            </div>
          ) : null}

          {phase === 'done' && response && !response.answerable ? (
            <NotSure
              title={t('search.notSure.title')}
              hint={t('search.notSure.hint')}
            />
          ) : null}

          {phase === 'done' && response && response.answerable ? (
            <>
              <Small className="text-text-mute" data-testid="search-result-count">
                {resultCountLabel}
              </Small>
              <ul className="mt-3 grid gap-3">
                {hits.map((hit) => (
                  <li key={hit.event_id}>
                    <ResultCard hit={hit} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </ThemeProvider>
  )
}

function EmptyHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-paper p-8 text-center">
      <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-card text-text-mute">
        <Icons.SearchIcon />
      </span>
      <Body className="font-semibold !text-text">{title}</Body>
      <Small className="mt-1">{hint}</Small>
    </div>
  )
}

function NotSure({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      role="status"
      data-testid="search-not-sure"
      className="rounded-card border border-warn/30 bg-warn/10 p-6 text-center"
    >
      <span
        className="mx-auto mb-2 grid h-10 w-10 place-items-center text-warn"
        aria-hidden
      >
        <Icons.WarnTriangleIcon />
      </span>
      <Body className="font-semibold !text-text">{title}</Body>
      <Small className="mt-1">{hint}</Small>
    </div>
  )
}
