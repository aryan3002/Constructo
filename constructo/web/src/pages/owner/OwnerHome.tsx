import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { todayIso } from '../../api/config'
import { qk } from '../../api/queryKeys'
import { dashboardApi, type OwnerHome as OwnerHomeData } from '../../api/dashboard'
import { useT } from '../../i18n'
import { formatDate } from '../../lib/format'
import { ErrorState, Spinner } from '../../components/states'
import { SetupChecklist } from './SetupChecklist'
import { CommandCenter } from '../../features/owner/CommandCenter'
import {
  AppShell,
  Display,
  Mono,
  Small,
  type SiteSummary,
  type Status,
} from '../../ui'
import { useSkin } from '../../ui/ThemeModeProvider'

/**
 * OwnerHome — the Owner Command Center shell (W1). A cold start routes to the
 * setup checklist (never a blank grid); otherwise the brief explodes into the
 * 3-column CommandCenter (Needs You · Portfolio · This Week). This page stays
 * thin: it owns the home query (`qk.home`), the AppShell chrome, and the site
 * selection that the columns share — the columns own their own behavior.
 */
function useOwnerHome(date: string) {
  return useQuery({
    queryKey: qk.home(date),
    queryFn: () => dashboardApi.getHome(date),
  })
}

export function OwnerHome() {
  const t = useT()
  const date = todayIso()
  const { data: home, isLoading, isError, error, refetch } = useOwnerHome(date)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const neev = useSkin() === 'neev'

  const sites = home?.sites ?? []
  const siteSummaries = useMemo<SiteSummary[]>(
    () =>
      sites.map((s) => ({
        id: s.site_id,
        name: s.name,
        status: s.status as Status,
        meta:
          s.top_risks.length > 0
            ? `${s.top_risks.length + s.risk_overflow} risk${
                s.top_risks.length + s.risk_overflow === 1 ? '' : 's'
              }`
            : undefined,
      })),
    [sites],
  )

  const headline = renderHeadline(home, t)

  return (
    <AppShell
      role="owner"
      sites={siteSummaries}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      roleBadge={{ name: 'Owner', initials: 'OW' }}
    >
      {neev ? (
        // Neev: editorial hero — clay eyebrow + a larger Eczar serif headline.
        <header>
          <p className="font-body text-micro font-semibold uppercase tracking-[0.14em] text-[var(--celebrate-text)]">
            {t('owner.home.title')} · {formatDate(date)}
          </p>
          <Display className="mt-2 !text-[2.1rem] !leading-[1.1]">{headline}</Display>
        </header>
      ) : (
        <header>
          <Small className="!text-text-mute">{t('owner.home.title')}</Small>
          <Display className="mt-1">{headline}</Display>
          <Mono className="mt-1 block text-small text-text-mute">{formatDate(date)}</Mono>
        </header>
      )}

      <div className="mt-6">
        {isLoading && <Spinner label={t('owner.home.loading')} />}

        {isError && (
          <ErrorState
            message={(error as Error)?.message ?? t('owner.home.error')}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && home && (
          <>
            {home.cold_start ? (
              <SetupChecklist steps={home.setup_checklist} />
            ) : (
              <CommandCenter
                home={home}
                date={date}
                selectedSiteId={selectedSiteId}
                onSelectSite={setSelectedSiteId}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function renderHeadline(home: OwnerHomeData | undefined, t: ReturnType<typeof useT>) {
  if (!home || home.needs_attention_count === 0) return t('owner.home.all_calm')
  const key =
    home.needs_attention_count === 1
      ? 'owner.home.needs_you_one'
      : 'owner.home.needs_you_many'
  return t(key, {
    count: home.needs_attention_count,
    sites: home.sites_total,
  })
}
