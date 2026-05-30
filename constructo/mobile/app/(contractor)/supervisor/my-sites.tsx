/**
 * My Sites (`/sites`) — the supervisor's ASSIGNED site(s) and per-site context.
 *
 * Assigned-site chips (GET /api/v1/sites — scope is server-enforced, returns
 * only assigned sites; no "All Sites" switcher). Tap a site → its recent events
 * (GET /api/v1/sites/{id}/events) as a TimelineItem feed, plus a read-only
 * Drawings section.
 *
 * DRAWINGS GAP: there is no drawings endpoint on the backend yet. We show a
 * calm read-only placeholder (the role only ever READS drawings — no markup)
 * and NOTE the gap; it slots in at GET /api/v1/sites/{id}/drawings later.
 */
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import {
  Body,
  BodyStrong,
  Card,
  Display,
  H2,
  Mono,
  Screen,
  Small,
  StatusDot,
  TimelineItem,
} from '../../../src/ui'
import { STATUS, type Status } from '../../../src/theme/tokens'
import {
  supervisorApi,
  type Site,
  type SiteEvent,
  type SiteEventType,
} from '../../../src/api/supervisor'
import { CalmEmpty, ErrorState, Loading, SPACE } from './_components'
import type { Paginated } from '../../../src/api/types'

const STR = {
  en: {
    title: 'My Sites',
    retry: 'Try again',
    errSites: 'Could not load your sites.',
    errEvents: 'Could not load recent activity.',
    emptySitesTitle: 'No site assigned yet',
    emptySitesBody: 'Ask your PM — assigned sites show up here.',
    recent: 'RECENT ACTIVITY',
    emptyEvents: 'Nothing logged here yet.',
    drawings: 'DRAWINGS',
    drawingsPlaceholder: 'Drawing lookup is coming.',
    drawingsBody: 'Ask your PM to share a drawing — it’ll be findable here, read-only.',
  },
  hi: {
    title: 'मेरी साइट',
    retry: 'फिर कोशिश करें',
    errSites: 'आपकी साइट लोड नहीं हो सकीं।',
    errEvents: 'हाल की गतिविधि लोड नहीं हुई।',
    emptySitesTitle: 'अभी कोई साइट असाइन नहीं',
    emptySitesBody: 'PM से पूछो — असाइन साइट यहाँ दिखेंगी।',
    recent: 'हाल की गतिविधि',
    emptyEvents: 'यहाँ अभी कुछ दर्ज नहीं।',
    drawings: 'ड्रॉइंग',
    drawingsPlaceholder: 'ड्रॉइंग खोज जल्द आ रही है।',
    drawingsBody: 'PM से ड्रॉइंग शेयर करने को कहो — यहाँ सिर्फ़ देखने को मिलेगी।',
  },
} as const

const EVENT_LABEL: Record<SiteEventType, { en: string; hi: string }> = {
  attendance: { en: 'Attendance', hi: 'हाज़िरी' },
  material_delivery: { en: 'Delivery', hi: 'डिलीवरी' },
  progress_update: { en: 'Progress', hi: 'प्रगति' },
  issue: { en: 'Issue', hi: 'समस्या' },
  invoice_received: { en: 'Invoice', hi: 'बिल' },
  drawing_shared: { en: 'Drawing', hi: 'ड्रॉइंग' },
  approval: { en: 'Approval', hi: 'मंज़ूरी' },
  payment_request: { en: 'Payment', hi: 'भुगतान' },
  unknown: { en: 'Update', hi: 'अपडेट' },
}

function eventTint(t: SiteEventType): string {
  if (t === 'issue') return STATUS.risk
  if (t === 'approval' || t === 'payment_request') return STATUS.warn
  return STATUS.info
}

/** Map a site status string onto the shared status spine. */
function siteStatus(s: string): Status {
  if (s === 'active') return 'ok'
  if (s === 'paused') return 'warn'
  if (s === 'completed') return 'info'
  return 'info'
}

export default function MySites() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sitesQ = useQuery({
    queryKey: ['supervisor', 'sites'],
    queryFn: () => supervisorApi.sites(),
  })

  const sites: Site[] = sitesQ.data?.items ?? []
  const active = selectedId ?? sites[0]?.id ?? null

  return (
    <Screen>
      <Display>{str.title}</Display>

      {sitesQ.isLoading ? <Loading /> : null}
      {sitesQ.isError ? (
        <ErrorState
          message={str.errSites}
          retryLabel={str.retry}
          onRetry={() => void sitesQ.refetch()}
        />
      ) : null}

      {sitesQ.isSuccess && sites.length === 0 ? (
        <CalmEmpty title={str.emptySitesTitle} body={str.emptySitesBody} />
      ) : null}

      {sites.length > 0 ? (
        <>
          {/* Assigned-site chips — static, no switcher. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {sites.map((s) => {
              const isActive = s.id === active
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setSelectedId(s.id)}
                  style={{
                    minHeight: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.sm,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: isActive ? c.accent : c.line,
                    backgroundColor: isActive ? c.accent : c.card,
                    paddingHorizontal: SPACE.md,
                  }}
                >
                  <StatusDot status={siteStatus(s.status)} size={10} />
                  <BodyStrong color={isActive ? c.onAccent : c.text}>{s.name}</BodyStrong>
                </Pressable>
              )
            })}
          </View>

          {active ? <SiteDetail siteId={active} /> : null}
        </>
      ) : null}
    </Screen>
  )
}

function SiteDetail({ siteId }: { siteId: string }) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const eventsQ = useQuery<Paginated<SiteEvent>>({
    queryKey: ['supervisor', 'events', siteId],
    queryFn: () => supervisorApi.siteEvents(siteId),
  })

  const events = eventsQ.data?.items ?? []

  return (
    <View style={{ gap: SPACE.md }}>
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>
        {str.recent}
      </Small>

      {eventsQ.isLoading ? <Loading /> : null}
      {eventsQ.isError ? (
        <ErrorState
          message={str.errEvents}
          retryLabel={str.retry}
          onRetry={() => void eventsQ.refetch()}
        />
      ) : null}

      {eventsQ.isSuccess && events.length === 0 ? (
        <CalmEmpty title={str.emptyEvents} />
      ) : null}

      {events.length > 0 ? (
        <Card>
          {events.map((e, i) => (
            <TimelineItem
              key={e.id}
              typeLabel={EVENT_LABEL[e.event_type][lang]}
              summary={e.summary}
              occurredOn={e.occurred_on}
              tint={eventTint(e.event_type)}
              isLast={i === events.length - 1}
            />
          ))}
        </Card>
      ) : null}

      {/* Drawings — read-only. No endpoint yet → calm placeholder (NOTE). */}
      <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm }}>
        {str.drawings}
      </Small>
      <Card>
        <View style={{ gap: SPACE.xs }}>
          <H2>📐 {str.drawingsPlaceholder}</H2>
          <Body muted>{str.drawingsBody}</Body>
        </View>
      </Card>
    </View>
  )
}
