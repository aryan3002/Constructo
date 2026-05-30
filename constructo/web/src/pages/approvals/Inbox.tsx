import { useMemo, useState } from 'react'
import { Button, Display, Small, ThemeSurface } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import type { DecisionState } from '../../api/approvals'
import { ApprovalRow } from './ApprovalRow'
import { useApprovals, useApprovalAction, useBatchAction } from './hooks'

type Tab = 'open' | 'escalated' | 'resolved'

const TAB_FILTER: Record<Tab, DecisionState | undefined> = {
  open: 'pending',
  escalated: 'escalated',
  resolved: 'resolved',
}

const TAB_KEY: Record<Tab, TranslationKey> = {
  open: 'approvals.tab.open',
  escalated: 'approvals.tab.escalated',
  resolved: 'approvals.tab.resolved',
}

/**
 * Approval Inbox — exceptions-first (the ≤ handful of decisions needing the
 * user), never an activity log. "All clear" is a positive empty state. Inline
 * Approve/Reject per row plus a batch bar when rows are multi-selected.
 *
 * Rendered inside the Site "Blueprint" theme surface so it stays on-brand
 * (warm paper, amber primary) regardless of the surrounding chrome.
 */
export function ApprovalInbox() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('open')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const query = useApprovals(TAB_FILTER[tab])
  const action = useApprovalAction()
  const batch = useBatchAction()

  const decisions = useMemo(() => query.data?.items ?? [], [query.data])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const busy = action.isPending || batch.isPending

  function runBatch(batchAction: 'resolve' | 'reject') {
    const ids = [...selected]
    if (ids.length === 0) return
    batch.mutate(
      { action: batchAction, ids },
      { onSuccess: () => clearSelection() },
    )
  }

  const tabs: Tab[] = ['open', 'escalated', 'resolved']

  return (
    <ThemeSurface theme="site" className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-4">
          <Display as="h1">{t('approvals.title')}</Display>
          <Small className="mt-1">{t('approvals.subtitle')}</Small>
        </header>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t('approvals.title')}
          className="mb-5 flex gap-1 rounded-control border border-line bg-card p-1"
        >
          {tabs.map((tk) => {
            const active = tab === tk
            return (
              <button
                key={tk}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(tk)
                  clearSelection()
                }}
                className={`min-h-tap flex-1 rounded-control px-3 text-small font-semibold transition cstk-animate ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'text-text-mute hover:bg-line/40'
                }`}
              >
                {t(TAB_KEY[tk])}
              </button>
            )
          })}
        </div>

        {/* Batch action bar */}
        {selected.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-control border border-line bg-card p-3">
            <Small className="!text-text font-semibold">
              {t('approvals.batch.selected', { count: selected.size })}
            </Small>
            <div className="ml-auto flex gap-2">
              <Button
                size="md"
                variant="primary"
                disabled={busy}
                onClick={() => runBatch('resolve')}
              >
                {t('approvals.batch.approve_all')}
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={busy}
                onClick={() => runBatch('reject')}
              >
                {t('approvals.batch.reject_all')}
              </Button>
              <Button size="md" variant="ghost" onClick={clearSelection}>
                {t('approvals.batch.clear')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Body */}
        {query.isLoading ? <Spinner label={t('common.loading')} /> : null}
        {query.isError ? (
          <ErrorState
            message={(query.error as Error)?.message ?? t('common.error')}
            onRetry={() => query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && decisions.length === 0 ? (
          <EmptyState
            title={t('approvals.empty.title')}
            hint={t('approvals.empty.hint')}
          />
        ) : null}
        {!query.isLoading && !query.isError && decisions.length > 0 ? (
          <ul className="space-y-4">
            {decisions.map((d) => (
              <ApprovalRow
                key={d.id}
                decision={d}
                selected={selected.has(d.id)}
                onToggleSelect={toggleSelect}
                busy={busy}
                onApprove={(id) => action.mutate({ id, action: 'approve' })}
                onReject={(id) => action.mutate({ id, action: 'reject' })}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </ThemeSurface>
  )
}
