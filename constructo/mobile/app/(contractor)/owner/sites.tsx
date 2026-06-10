/**
 * Sites (Tab 2) — the full portfolio list. Each site shows a worst-status dot,
 * its type/status meta, and a risk count derived from today's brief. Tapping a
 * row pushes the lightweight site detail (owner/site/[id]).
 */
import { useMemo } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { todayIso } from '../../../src/api/config'
import { owner, type OwnerBrief, type Site } from '../../../src/api/owner'
import { Body, EmptyState, H1, Screen } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SiteRollupRow } from './_components'

const STR = {
  en: {
    title: 'Sites',
    subtitle: (n: number) => `${n} site${n === 1 ? '' : 's'} in your portfolio`,
    risks: (n: number) => `${n} risk${n === 1 ? '' : 's'}`,
    ok: 'ok',
    empty: 'No sites yet. Add your first to start.',
    errorLine: 'We could not load your sites just now.',
    tryAgain: 'Try again',
  },
  hi: {
    title: 'साइट',
    subtitle: (n: number) => `आपके पोर्टफ़ोलियो में ${n} साइट`,
    risks: (n: number) => `${n} जोखिम`,
    ok: 'ठीक',
    empty: 'अभी कोई साइट नहीं। शुरू करने के लिए पहली जोड़ें।',
    errorLine: 'अभी आपकी साइट लोड नहीं हो सकीं।',
    tryAgain: 'फिर कोशिश करें',
  },
} as const

const ORDER: Status[] = ['ok', 'info', 'warn', 'risk']

export default function Sites() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const t = STR[lang]

  const sitesQ = useQuery({ queryKey: ['owner', 'sites'], queryFn: () => owner.sites() })
  const briefQ = useQuery<OwnerBrief | null>({
    queryKey: ['owner', 'brief', todayIso()],
    queryFn: async () => {
      const page = await owner.briefs(todayIso())
      return page.items[0] ?? null
    },
  })

  // Map site_id → worst status + risk count from the brief.
  const riskBySite = useMemo(() => {
    const map = new Map<string, { status: Status; count: number }>()
    for (const bs of briefQ.data?.payload.sites ?? []) {
      let worst: Status = 'ok'
      for (const r of bs.top_risks) {
        const s: Status = r.severity === 'high' ? 'risk' : r.severity === 'med' ? 'warn' : 'info'
        if (ORDER.indexOf(s) > ORDER.indexOf(worst)) worst = s
      }
      map.set(bs.site_id, { status: worst, count: bs.top_risks.length })
    }
    return map
  }, [briefQ.data])

  if (sitesQ.isLoading) return <Screen><H1>{t.title}</H1><LoadingBlock /></Screen>
  if (sitesQ.error) {
    return (
      <Screen>
        <H1>{t.title}</H1>
        <ErrorBlock message={t.errorLine} retryLabel={t.tryAgain} onRetry={() => void sitesQ.refetch()} />
      </Screen>
    )
  }

  const sites: Site[] = sitesQ.data?.items ?? []

  return (
    <Screen>
      <View style={{ gap: SPACE.xs }}>
        <H1>{t.title}</H1>
        <Body muted>{t.subtitle(sites.length)}</Body>
      </View>

      {sites.length === 0 ? (
        <EmptyState variant="empty" title={t.empty} />
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {[...sites]
            .sort((a, b) => (riskBySite.get(b.id)?.count ?? 0) - (riskBySite.get(a.id)?.count ?? 0))
            .map((s) => {
              const info = riskBySite.get(s.id)
              return (
                <SiteRollupRow
                  key={s.id}
                  name={s.name}
                  meta={[s.type, s.status, s.location].filter(Boolean).join(' · ')}
                  status={info?.status ?? 'ok'}
                  riskLine={info && info.count > 0 ? t.risks(info.count) : t.ok}
                  onPress={() => router.push(`/(contractor)/owner/site/${s.id}`)}
                />
              )
            })}
        </View>
      )}
    </Screen>
  )
}
