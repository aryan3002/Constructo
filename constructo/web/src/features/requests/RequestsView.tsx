import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../ui/AppShell'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { useT, type TranslationKey } from '../../i18n'
import { qk } from '../../api/queryKeys'
import { requestsApi, type RequestOut } from '../../api/requests'
import { Body, H1, H2, Small, StatusPill } from '../../ui'

const STATUS_LABEL_KEY: Record<RequestOut['status'], TranslationKey> = {
  sent: 'requests.status.sent',
  seen: 'requests.status.seen',
  in_progress: 'requests.status.in_progress',
  done: 'requests.status.done',
}

const STATUS_PILL: Record<RequestOut['status'], 'info' | 'ok' | 'warn'> = {
  sent: 'info', seen: 'info', in_progress: 'warn', done: 'ok',
}

interface Grouped {
  overdue: RequestOut[]
  open: RequestOut[]
  resolved: RequestOut[]
}

/**
 * Grouping rule (grounded in the real status enum + sla_due_at):
 *   overdue  = status ∈ {sent,seen,in_progress} AND sla_due_at non-null AND sla_due_at < now
 *   open     = status ∈ {sent,seen,in_progress} AND NOT overdue
 *   resolved = status === 'done'
 */
function groupRequests(rows: RequestOut[], now: number): Grouped {
  const g: Grouped = { overdue: [], open: [], resolved: [] }
  for (const r of rows) {
    if (r.status === 'done') {
      g.resolved.push(r)
    } else if (r.sla_due_at && new Date(r.sla_due_at).getTime() < now) {
      g.overdue.push(r)
    } else {
      g.open.push(r)
    }
  }
  return g
}

function RequestRow({
  r, onReply, t,
}: {
  r: RequestOut
  onReply: (() => void) | null
  t: ReturnType<typeof useT>
}) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-paper px-3 py-3">
      <div className="min-w-0 flex-1">
        <Body as="span" className="block font-semibold !text-text">{r.title}</Body>
        {r.detail ? <Small className="mt-0.5 block">{r.detail}</Small> : null}
        <Small className="mt-1 block !text-text-mute">
          {r.sla_due_at
            ? t('requests.overdue_since', { when: new Date(r.sla_due_at).toLocaleDateString() })
            : t('requests.raised', { when: new Date(r.created_at).toLocaleDateString() })}
        </Small>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusPill status={STATUS_PILL[r.status]} size="sm" label={t(STATUS_LABEL_KEY[r.status])} />
        {onReply ? (
          <button
            type="button"
            onClick={onReply}
            className="inline-flex min-h-tap items-center rounded-control border border-line bg-card px-3 font-body text-small font-semibold text-text cstk-animate hover:bg-surface-hover"
          >
            {t('requests.reply')}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Group({
  titleKey, rows, replyable, onReply, t,
}: {
  titleKey: TranslationKey
  rows: RequestOut[]
  replyable: boolean
  onReply: () => void
  t: ReturnType<typeof useT>
}) {
  if (rows.length === 0) return null
  return (
    <section className="mt-6 first:mt-0">
      <H2>{t(titleKey)}</H2>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <RequestRow key={r.id} r={r} t={t} onReply={replyable ? onReply : null} />
        ))}
      </ul>
    </section>
  )
}

/**
 * RequestsView — the owner's "what did homeowners ask for" surface. Lists real
 * homeowner_requests (E1's requestsApi.list) grouped overdue / open / resolved;
 * each open row offers a Reply that drops the owner into the chat inbox (the
 * honest deep-link today — ChatPage has no site-thread URL param yet). Four
 * honest states: loading / error+retry / empty / populated.
 */
export function RequestsView() {
  const t = useT()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: qk.requests(), queryFn: () => requestsApi.list() })

  const grouped = useMemo(
    () => (query.data ? groupRequests(query.data, Date.now()) : null),
    [query.data],
  )

  const openReply = () => navigate('/chat')

  let body: React.ReactNode
  if (query.isLoading) {
    body = <Spinner />
  } else if (query.isError) {
    body = <ErrorState message={t('requests.error')} onRetry={() => query.refetch()} />
  } else if (!grouped || (query.data && query.data.length === 0)) {
    body = <EmptyState title={t('requests.empty.title')} hint={t('requests.empty.hint')} />
  } else {
    body = (
      <>
        <Group titleKey="requests.group.overdue" rows={grouped.overdue} replyable onReply={openReply} t={t} />
        <Group titleKey="requests.group.open" rows={grouped.open} replyable onReply={openReply} t={t} />
        <Group titleKey="requests.group.resolved" rows={grouped.resolved} replyable={false} onReply={openReply} t={t} />
      </>
    )
  }

  return (
    <AppShell role="owner">
      <H1 className="mb-4">{t('requests.title')}</H1>
      {body}
    </AppShell>
  )
}
