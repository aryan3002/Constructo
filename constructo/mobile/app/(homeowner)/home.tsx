/**
 * Homeowner Home (H2) — the daily "am I okay?" Daylight dashboard.
 *
 * A calm, glance-first summary built from `homeowner.home()`: a time-bar for
 * overall progress, the current/next milestone, the single most important thing
 * needing the owner's response (with inline approve/comment/request-change),
 * recent activity as a timeline, an optional spend roll-up, and one decisive
 * "Flag an issue" action. Every section is conditional — an empty section
 * vanishes rather than rendering a hollow card.
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { homeowner } from '../../src/api/client'
import type { AttentionItem } from '../../src/api/types'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  Mono,
  Screen,
  Small,
  StatusPill,
  TimelineItem,
} from '../../src/ui'

// ---- local strings (bilingual; Hindi in Devanagari) ----
const STR = {
  en: {
    settings: 'Settings',
    greeting: 'Your home, today',
    fallbackName: 'Your home',
    onTrack: 'On track',
    onTrackBody: 'Everything is moving along. We will surface anything that needs you here.',
    projectStatus: 'Project status',
    started: 'Started',
    handover: 'Handover',
    progressLine: (pct: number) => `About ${pct}% of the way to handover`,
    notStarted: 'Work has not started yet',
    handedOver: 'Handover complete — congratulations!',
    now: 'Now',
    next: 'Next',
    expectedBy: 'Expected by',
    attention: 'Needs your attention',
    approve: 'Approve',
    comment: 'Comment',
    requestChange: 'Request change',
    moreItems: (n: number) => `+${n} more in Requests`,
    recent: 'Recent activity',
    spend: 'Spend so far',
    changes: (n: number) => `${n} change${n === 1 ? '' : 's'} approved`,
    flag: 'Flag an issue',
    tryAgain: 'Try again',
    errorLine: 'We could not load your home just now.',
    sent: 'Thanks — your response was sent.',
  },
  hi: {
    settings: 'सेटिंग्स',
    greeting: 'आपका घर, आज',
    fallbackName: 'आपका घर',
    onTrack: 'सब ठीक है',
    onTrackBody: 'सब कुछ ठीक चल रहा है। जिस चीज़ में आपकी ज़रूरत होगी, वह यहाँ दिखेगी।',
    projectStatus: 'परियोजना की स्थिति',
    started: 'शुरू',
    handover: 'हैंडओवर',
    progressLine: (pct: number) => `हैंडओवर तक लगभग ${pct}% पूरा`,
    notStarted: 'काम अभी शुरू नहीं हुआ है',
    handedOver: 'हैंडओवर पूरा — बधाई हो!',
    now: 'अभी',
    next: 'आगे',
    expectedBy: 'अपेक्षित',
    attention: 'आपके ध्यान की ज़रूरत',
    approve: 'मंज़ूर करें',
    comment: 'टिप्पणी',
    requestChange: 'बदलाव माँगें',
    moreItems: (n: number) => `+${n} और अनुरोध में`,
    recent: 'हाल की गतिविधि',
    spend: 'अब तक का खर्च',
    changes: (n: number) => `${n} बदलाव मंज़ूर`,
    flag: 'समस्या दर्ज करें',
    tryAgain: 'फिर कोशिश करें',
    errorLine: 'अभी आपका घर लोड नहीं हो सका।',
    sent: 'धन्यवाद — आपका उत्तर भेज दिया गया।',
  },
} as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ISO date/datetime → "12 Jan 2026" (empty string when unparseable). */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Indian-style rupee formatting: ₹X.X Cr / ₹X.X L / ₹12,000. */
function formatRupees(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)} L`
  // Indian digit grouping (e.g. 1,23,456).
  const s = String(Math.round(abs))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3
  return `${sign}₹${grouped}`
}

/** Elapsed fraction (0..1) of started → handover vs today, or null if unknown. */
function elapsedFraction(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  const now = Date.now()
  return Math.max(0, Math.min(1, (now - s) / (e - s)))
}

export default function Home() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const t = STR[lang]

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => homeowner.home(),
  })

  const [sentBanner, setSentBanner] = useState(false)
  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'comment' | 'request_change' }) =>
      homeowner.respondDecision(id, action),
    onSuccess: () => {
      setSentBanner(true)
      void refetch()
    },
  })

  if (isLoading) {
    return (
      <Screen>
        <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    )
  }

  if (error || !data) {
    return (
      <Screen>
        <View style={{ gap: SPACE.md, paddingVertical: SPACE.xl }}>
          <Small color={theme.colors.risk}>{t.errorLine}</Small>
          <Button title={t.tryAgain} variant="secondary" onPress={() => void refetch()} />
        </View>
      </Screen>
    )
  }

  const { property, milestone_now, milestone_next, needs_attention, recent_activity, spend_summary } =
    data

  const frac = elapsedFraction(property?.started_on ?? null, property?.expected_handover_on ?? null)
  const hasTimeline = property != null && frac != null
  const pct = frac != null ? Math.round(frac * 100) : 0
  const firstAttention: AttentionItem | undefined = needs_attention[0]
  const moreAttention = Math.max(0, needs_attention.length - 1)

  return (
    <Screen>
      {/* 1 — Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
        <View style={{ gap: SPACE.xs, flex: 1 }}>
          <Small muted>{t.greeting}</Small>
          <Display>{property?.display_name ?? t.fallbackName}</Display>
        </View>
        <Link href="/(homeowner)/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.settings}
            hitSlop={8}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Small color={theme.colors.accentDeep}>{t.settings} ⚙︎</Small>
          </Pressable>
        </Link>
      </View>

      {/* Confirmation banner after a decision response */}
      {sentBanner ? (
        <Small color={theme.colors.ok}>{t.sent}</Small>
      ) : null}

      {/* 2 — Project status (time-bar, or calm fallback) */}
      {hasTimeline ? (
        <Card>
          <Small muted style={{ letterSpacing: 1, marginBottom: SPACE.xs }}>
            {t.projectStatus.toUpperCase()}
          </Small>
          <View
            style={{
              height: 10,
              borderRadius: 9999,
              backgroundColor: theme.colors.line,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 9999,
                backgroundColor: theme.colors.accent,
              }}
            />
          </View>
          <Body style={{ marginTop: SPACE.md }}>
            {pct <= 0 ? t.notStarted : pct >= 100 ? t.handedOver : t.progressLine(pct)}
          </Body>
          <Mono muted style={{ marginTop: SPACE.xs }}>
            {t.started} {formatDate(property!.started_on)} · {t.handover}{' '}
            {formatDate(property!.expected_handover_on)}
          </Mono>
        </Card>
      ) : (
        <CalmCard
          eyebrow={t.projectStatus}
          title={t.onTrack}
          body={t.onTrackBody}
          status="ok"
          trailing={<StatusPill status="ok" size="sm" />}
        />
      )}

      {/* 3 — Milestones */}
      {milestone_now || milestone_next ? (
        <Card>
          {milestone_now ? (
            <View style={{ gap: SPACE.xs }}>
              <StatusPill status="info" size="sm" label={t.now} />
              <H2>{milestone_now.name}</H2>
              {milestone_now.expected_on ? (
                <Small muted>
                  {t.expectedBy} {formatDate(milestone_now.expected_on)}
                </Small>
              ) : null}
            </View>
          ) : null}
          {milestone_next ? (
            <Small
              muted
              style={{ marginTop: milestone_now ? SPACE.md : 0 }}
            >
              {t.next}: {milestone_next.name}
              {milestone_next.expected_on ? ` · ${formatDate(milestone_next.expected_on)}` : ''}
            </Small>
          ) : null}
        </Card>
      ) : null}

      {/* 4 — Needs your attention (one at a time) */}
      {firstAttention ? (
        <View style={{ gap: SPACE.sm }}>
          <CalmCard
            eyebrow={t.attention}
            title={firstAttention.title}
            body={firstAttention.detail ?? undefined}
            status="warn"
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              <Button
                title={t.approve}
                size="md"
                loading={respond.isPending}
                disabled={respond.isPending}
                onPress={() => respond.mutate({ id: firstAttention.id, action: 'approve' })}
              />
              <Button
                title={t.comment}
                variant="secondary"
                size="md"
                disabled={respond.isPending}
                onPress={() => respond.mutate({ id: firstAttention.id, action: 'comment' })}
              />
              <Button
                title={t.requestChange}
                variant="ghost"
                size="md"
                disabled={respond.isPending}
                onPress={() => respond.mutate({ id: firstAttention.id, action: 'request_change' })}
              />
            </View>
          </CalmCard>
          {moreAttention > 0 ? (
            <Link href="/requests" asChild>
              <BodyStrong color={theme.colors.accentDeep}>{t.moreItems(moreAttention)}</BodyStrong>
            </Link>
          ) : null}
        </View>
      ) : null}

      {/* 5 — Recent activity */}
      {recent_activity.length > 0 ? (
        <Card>
          <Small muted style={{ letterSpacing: 1, marginBottom: SPACE.md }}>
            {t.recent.toUpperCase()}
          </Small>
          {recent_activity.map((u, i) => (
            <TimelineItem
              key={u.id}
              typeLabel={u.type.replace(/_/g, ' ')}
              summary={u.title}
              occurredOn={formatDate(u.published_at)}
              isLast={i === recent_activity.length - 1}
            />
          ))}
        </Card>
      ) : null}

      {/* 6 — Spend summary */}
      {spend_summary ? (
        <Card>
          <Small muted style={{ letterSpacing: 1, marginBottom: SPACE.xs }}>
            {t.spend.toUpperCase()}
          </Small>
          <Display>{formatRupees(spend_summary.total_change_cost_delta)}</Display>
          <Small muted style={{ marginTop: SPACE.xs }}>
            {t.changes(spend_summary.change_count)}
          </Small>
        </Card>
      ) : null}

      {/* 7 — Flag an issue */}
      <Button title={t.flag} block size="lg" onPress={() => router.push('/requests')} />
    </Screen>
  )
}
