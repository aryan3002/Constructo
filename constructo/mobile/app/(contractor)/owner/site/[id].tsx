/**
 * Site detail (off-tab, nested under owner/). A lightweight single-site view:
 * the site header (name · type · status) and its recent events rendered as a
 * TimelineItem feed (GET /sites/{id}/events). This is the "single-site scope"
 * altitude from Owner.md §6.2 — the owner sometimes does want the activity
 * stream once they're inside one site.
 */
import { View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { owner, type SiteEvent, type SiteEventType } from '../../../../src/api/owner'
import { Body, Button, Card, H1, Screen, Small, StatusPill, TimelineItem } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, formatWhen } from '../_components'

const STR = {
  en: {
    timeline: 'Timeline',
    back: '‹ Back',
    noEvents: 'No events yet on this site. They appear here as the WhatsApp group posts.',
    errorLine: 'We could not load this site just now.',
    tryAgain: 'Try again',
    active: 'Active',
    foresight: 'Foresight',
    radar: 'Radar',
    forecastClear: 'Nothing needs ordering; cash-flow steady.',
    radarClear: 'All clear — nothing’s slipping.',
    disputePack: 'Dispute pack',
  },
  hi: {
    timeline: 'टाइमलाइन',
    back: '‹ वापस',
    noEvents: 'इस साइट पर अभी कोई घटना नहीं। WhatsApp ग्रुप के पोस्ट करते ही यहाँ दिखेंगी।',
    errorLine: 'अभी यह साइट लोड नहीं हो सकी।',
    tryAgain: 'फिर कोशिश करें',
    active: 'सक्रिय',
    foresight: 'दूरदृष्टि',
    radar: 'रडार',
    forecastClear: 'कुछ मँगाने की ज़रूरत नहीं; नकदी ठीक।',
    radarClear: 'सब ठीक — कुछ नहीं अटक रहा।',
    disputePack: 'विवाद फ़ाइल',
  },
} as const

const EVENT_LABEL: Record<SiteEventType, string> = {
  attendance: 'Attendance',
  material_delivery: 'Material',
  progress_update: 'Progress',
  issue: 'Issue',
  invoice_received: 'Invoice',
  drawing_shared: 'Drawing',
  approval: 'Approval',
  payment_request: 'Payment',
  unknown: 'Update',
}

const EVENT_TINT: Partial<Record<SiteEventType, 'risk' | 'warn' | 'info'>> = {
  issue: 'risk',
  payment_request: 'warn',
  invoice_received: 'info',
}

export default function SiteDetail() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const t = STR[lang]
  const { id } = useLocalSearchParams<{ id: string }>()
  const siteId = String(id ?? '')

  const siteQ = useQuery({ queryKey: ['owner', 'site', siteId], queryFn: () => owner.site(siteId), enabled: !!siteId })
  const eventsQ = useQuery({ queryKey: ['owner', 'site', siteId, 'events'], queryFn: () => owner.siteEvents(siteId), enabled: !!siteId })
  const forecastQ = useQuery({ queryKey: ['owner', 'site', siteId, 'forecast'], queryFn: () => owner.forecast(siteId), enabled: !!siteId })
  const radarQ = useQuery({ queryKey: ['owner', 'site', siteId, 'sentinel'], queryFn: () => owner.sentinel(siteId), enabled: !!siteId })

  if (siteQ.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingBlock />
      </Screen>
    )
  }
  if (siteQ.error || !siteQ.data) {
    return (
      <Screen>
        <Button title={t.back} variant="ghost" onPress={() => router.back()} />
        <ErrorBlock message={t.errorLine} retryLabel={t.tryAgain} onRetry={() => void siteQ.refetch()} />
      </Screen>
    )
  }

  const site = siteQ.data
  const events: SiteEvent[] = eventsQ.data?.items ?? []

  return (
    <Screen>
      <Button title={t.back} variant="ghost" onPress={() => router.back()} style={{ marginLeft: -SPACE.lg }} />
      <View style={{ gap: SPACE.sm }}>
        <H1>{site.name}</H1>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <StatusPill status={site.status === 'active' ? 'ok' : 'info'} size="sm" label={site.status || t.active} />
          <Small muted>{[site.type, site.location].filter(Boolean).join(' · ')}</Small>
        </View>
      </View>

      {/* Foresight (3.3) — reorder + cash-flow, deterministic. */}
      {forecastQ.data ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.xs }}>
            <Feather name="trending-up" size={14} color={theme.colors.accentDeep} />
            <Small muted style={{ letterSpacing: 1 }}>{t.foresight.toUpperCase()}</Small>
          </View>
          <Body style={{ color: theme.colors.text }}>
            {forecastQ.data.overdue_count > 0 || forecastQ.data.cashflow.answerable
              ? forecastQ.data.summary
              : t.forecastClear}
          </Body>
          {forecastQ.data.reorder.filter((r) => r.overdue).map((r) => (
            <View key={r.material} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.warn }} />
              <Small style={{ flex: 1, color: theme.colors.text }}>
                {`${r.material} — ${r.days_since_last}d since last (usually ~${Math.round(r.avg_interval_days)}d)`}
              </Small>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Radar (3.1) — what's slipping. */}
      {radarQ.data && radarQ.data.signals.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.xs }}>
            <Feather name="radio" size={14} color={theme.colors.accentDeep} />
            <Small muted style={{ letterSpacing: 1 }}>{t.radar.toUpperCase()}</Small>
          </View>
          {radarQ.data.signals.map((s, i) => {
            const tone =
              s.severity === 'high' ? theme.colors.risk : s.severity === 'medium' ? theme.colors.warn : theme.colors.info
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm, marginTop: i === 0 ? 0 : 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: tone }} />
                <Small style={{ flex: 1, color: theme.colors.text }}>{s.message}</Small>
              </View>
            )
          })}
        </Card>
      ) : null}

      {/* Tamper-evident dispute pack (3.6) — per-counterparty advance case. */}
      <Button
        title={t.disputePack}
        variant="secondary"
        onPress={() =>
          router.push({ pathname: '/(contractor)/owner/dispute-pack', params: { site_id: siteId } })
        }
        style={{ marginTop: SPACE.xs }}
      />

      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>{t.timeline.toUpperCase()}</Small>

      {eventsQ.isLoading ? (
        <LoadingBlock />
      ) : events.length === 0 ? (
        <Card><Body muted>{t.noEvents}</Body></Card>
      ) : (
        <Card>
          {events.map((e, i) => {
            const tintKey = EVENT_TINT[e.event_type]
            return (
              <TimelineItem
                key={e.id}
                typeLabel={EVENT_LABEL[e.event_type] ?? e.event_type}
                summary={e.summary}
                occurredOn={formatWhen(e.occurred_on)}
                tint={tintKey ? theme.colors[tintKey] : undefined}
                isLast={i === events.length - 1}
              />
            )
          })}
        </Card>
      )}
    </Screen>
  )
}
