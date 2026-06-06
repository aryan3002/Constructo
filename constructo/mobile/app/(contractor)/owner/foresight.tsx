/**
 * Foresight (off-tab, owner) — the portfolio command view (Phase 3.4). One
 * deterministic rollup across all the owner's sites: worker-days, spend,
 * deliveries, open disputes (exact-math GROUP BY, never an LLM guess). Each site
 * row taps through to its single-site detail (where per-site forecast + radar
 * live). Reached from More.
 */
import { Pressable, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { owner, type SiteRollup } from '../../../src/api/owner'
import { Body, BodyStrong, Card, H1, Mono, Screen, Small, StatusPill } from '../../../src/ui'
import { ErrorBlock, LoadingBlock } from './_components'

const STR = {
  en: {
    title: 'Foresight',
    sub: 'Your whole book, at a glance',
    workerDays: 'Worker-days',
    spend: 'Billed / paid',
    deliveries: 'Deliveries',
    disputes: 'Open disputes',
    empty: 'No sites in view yet.',
    err: 'Could not load your portfolio.',
    tryAgain: 'Try again',
    days: 'last 30 days',
  },
  hi: {
    title: 'दूरदृष्टि',
    sub: 'आपकी सारी साइटें, एक नज़र में',
    workerDays: 'मज़दूर-दिन',
    spend: 'बिल / भुगतान',
    deliveries: 'डिलीवरी',
    disputes: 'खुले विवाद',
    empty: 'अभी कोई साइट नहीं।',
    err: 'पोर्टफोलियो लोड नहीं हुआ।',
    tryAgain: 'फिर कोशिश करें',
    days: 'पिछले 30 दिन',
  },
} as const

/** Indian-grouped rupee (no Hermes Intl reliance). */
function inr(value: number | null): string {
  if (value == null) return '—'
  const s = Math.abs(Math.round(value)).toString()
  let grouped = s
  if (s.length > 3) {
    const last3 = s.slice(-3)
    let rest = s.slice(0, -3)
    const parts: string[] = []
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2))
      rest = rest.slice(0, -2)
    }
    if (rest) parts.unshift(rest)
    grouped = `${parts.join(',')},${last3}`
  }
  return `₹${grouped}`
}

export default function Foresight() {
  const { lang } = useT()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()

  const q = useQuery({ queryKey: ['owner', 'portfolio'], queryFn: () => owner.portfolio(30) })

  const stat = (label: string, value: string, tone?: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Mono style={{ fontSize: 20, color: tone ?? c.text }}>{value}</Mono>
      <Small muted>{label}</Small>
    </View>
  )

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <H1>{t.title}</H1>
      <Small muted style={{ marginTop: -SPACE.xs, marginBottom: SPACE.sm }}>{t.sub}</Small>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock message={t.err} retryLabel={t.tryAgain} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.site_count === 0 ? (
        <Card>
          <Body muted>{t.empty}</Body>
        </Card>
      ) : (
        <>
          {/* Portfolio totals */}
          <Card>
            <Small muted style={{ letterSpacing: 1 }}>
              {`${q.data.site_count} SITES · ${t.days.toUpperCase()}`}
            </Small>
            <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.sm }}>
              {stat(t.workerDays, q.data.totals.worker_days != null ? String(q.data.totals.worker_days) : '—')}
              {stat(t.spend, inr(q.data.totals.amount_total))}
            </View>
            <View style={{ flexDirection: 'row', marginTop: SPACE.md, gap: SPACE.sm }}>
              {stat(t.deliveries, String(q.data.totals.deliveries))}
              {stat(
                t.disputes,
                String(q.data.totals.open_disputes),
                q.data.totals.open_disputes > 0 ? c.risk : undefined,
              )}
            </View>
          </Card>

          {/* Per-site rows */}
          {q.data.sites.map((s: SiteRollup) => (
            <Pressable
              key={s.site_id}
              accessibilityRole="button"
              accessibilityLabel={s.site_name}
              onPress={() => router.push(`/(contractor)/owner/site/${s.site_id}`)}
            >
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <BodyStrong style={{ flex: 1 }}>{s.site_name}</BodyStrong>
                  {s.open_disputes > 0 ? (
                    <StatusPill status="risk" label={`${s.open_disputes}`} size="sm" />
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', marginTop: SPACE.sm, gap: SPACE.md, flexWrap: 'wrap' }}>
                  <Mono muted style={{ fontSize: 13 }}>
                    {s.worker_days != null ? `${s.worker_days} ${t.workerDays.toLowerCase()}` : '—'}
                  </Mono>
                  <Mono muted style={{ fontSize: 13 }}>{inr(s.amount_total)}</Mono>
                  <Mono muted style={{ fontSize: 13 }}>{`${s.deliveries} ${t.deliveries.toLowerCase()}`}</Mono>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  )
}
