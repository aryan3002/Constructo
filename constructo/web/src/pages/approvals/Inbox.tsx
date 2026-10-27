import { useMemo, useState } from 'react'
import { Button, Display, Small, StatusPill, ThemeSurface } from '../../ui'
import { EmptyState, ErrorState, Spinner } from '../../components/states'
import { useCan, useMeRole } from '../../auth/useCan'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import type { DecisionState } from '../../api/approvals'
import { ApiError } from '../../api/client'
import { ApprovalRow, MONEY_KINDS } from './ApprovalRow'
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
  const canApproveMoney = useCan('approve_money')
  // Owners and PMs settle decisions (the server's deciders); a PM's batch
  // skips the money items, which the note below says before they press it.
  const role = useMeRole()
  const canDecide = role === 'owner' || role === 'pm'
  const [tab, setTab] = useState<Tab>('open')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)

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

  // A refusal for a money decision (403 owner_only, e.g. from a stale screen)
  // says who can decide it, never a generic error.
  function showError(err: unknown) {
    const ownerOnly = err instanceof ApiError && err.code === 'owner_only'
    setToast({ text: t(ownerOnly ? 'approvals.owner_only' : 'common.error'), error: true })
  }

  function runAction(id: string, which: 'approve' | 'reject') {
    setToast(null)
    action.mutate({ id, action: which }, { onError: showError })
  }

  // Money items a non-owner selected: the server skips them, so say so first.
  const moneySelected = decisions.filter(
    (d) => selected.has(d.id) && MONEY_KINDS.has(d.kind),
  ).length

  function runBatch(batchAction: 'resolve' | 'reject') {
    const ids = [...selected]
    if (ids.length === 0) return
    setToast(null)
    batch.mutate(
      { action: batchAction, ids },
      {
        onSuccess: (res) => {
          clearSelection()
          if (res.skipped.length > 0) {
            setToast({
              text: t('approvals.batch.result', {
                updated: res.updated.length,
                skipped: res.skipped.length,
              }),
            })
          }
        },
        onError: showError,
      },
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

        {toast ? (
          <p className="mb-4" role={toast.error ? 'alert' : 'status'}>
            <StatusPill status={toast.error ? 'risk' : 'info'} label={toast.text} />
          </p>
        ) : null}

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
              {/* WC4: money items in a PM's selection are skipped (owner only). */}
              {canDecide ? (
                <Button
                  size="md"
                  variant="primary"
                  disabled={busy}
                  onClick={() => runBatch('resolve')}
                >
                  {t('approvals.batch.approve_all')}
                </Button>
              ) : null}
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
            {!canApproveMoney && moneySelected > 0 ? (
              <Small className="w-full" data-testid="money-skipped-note">
                {t('approvals.batch.money_skipped', { count: moneySelected })}
              </Small>
            ) : null}
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
                canApproveMoney={canApproveMoney}
                onApprove={(id) => runAction(id, 'approve')}
                onReject={(id) => runAction(id, 'reject')}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </ThemeSurface>
  )
}
