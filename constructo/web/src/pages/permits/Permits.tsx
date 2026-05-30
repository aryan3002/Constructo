import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { permitsApi, type Permit, type PermitStatus } from '../../api/permits'
import { useT, type TranslationKey } from '../../i18n'
import {
  Body,
  EvidenceCard,
  H1,
  Mono,
  Small,
  StatusPill,
  ThemeSurface,
  type EvidenceItem,
  type Status,
} from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { formatDate } from '../../lib/format'

const STATUS_TO_SPINE: Record<PermitStatus, Status> = {
  not_started: 'info',
  applied: 'info',
  under_review: 'warn',
  approved: 'ok',
  rejected: 'risk',
  expired: 'risk',
}

const STATUS_KEY: Record<PermitStatus, TranslationKey> = {
  not_started: 'permits.status.not_started',
  applied: 'permits.status.applied',
  under_review: 'permits.status.under_review',
  approved: 'permits.status.approved',
  rejected: 'permits.status.rejected',
  expired: 'permits.status.expired',
}

/**
 * Permits — the "are we legal to build?" view. When a ``siteId`` route param is
 * present it renders that site's checklist (ordered by type); otherwise it lists
 * every visible permit. Each permit is an EvidenceCard whose proof reveal shows
 * the authority, reference, and key lifecycle dates. Site theme.
 */
export function Permits() {
  const t = useT()
  const { siteId } = useParams()

  const query = useQuery({
    queryKey: ['permits', siteId ?? 'all'],
    queryFn: () =>
      siteId ? permitsApi.checklist(siteId) : permitsApi.list(),
  })

  return (
    <ThemeSurface theme="site" className="-mx-4 -my-6 min-h-[60vh] bg-bg px-4 py-6">
      <header className="mb-5">
        <H1>{siteId ? t('permits.checklist') : t('permits.title')}</H1>
        <Small className="mt-1">{t('permits.subtitle')}</Small>
      </header>

      {query.isLoading && <Spinner label={t('common.loading')} />}
      {query.isError && (
        <ErrorState
          message={(query.error as Error)?.message ?? t('common.error')}
          onRetry={() => query.refetch()}
        />
      )}

      {query.data &&
        (query.data.items.length === 0 ? (
          <EmptyState title={t('permits.empty')} hint={t('permits.empty_hint')} />
        ) : (
          <ul className="grid gap-3">
            {query.data.items.map((p) => (
              <li key={p.id}>
                <PermitRow permit={p} today={new Date()} />
              </li>
            ))}
          </ul>
        ))}
    </ThemeSurface>
  )
}

function daysBetween(fromIso: string, today: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso)
  if (!m) return NaN
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

function PermitRow({ permit, today }: { permit: Permit; today: Date }) {
  const t = useT()
  const status = STATUS_TO_SPINE[permit.status]

  const evidence: EvidenceItem[] = [
    {
      kind: 'challan',
      label: `${t('permits.authority')}: ${permit.authority}`,
      detail: permit.reference_no
        ? `${t('permits.reference')}: ${permit.reference_no}`
        : undefined,
    },
  ]
  const dates: string[] = []
  if (permit.applied_on) dates.push(`${t('permits.applied_on')}: ${formatDate(permit.applied_on)}`)
  if (permit.expected_on) dates.push(`${t('permits.expected_on')}: ${formatDate(permit.expected_on)}`)
  if (permit.decided_on) dates.push(`${t('permits.decided_on')}: ${formatDate(permit.decided_on)}`)
  if (permit.expiry_on) dates.push(`${t('permits.expiry_on')}: ${formatDate(permit.expiry_on)}`)
  evidence.push({
    kind: 'message',
    label: dates.length ? dates.join('  ·  ') : t('permits.no_dates'),
  })
  if (permit.notes) evidence.push({ kind: 'message', label: permit.notes })

  // Live expiry hint (warn/risk) shown inline on approved permits.
  let expiryHint: { text: string; status: Status } | null = null
  if (permit.expiry_on && permit.status === 'approved') {
    const days = daysBetween(permit.expiry_on, today)
    if (!Number.isNaN(days)) {
      if (days < 0) {
        expiryHint = { text: t('permits.expired_ago', { days: -days }), status: 'risk' }
      } else if (days <= 30) {
        expiryHint = { text: t('permits.expires_in', { days }), status: 'warn' }
      }
    }
  }

  return (
    <EvidenceCard
      status={status}
      claim={
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate">{permit.permit_type}</span>
          {permit.reference_no ? (
            <Mono className="shrink-0 text-small text-text-mute">{permit.reference_no}</Mono>
          ) : null}
        </span>
      }
      detail={
        <span className="flex flex-wrap items-center gap-2">
          <Body as="span" className="!text-small !text-text-mute">
            {permit.authority}
          </Body>
          {expiryHint ? (
            <StatusPill status={expiryHint.status} label={expiryHint.text} size="sm" />
          ) : null}
        </span>
      }
      evidence={evidence}
      trailing={
        <StatusPill status={status} label={t(STATUS_KEY[permit.status])} size="sm" />
      }
    />
  )
}
