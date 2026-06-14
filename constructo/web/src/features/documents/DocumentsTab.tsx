/**
 * DocumentsTab — D6b elevation.
 *
 * Lists company documents (contracts, BOQs, NOCs, insurance, etc.) with:
 *   - Four-states: Spinner / ErrorState retry / EmptyState (with CTA) / data list.
 *   - Expiry dashboard strip (D6b): expired pill + expiring-≤30d pill + click-to-filter.
 *   - Doc-type filter: pills for present types (contract/boq/noc/insurance/license/other).
 *   - Expiry pills per row: risk / warn as before.
 *   - Site-name mapping: null site_id → "Company-wide"; else the site name.
 *   - Client-side search over title + doc_type + site.
 *   - Show-archived toggle.
 *   - Archive / Restore per row (optimistic update).
 *   - Add-document form (with drag-drop) via AddDocument component.
 */
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsApi, type CompanyDocument, type DocType } from '../../api/documents'
import { qk } from '../../api/queryKeys'
import { useSites } from '../../api/hooks'
import { useT, type TranslationKey } from '../../i18n'
import { Button, Small, StatusPill, type Status } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { AddDocument } from './AddDocument'
import { ExpiryDashboard, filterByExpiry, type ExpiryFilter } from './ExpiryDashboard'

// ---------------------------------------------------------------------------
// Expiry pill helpers (mirrors Permits.tsx daysBetween logic exactly).
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, today: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso)
  if (!m) return NaN
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

function buildExpiryHint(
  expiry_on: string | null,
  today: Date,
  t: ReturnType<typeof useT>,
): { text: string; status: Status } | null {
  if (!expiry_on) return null
  const days = daysBetween(expiry_on, today)
  if (Number.isNaN(days)) return null
  if (days < 0) {
    return { text: t('documents.expired_ago', { days: -days }), status: 'risk' }
  }
  if (days <= 30) {
    return { text: t('documents.expires_in', { days }), status: 'warn' }
  }
  return null
}

// ---------------------------------------------------------------------------
// doc_type → localized label
// ---------------------------------------------------------------------------

function docTypeKey(dt: DocType): TranslationKey {
  return `documents.doc_type.${dt}` as TranslationKey
}

// ---------------------------------------------------------------------------
// DocumentRow
// ---------------------------------------------------------------------------

interface DocumentRowProps {
  doc: CompanyDocument
  siteName: string
  canManage: boolean
  today: Date
}

function DocumentRow({ doc, siteName, canManage, today }: DocumentRowProps) {
  const t = useT()
  const qc = useQueryClient()
  const expiryHint = buildExpiryHint(doc.expiry_on, today, t)

  function handleArchive() {
    const patch = { is_active: !doc.is_active }

    // Optimistic: update both cached variants immediately.
    for (const archived of [false, true]) {
      qc.setQueryData<CompanyDocument[]>(
        qk.companyDocuments(archived),
        (prev) =>
          prev?.map((d) => (d.id === doc.id ? { ...d, ...patch } : d)) ?? prev,
      )
    }

    void documentsApi
      .update(doc.id, patch)
      .catch(() => {
        // Roll back on error.
        for (const archived of [false, true]) {
          qc.setQueryData<CompanyDocument[]>(
            qk.companyDocuments(archived),
            (prev) =>
              prev?.map((d) => (d.id === doc.id ? { ...d, is_active: doc.is_active } : d)) ?? prev,
          )
        }
      })
  }

  return (
    <li className="flex flex-col gap-1 rounded-card border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-body text-body font-semibold text-text">{doc.title}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {/* Localized doc type */}
            <Small className="font-semibold text-text">{t(docTypeKey(doc.doc_type))}</Small>

            {/* Site or company-wide */}
            <Small className="text-text-mute">{siteName}</Small>

            {/* Expiry */}
            {expiryHint ? (
              <StatusPill status={expiryHint.status} label={expiryHint.text} size="sm" />
            ) : (
              <Small className="text-text-mute">{t('documents.no_expiry')}</Small>
            )}

            {/* Archived badge */}
            {!doc.is_active && (
              <StatusPill status="info" label={t('documents.archived_badge')} size="sm" />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={doc.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-tap items-center rounded-control border border-line bg-paper px-3 font-body text-small font-semibold text-text cstk-animate hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('documents.open')}
          </a>
          {canManage && (
            <Button variant="ghost" onClick={handleArchive}>
              {doc.is_active ? t('documents.archive') : t('documents.restore')}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// DocTypeFilterBar — pill bar for filtering by document type
// ---------------------------------------------------------------------------

const ALL_DOC_TYPES: DocType[] = ['contract', 'boq', 'noc', 'insurance', 'license', 'other']

interface DocTypeFilterBarProps {
  presentTypes: DocType[]
  activeType: DocType | 'all'
  onChange: (t: DocType | 'all') => void
}

function DocTypeFilterBar({ presentTypes, activeType, onChange }: DocTypeFilterBarProps) {
  const t = useT()
  if (presentTypes.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="mb-3 flex flex-wrap gap-1"
    >
      <button
        type="button"
        aria-pressed={activeType === 'all'}
        onClick={() => onChange('all')}
        className={[
          'inline-flex min-h-tap items-center rounded-pill border px-3 py-0.5 font-body text-small font-semibold transition cstk-animate',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          activeType === 'all'
            ? 'border-primary/60 bg-primary/10 text-primary-deep'
            : 'border-line bg-paper text-text-mute hover:text-text hover:border-primary/40',
        ].join(' ')}
      >
        {t('drawings.kind.all')}
      </button>
      {presentTypes.map((dt) => (
        <button
          key={dt}
          type="button"
          aria-pressed={activeType === dt}
          onClick={() => onChange(dt)}
          className={[
            'inline-flex min-h-tap items-center rounded-pill border px-3 py-0.5 font-body text-small font-semibold transition cstk-animate',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            activeType === dt
              ? 'border-primary/60 bg-primary/10 text-primary-deep'
              : 'border-line bg-paper text-text-mute hover:text-text hover:border-primary/40',
          ].join(' ')}
        >
          {t(docTypeKey(dt))}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DocumentsTab — main export
// ---------------------------------------------------------------------------

interface DocumentsTabProps {
  canManage: boolean
}

export function DocumentsTab({ canManage }: DocumentsTabProps) {
  const t = useT()
  const qc = useQueryClient()
  const { data: sitesData } = useSites()
  const sites = sitesData?.items ?? []

  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>(null)
  const [typeFilter, setTypeFilter] = useState<DocType | 'all'>('all')

  // Fixed "today" for the entire render so pills are consistent.
  // useMemo ensures we don't recreate the Date on every render and avoids
  // midnight-straddle risk where a re-render crosses midnight.
  const today = useMemo(() => new Date(), [])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.companyDocuments(showArchived),
    queryFn: () => documentsApi.listDocuments({ includeArchived: showArchived }),
  })

  // Map site_id → name using the sites query result.
  function resolveSiteName(siteId: string | null): string {
    if (!siteId) return t('documents.company_wide')
    return sites.find((s) => s.id === siteId)?.name ?? t('documents.company_wide')
  }

  const docs = data ?? []

  // Present doc types (from unfiltered data) — used for the type filter bar.
  const presentTypes = useMemo(
    () => ALL_DOC_TYPES.filter((dt) => docs.some((d) => d.doc_type === dt)),
    [docs],
  )

  // Multi-layer filtering: expiry → type → search.
  const filtered = useMemo(() => {
    let result = filterByExpiry(docs, expiryFilter, today)
    if (typeFilter !== 'all') {
      result = result.filter((d) => d.doc_type === typeFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((d) => {
        const siteName = resolveSiteName(d.site_id).toLowerCase()
        return (
          d.title.toLowerCase().includes(q) ||
          d.doc_type.toLowerCase().includes(q) ||
          siteName.includes(q)
        )
      })
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, expiryFilter, typeFilter, search, today, sites])

  function invalidateDocs() {
    void qc.invalidateQueries({ queryKey: qk.companyDocuments() })
  }

  return (
    <div>
      {/* Search + Add */}
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="doc-search" className="sr-only">
          {t('documents.search_placeholder')}
        </label>
        <input
          id="doc-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('documents.search_placeholder')}
          className="w-full rounded-control border border-line bg-paper px-3 py-2 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {canManage && !showAddForm && (
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            {t('documents.add_document')}
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddDocument
          onDone={() => {
            setShowAddForm(false)
            invalidateDocs()
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Show-archived toggle */}
      <div className="mb-3 flex items-center gap-2">
        <label className="flex cursor-pointer select-none items-center gap-2 font-body text-small text-text-mute">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          {t('documents.show_archived')}
        </label>
      </div>

      {/* Four states */}
      {isLoading && <Spinner label={t('common.loading')} />}

      {isError && (
        <ErrorState
          message={(error as Error)?.message ?? t('common.error')}
          onRetry={() => refetch()}
          retryLabel={t('action.retry')}
        />
      )}

      {!isLoading && !isError && docs.length === 0 && (
        <EmptyState
          title={t('documents.empty.title')}
          hint={t('documents.empty.hint')}
          action={
            canManage ? (
              <Button variant="primary" onClick={() => setShowAddForm(true)}>
                {t('documents.empty.cta')}
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !isError && docs.length > 0 && (
        <>
          {/* Expiry dashboard strip */}
          <ExpiryDashboard
            docs={docs}
            today={today}
            activeFilter={expiryFilter}
            onFilterChange={setExpiryFilter}
          />

          {/* Doc-type filter bar */}
          <DocTypeFilterBar
            presentTypes={presentTypes}
            activeType={typeFilter}
            onChange={(t) => { setTypeFilter(t); setExpiryFilter(null) }}
          />

          {/* Document list */}
          <ul className="flex flex-col gap-3">
            {filtered.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                siteName={resolveSiteName(doc.site_id)}
                canManage={canManage}
                today={today}
              />
            ))}
          </ul>

          {filtered.length === 0 && (
            <p className="mt-4 font-body text-small text-text-mute">
              {t('documents.no_documents')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
