/**
 * Sites (Tab 2) — the portfolio roll-up, Calm-Cockpit prototype composition.
 *
 * Each site card: a house chip, name + locality, a status pill (On track / Needs
 * you / Delayed), the stage line, and the live "for you" / "overdue" / "Clear"
 * counters. Filter chips: All / Needs owner / Overdue / Off track.
 *
 * All signals are real: per-site status + counts come from /dashboard/home;
 * locality from /sites; the "for you" / "overdue" counters from the pending
 * approvals inbox (overdue = past its SLA). Progress % is intentionally NOT
 * shown — the backend has no timeline-progress field and we don't fabricate one.
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { owner, type Decision, type SiteCard as SiteCardData } from '../../../src/api/owner'
import { Avatar, Card, H1, Micro, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock } from './_components'

const STR = {
  en: {
    title: 'Sites',
    sub: (n: number) => `${n} active project${n === 1 ? '' : 's'}`,
    all: 'All', needs: 'Needs owner', overdue: 'Overdue', offtrack: 'Off track',
    onTrack: 'On track', needsYou: 'Needs you', delayed: 'Delayed',
    forYou: 'for you', overdueN: 'overdue', clear: 'Clear',
    empty: 'No sites match this filter — all clear here.',
    error: 'We could not load your sites just now.', tryAgain: 'Try again',
  },
  hi: {
    title: 'साइट',
    sub: (n: number) => `${n} सक्रिय परियोजना`,
    all: 'सभी', needs: 'आपके लिए', overdue: 'बकाया', offtrack: 'पटरी से उतरी',
    onTrack: 'सही राह', needsYou: 'आपकी ज़रूरत', delayed: 'देरी',
    forYou: 'आपके लिए', overdueN: 'बकाया', clear: 'साफ़',
    empty: 'इस फ़िल्टर से कोई साइट नहीं — यहाँ सब साफ़ है।',
    error: 'अभी आपकी साइट लोड नहीं हो सकीं।', tryAgain: 'फिर कोशिश करें',
  },
} as const

type Filter = 'all' | 'needs' | 'overdue' | 'offtrack'
type Txt = (typeof STR)['en'] | (typeof STR)['hi']

interface SiteRow {
  card: SiteCardData
  locality: string | null
  forYou: number
  overdue: number
  status: Status
}

const coerce = (s: string): Status =>
  s === 'ok' || s === 'warn' || s === 'risk' || s === 'info' || s === 'quiet' ? s : 'info'

export default function Sites() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const t = STR[lang]
  const [filter, setFilter] = useState<Filter>('all')

  const q = useQuery({
    queryKey: ['owner', 'sites-portfolio'],
    queryFn: async (): Promise<SiteRow[]> => {
      const [home, sites, approvals] = await Promise.all([
        owner.home(),
        owner.sites(),
        owner.approvals('pending'),
      ])
      const localityById = new Map(sites.items.map((s) => [s.id, s.location]))
      const now = Date.now()
      const isOverdue = (d: Decision) => !!d.sla_due_at && new Date(d.sla_due_at).getTime() < now
      const bySite = (pred: (d: Decision) => boolean) => {
        const m = new Map<string, number>()
        for (const d of approvals.items) {
          if (!d.site_id || !pred(d)) continue
          m.set(d.site_id, (m.get(d.site_id) ?? 0) + 1)
        }
        return m
      }
      const overdueBySite = bySite(isOverdue)
      const forYouBySite = bySite((d) => !isOverdue(d))

      return home.sites.map((card) => {
        const overdue = overdueBySite.get(card.site_id) ?? 0
        const forYou = forYouBySite.get(card.site_id) ?? 0
        // Status escalates with real owner workload: overdue → delayed, else
        // pending owner decisions → needs-you, else the home status spine.
        const status: Status =
          overdue > 0 ? 'risk' : forYou > 0 ? 'warn' : coerce(card.status)
        return { card, locality: localityById.get(card.site_id) ?? null, forYou, overdue, status }
      })
    },
  })

  const rows = q.data ?? []
  const counts = useMemo(
    () => ({
      all: rows.length,
      needs: rows.filter((r) => r.forYou > 0 || r.overdue > 0).length,
      overdue: rows.filter((r) => r.overdue > 0).length,
      offtrack: rows.filter((r) => r.status !== 'ok').length,
    }),
    [rows],
  )

  const filtered = rows.filter((r) => {
    if (filter === 'needs') return r.forYou > 0 || r.overdue > 0
    if (filter === 'overdue') return r.overdue > 0
    if (filter === 'offtrack') return r.status !== 'ok'
    return true
  })

  const TABS: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: t.all, n: counts.all },
    { id: 'needs', label: t.needs, n: counts.needs },
    { id: 'overdue', label: t.overdue, n: counts.overdue },
    { id: 'offtrack', label: t.offtrack, n: counts.offtrack },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.md }}
    >
      <View style={{ gap: 2 }}>
        <H1 style={{ fontSize: 26 }}>{t.title}</H1>
        <Small muted>{t.sub(counts.all)}</Small>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
        {TABS.map((tab) => {
          const on = filter === tab.id
          return (
            <Small
              key={tab.id}
              onPress={() => setFilter(tab.id)}
              style={{
                overflow: 'hidden',
                paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radii.pill,
                backgroundColor: on ? theme.colors.accent : theme.colors.card,
                color: on ? theme.colors.onAccent : theme.colors.text,
                borderWidth: 1, borderColor: on ? theme.colors.accent : theme.colors.line,
              }}
            >
              {tab.label}{tab.n > 0 ? ` ${tab.n}` : ''}
            </Small>
          )
        })}
      </ScrollView>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message={t.error} retryLabel={t.tryAgain} onRetry={() => void q.refetch()} />
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: SPACE.sm }}>
          <Ionicons name="checkmark-circle" size={28} color={theme.colors.ok} />
          <Small muted>{t.empty}</Small>
        </View>
      ) : (
        <View style={{ gap: SPACE.md }}>
          {filtered.map((r) => (
            <SiteCardView key={r.card.site_id} r={r} t={t} onPress={() => router.push(`/(contractor)/owner/site/${r.card.site_id}`)} />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function SiteCardView({ r, t, onPress }: { r: SiteRow; t: Txt; onPress: () => void }) {
  const { theme } = useTheme()
  const { card } = r
  const statusLabel = r.status === 'ok' ? t.onTrack : r.status === 'risk' ? t.delayed : r.status === 'warn' ? t.needsYou : undefined
  const stage = (card.counts?.attendance ?? 0) > 0
    ? `${card.counts.attendance} present today`
    : 'Active project'

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.colors.paper, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="home" size={20} color={theme.colors.textMute} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Title style={{ fontSize: 16 }} numberOfLines={1}>{card.name}</Title>
            {r.locality ? <Small muted numberOfLines={1}>{r.locality}</Small> : null}
          </View>
          <StatusPill status={r.status} size="sm" label={statusLabel} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.md }}>
          <Ionicons name="albums-outline" size={14} color={theme.colors.textMute} />
          <Small muted>{stage}</Small>
        </View>

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
            marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: theme.colors.line,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
            <Avatar name={card.name} size={24} />
            <Small muted numberOfLines={1}>{card.expected_headcount != null ? `${card.expected_headcount} planned` : 'On site'}</Small>
          </View>
          {r.overdue > 0 ? (
            <Counter icon="warning" color={theme.colors.risk} text={`${r.overdue} ${t.overdueN}`} />
          ) : null}
          {r.forYou > 0 ? (
            <Counter icon="flash" color={theme.colors.warn} text={`${r.forYou} ${t.forYou}`} />
          ) : null}
          {r.overdue === 0 && r.forYou === 0 ? (
            <Counter icon="checkmark" color={theme.colors.ok} text={t.clear} />
          ) : null}
        </View>
      </Card>
    </Pressable>
  )
}

function Counter({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={13} color={color} />
      <Micro style={{ color }}>{text}</Micro>
    </View>
  )
}
