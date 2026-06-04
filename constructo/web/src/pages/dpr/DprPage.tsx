import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSites } from '../../api/hooks'
import { authApi, type Role } from '../../api/auth'
import { DprReview } from '../../features/dpr/DprReview'
import { EmptyState } from '../../components/states'
import { AppShell, H1, Small, useRoleTabs, type Role as ShellRole } from '../../ui'
import { useT } from '../../i18n'

/**
 * DPR page — the PM reviews and shares the AI-drafted Daily Progress Report for
 * a site. The report is proposed by the AI but only shared on an explicit human
 * click (CA1); see `DprReview`.
 */
export function DprPage() {
  const t = useT()
  const sites = useSites()
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => authApi.me(), retry: false })
  const role: Role = me.data?.role === 'owner' ? 'owner' : 'pm'
  const tabs = useRoleTabs(role as ShellRole)

  const siteOptions = sites.data?.items ?? []
  const [siteId, setSiteId] = useState<string | null>(null)
  const effectiveSiteId = siteId ?? siteOptions[0]?.id ?? null

  return (
    <AppShell role={role as ShellRole} tabs={tabs}>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <H1>{t('dpr.title')}</H1>
            <Small>{t('dpr.share_note')}</Small>
          </div>
          {siteOptions.length > 0 ? (
            <label className="flex items-center gap-2">
              <Small className="font-semibold !text-text">{t('nav.sites')}</Small>
              <select
                value={effectiveSiteId ?? ''}
                onChange={(e) => setSiteId(e.target.value)}
                className="min-h-tap rounded-control border border-line bg-card px-3 font-body text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {siteOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </header>

        {effectiveSiteId ? (
          <DprReview key={effectiveSiteId} siteId={effectiveSiteId} />
        ) : (
          <EmptyState title={t('reconcile.pick_site')} hint={t('reconcile.pick_site_hint')} />
        )}
      </div>
    </AppShell>
  )
}
