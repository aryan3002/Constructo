/**
 * Project Updates — the homeowner's "what's happening" screen.
 *
 * One screen, four in-screen sub-tabs driven by a segmented control (NOT routes):
 *   Timeline | Milestones | Changes | Property
 * Each sub-tab fetches lazily (one TanStack query, enabled only when selected)
 * and renders its own loading / empty / error states.
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../src/i18n/I18nProvider'
import { homeowner } from '../../src/api/client'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, STATUS } from '../../src/theme/tokens'
import {
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Mono,
  Small,
  StatusPill,
  Screen,
  TimelineItem,
} from '../../src/ui'
import {
  SUB_TABS,
  formatDate,
  formatDayDelta,
  formatRupeeDelta,
  formatRupees,
  milestoneMeta,
  updateMeta,
  type SubTab,
} from './_updates.util'

// ---- localised copy ----
const STR = {
  en: {
    tabs: { timeline: 'Timeline', milestones: 'Milestones', changes: 'Changes', property: 'Property' },
    weekEyebrow: 'THIS WEEK',
    weekTitle: 'Weekly summary',
    loading: 'Loading…',
    retry: 'Try again',
    errTimeline: 'Could not load updates.',
    errMilestones: 'Could not load milestones.',
    errChanges: 'Could not load changes.',
    errProperty: 'Could not load your property.',
    emptyTimeline: 'No updates yet. Your site is quiet for now.',
    emptyMilestones: 'No milestones planned yet.',
    emptyChanges: 'No changes logged yet — costs and dates are holding steady.',
    emptyProperty: 'No spaces added yet.',
    totalsTitle: 'Running totals',
    costLabel: 'Cost change',
    scheduleLabel: 'Schedule change',
    notStarted: 'Not started',
    reason: 'Why',
  },
  hi: {
    tabs: { timeline: 'टाइमलाइन', milestones: 'पड़ाव', changes: 'बदलाव', property: 'संपत्ति' },
    weekEyebrow: 'इस हफ़्ते',
    weekTitle: 'साप्ताहिक सारांश',
    loading: 'लोड हो रहा है…',
    retry: 'फिर कोशिश करें',
    errTimeline: 'अपडेट लोड नहीं हो सके।',
    errMilestones: 'पड़ाव लोड नहीं हो सके।',
    errChanges: 'बदलाव लोड नहीं हो सके।',
    errProperty: 'आपकी संपत्ति लोड नहीं हो सकी।',
    emptyTimeline: 'अभी कोई अपडेट नहीं। फ़िलहाल साइट शांत है।',
    emptyMilestones: 'अभी कोई पड़ाव तय नहीं है।',
    emptyChanges: 'अभी कोई बदलाव दर्ज नहीं — लागत और तारीखें स्थिर हैं।',
    emptyProperty: 'अभी कोई स्थान नहीं जोड़ा गया।',
    totalsTitle: 'कुल योग',
    costLabel: 'लागत में बदलाव',
    scheduleLabel: 'समय में बदलाव',
    notStarted: 'शुरू नहीं हुआ',
    reason: 'कारण',
  },
} as const

export default function Updates() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const [tab, setTab] = useState<SubTab>('timeline')
  const str = STR[lang]

  return (
    <Screen>
      <Display>{t('nav.updates')}</Display>

      {/* Segmented control — a row of ≥44px Pressable pills. */}
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          gap: SPACE.xs,
          backgroundColor: c.paper,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: theme.radii.pill,
          padding: SPACE.xs,
        }}
      >
        {SUB_TABS.map((key) => {
          const active = key === tab
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.pill,
                backgroundColor: active ? c.accent : 'transparent',
                paddingHorizontal: SPACE.sm,
              }}
            >
              <Small color={active ? c.onAccent : c.textMute} style={{ fontWeight: '600' }}>
                {str.tabs[key]}
              </Small>
            </Pressable>
          )
        })}
      </View>

      {tab === 'timeline' ? <TimelineTab /> : null}
      {tab === 'milestones' ? <MilestonesTab /> : null}
      {tab === 'changes' ? <ChangesTab /> : null}
      {tab === 'property' ? <PropertyTab /> : null}
    </Screen>
  )
}

// ---- shared state views ----
function Loading() {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <Card>
      <Small muted>{message}</Small>
    </Card>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { lang } = useT()
  return (
    <Card>
      <View style={{ gap: SPACE.md }}>
        <Small color={STATUS.risk}>{message}</Small>
        <Button title={STR[lang].retry} variant="secondary" onPress={onRetry} />
      </View>
    </Card>
  )
}

// ---- Timeline ----
function TimelineTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const str = STR[lang]

  const summaryQ = useQuery({
    queryKey: ['homeowner', 'weeklySummary'],
    queryFn: () => homeowner.weeklySummary(),
  })
  const updatesQ = useQuery({
    queryKey: ['homeowner', 'updates'],
    queryFn: () => homeowner.updates(),
  })

  if (updatesQ.isLoading || summaryQ.isLoading) return <Loading />
  if (updatesQ.isError) {
    return <ErrorState message={str.errTimeline} onRetry={() => void updatesQ.refetch()} />
  }

  const latest = summaryQ.data?.[0]
  const items = updatesQ.data?.items ?? []

  return (
    <View style={{ gap: SPACE.md }}>
      {/* FLAGSHIP weekly summary, pinned at the very top. */}
      {latest ? (
        <CalmCard
          status="info"
          eyebrow={str.weekEyebrow}
          title={str.weekTitle}
          body={latest.text}
        />
      ) : null}

      {items.length === 0 ? (
        <Empty message={str.emptyTimeline} />
      ) : (
        <Card>
          {items.map((u, i) => {
            const meta = updateMeta(u.type, lang)
            const tint = meta.status === 'mute' ? theme.colors.textMute : STATUS[meta.status]
            const isLast = i === items.length - 1
            return (
              // Architectural Precision left-rail: teal date + status dot + title.
              <View key={u.id} style={{ flexDirection: 'row', gap: SPACE.md }}>
                <View style={{ width: 14, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: tint,
                      marginTop: 6,
                    }}
                  />
                  {!isLast ? (
                    <View
                      style={{
                        flex: 1,
                        width: 2,
                        backgroundColor: theme.colors.line,
                        marginTop: 4,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: isLast ? 0 : SPACE.lg }}>
                  <Small color={theme.colors.accent} style={{ letterSpacing: 1 }}>
                    {formatDate(u.published_at, lang).toUpperCase()}
                  </Small>
                  <BodyStrong style={{ marginTop: 2 }}>{u.title}</BodyStrong>
                  {u.body ? (
                    <Small muted style={{ marginTop: 4 }}>
                      {u.body}
                    </Small>
                  ) : null}
                </View>
              </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}

// ---- Milestones ----
function MilestonesTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const q = useQuery({
    queryKey: ['homeowner', 'milestones'],
    queryFn: () => homeowner.milestones(),
  })

  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState message={str.errMilestones} onRetry={() => void q.refetch()} />

  const milestones = [...(q.data ?? [])].sort((a, b) => a.order - b.order)
  if (milestones.length === 0) return <Empty message={str.emptyMilestones} />

  return (
    <Card padded={false}>
      {milestones.map((m, i) => {
        const meta = milestoneMeta(m.status, lang)
        const date =
          m.status === 'done'
            ? formatDate(m.completed_on ?? m.expected_on, lang)
            : formatDate(m.expected_on, lang)
        return (
          <View
            key={m.id}
            style={{
              padding: SPACE.lg,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.line,
              gap: SPACE.sm,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: SPACE.md,
              }}
            >
              <BodyStrong style={{ flex: 1 }}>{m.name}</BodyStrong>
              {'muted' in meta ? (
                <View
                  style={{
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: c.line,
                    backgroundColor: c.paper,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                  }}
                >
                  <Small muted style={{ fontWeight: '600' }}>
                    {meta.label}
                  </Small>
                </View>
              ) : (
                <StatusPill status={meta.status} label={meta.label} size="sm" />
              )}
            </View>
            <Mono muted style={{ fontSize: 12 }}>
              {date}
            </Mono>
          </View>
        )
      })}
    </Card>
  )
}

// ---- Changes ----
function ChangesTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const q = useQuery({
    queryKey: ['homeowner', 'changes'],
    queryFn: () => homeowner.changes(),
  })

  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState message={str.errChanges} onRetry={() => void q.refetch()} />

  const log = q.data
  const items = log?.items ?? []
  const costDelta = log?.total_cost_delta ?? 0
  const dayDelta = log?.total_schedule_delta_days ?? 0

  return (
    <View style={{ gap: SPACE.md }}>
      {/* Running totals header. */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <Small muted style={{ letterSpacing: 1 }}>
            {str.totalsTitle.toUpperCase()}
          </Small>
          <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
            <View style={{ flex: 1 }}>
              <Small muted>{str.costLabel}</Small>
              <H2 color={costDelta > 0 ? STATUS.risk : costDelta < 0 ? STATUS.ok : c.text}>
                {formatRupeeDelta(costDelta)}
              </H2>
            </View>
            <View style={{ flex: 1 }}>
              <Small muted>{str.scheduleLabel}</Small>
              <H2 color={dayDelta > 0 ? STATUS.risk : dayDelta < 0 ? STATUS.ok : c.text}>
                {formatDayDelta(dayDelta, lang)}
              </H2>
            </View>
          </View>
        </View>
      </Card>

      {items.length === 0 ? (
        <Empty message={str.emptyChanges} />
      ) : (
        <Card padded={false}>
          {items.map((ch, i) => (
            <View
              key={ch.id}
              style={{
                padding: SPACE.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
                gap: SPACE.xs,
              }}
            >
              <BodyStrong>{ch.description}</BodyStrong>
              <View style={{ flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.xs }}>
                <Mono color={(ch.cost_delta ?? 0) > 0 ? STATUS.risk : (ch.cost_delta ?? 0) < 0 ? STATUS.ok : c.textMute}>
                  {formatRupeeDelta(ch.cost_delta)}
                </Mono>
                <Mono color={(ch.schedule_delta_days ?? 0) > 0 ? STATUS.risk : (ch.schedule_delta_days ?? 0) < 0 ? STATUS.ok : c.textMute}>
                  {formatDayDelta(ch.schedule_delta_days, lang)}
                </Mono>
              </View>
              {ch.reason ? (
                <Small muted style={{ marginTop: SPACE.xs }}>
                  {str.reason}: {ch.reason}
                </Small>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </View>
  )
}

// ---- Property ----
function PropertyTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  const q = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })

  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState message={str.errProperty} onRetry={() => void q.refetch()} />

  const spaces = [...(q.data?.spaces ?? [])].sort((a, b) => a.order - b.order)
  if (spaces.length === 0) return <Empty message={str.emptyProperty} />

  return (
    <Card padded={false}>
      {spaces.map((s, i) => {
        const pct = s.progress != null ? Math.round(Math.max(0, Math.min(1, s.progress)) * 100) : null
        return (
          <View
            key={s.id}
            style={{
              padding: SPACE.lg,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.line,
              gap: SPACE.sm,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: SPACE.md,
              }}
            >
              <BodyStrong style={{ flex: 1 }}>{s.name}</BodyStrong>
              {pct != null ? (
                <Mono muted style={{ fontSize: 12 }}>{`${pct}%`}</Mono>
              ) : (
                <Small muted>{str.notStarted}</Small>
              )}
            </View>
            {pct != null ? (
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: c.line,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: c.accent,
                  }}
                />
              </View>
            ) : null}
          </View>
        )
      })}
    </Card>
  )
}
