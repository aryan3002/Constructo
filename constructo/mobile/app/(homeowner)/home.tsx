/**
 * Homeowner Home — rebuilt to FAITHFULLY match the Neev prototype (screen-home.jsx,
 * variant A / the canonical HomeScreen). Six-card vertical stack in prototype order:
 *
 *   1. Hero card (clay top-accent + clay→surface gradient, Eyebrow "Today · all calm",
 *      Eczar serif "You're okay." (~36px), sub line, TimeBar, "On track" pill + "N
 *      choices" amber pill row).
 *   2. NeedsInputCard (amber tint + amber accent, ⚡ title, item rows + "View" button).
 *      Hidden when needs_attention is empty.
 *   3. MilestonesCard (flush card: clay eyebrow "Milestones", target handover date +
 *      On-track pill + MilestoneStrip + "Now: {stage} · expected {date}" clay box).
 *   4. RequestsCard ("My requests (N open)" — hidden when no open requests).
 *   5. ActivityCard ("Recent activity" — hidden when recent_activity empty).
 *   6. PaymentsCard ("Payments" + two stat tiles) — hidden when spend_summary is null.
 *
 * Wired to real data via homeowner.home() + homeowner.requests() + homeowner.milestones().
 * Keeps the file's existing STR en/hi table, data hooks, and loading/error handling.
 */
import { useCallback, useState } from 'react'
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner, type HeadsUp, type HeadsUpAction } from '../../src/api/client'
import { HeadsUpSection } from './_heads_up'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyLg,
  Button,
  Display,
  Eyebrow,
  FadeInUp,
  LinkRow,
  ListRow,
  MilestoneStrip,
  MonoSm,
  Screen,
  ScreenLoader,
  Small,
  StatusPill,
  TimeBar,
  FLOATING_NAV_CLEARANCE,
  Logo,
  formatINR,
} from '../../src/ui'
import type { AttentionItem, Update } from '../../src/api/types'
import { REQUEST_STATUS_META, slaPromise } from '../_requests.util'

// ─── i18n table (en / hi) ───────────────────────────────────────────────────

const STR = {
  en: {
    finishesEyebrow: 'YOUR FINISHES',
    finishesLabel: 'Your finishes',
    finishesSub: 'Room-by-room choices for your home',
    settings: 'Open settings',
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    today: 'Today · all calm',
    // The 3-second answer (Eczar serif), per state.
    answerOk: "You're okay.",
    answerAttention: 'One thing for you.',
    answerQuiet: 'All quiet on site.',
    // The reassuring sub-line under the answer.
    subOk: "Nothing needs you today. We'll tell you the moment it does.",
    subAttention: 'Take a look when you have a minute — no rush.',
    subQuiet: 'Your site team is on it. Calm is good news.',
    onTrack: 'On track',
    needsYou: 'Needs you',
    quietChip: 'Quiet',
    inProgress: 'In progress',
    started: 'Started',
    handover: 'Handover',
    progressBody: "Here's where your build stands today.",
    reviewed: 'Reviewed by site',
    youAreHere: 'Now',
    // NeedsInput card
    needsInputTitle: 'Needs your input',
    needsInputView: 'View',
    needsInputSeeAll: 'See all',
    // Milestones card
    milestonesEyebrow: 'Milestones',
    milestonesHandover: 'Target handover',
    milestonesNow: 'Now',
    milestonesDone: 'done',
    milestonesToGo: 'to go',
    milestonesExpected: 'expected',
    milestonesSeeTimeline: 'See full timeline',
    // Requests card
    requestsTitle: 'My requests',
    requestsOpen: 'open',
    requestsSeeAll: 'See all',
    requestsAdd: 'Add a request',
    requestsEmpty: 'No open requests',
    // Activity card
    activityTitle: 'Recent activity',
    activitySeeAll: 'See all updates',
    activityEmpty: 'No recent activity',
    // Payments card
    paymentsTitle: 'Payments',
    paymentsPreApproved: 'Pre-approved',
    paymentsTotalPaid: 'Total paid',
    paymentsNextPayment: 'Next payment',
    paymentsSeeSchedule: 'See payment schedule',
    // Error
    errorLine: "Couldn't load your home.",
    tryAgain: 'Try again',
    // Quiet
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next update expected around',
    // Phase 2 heartbeat — site-liveness pulse in the Hero card.
    newPhoto: 'new photo',
    newPhotos: 'new photos',
    photosThisWeek: 'this week',
    lastSitePhoto: 'Last site photo',
    rdToday: 'today',
    rdYesterday: 'yesterday',
    rdDaysAgo: 'days ago',
    rdLastWeek: 'last week',
    rdWeeksAgo: 'weeks ago',
  },
  hi: {
    finishesEyebrow: 'आपकी सामग्री',
    finishesLabel: 'आपकी फ़िनिश',
    finishesSub: 'घर के हर कमरे के लिए चुनी गई सामग्री',
    settings: 'सेटिंग्स खोलें',
    morning: 'सुप्रभात',
    afternoon: 'नमस्ते',
    evening: 'शुभ संध्या',
    today: 'आज · सब शांत',
    answerOk: 'सब ठीक है।',
    answerAttention: 'आपके लिए एक बात।',
    answerQuiet: 'साइट पर शांति है।',
    subOk: 'आज आपकी कोई ज़रूरत नहीं। जैसे ही होगी, हम बता देंगे।',
    subAttention: 'फ़ुरसत में एक नज़र डाल लें — कोई जल्दी नहीं।',
    subQuiet: 'आपकी साइट टीम काम पर है। शांति अच्छी ख़बर है।',
    onTrack: 'सब ठीक',
    needsYou: 'आपकी ज़रूरत',
    quietChip: 'शांत',
    inProgress: 'चल रहा है',
    started: 'शुरू',
    handover: 'कब्ज़ा',
    progressBody: 'आज आपके निर्माण की स्थिति यह है।',
    reviewed: 'साइट द्वारा जाँचा गया',
    youAreHere: 'अभी',
    needsInputTitle: 'आपकी ज़रूरत',
    needsInputView: 'देखें',
    needsInputSeeAll: 'सब देखें',
    milestonesEyebrow: 'पड़ाव',
    milestonesHandover: 'लक्ष्य कब्ज़ा',
    milestonesNow: 'अभी',
    milestonesDone: 'पूरे',
    milestonesToGo: 'बाकी',
    milestonesExpected: 'अपेक्षित',
    milestonesSeeTimeline: 'पूरी टाइमलाइन देखें',
    requestsTitle: 'मेरे अनुरोध',
    requestsOpen: 'खुले',
    requestsSeeAll: 'सब देखें',
    requestsAdd: 'अनुरोध जोड़ें',
    requestsEmpty: 'कोई खुला अनुरोध नहीं',
    activityTitle: 'हालिया गतिविधि',
    activitySeeAll: 'सब अपडेट देखें',
    activityEmpty: 'कोई हालिया गतिविधि नहीं',
    paymentsTitle: 'भुगतान',
    paymentsPreApproved: 'पूर्व-अनुमोदित',
    paymentsTotalPaid: 'कुल भुगतान',
    paymentsNextPayment: 'अगला भुगतान',
    paymentsSeeSchedule: 'भुगतान शेड्यूल देखें',
    errorLine: 'आपका घर लोड नहीं हो सका।',
    tryAgain: 'फिर कोशिश करें',
    quietTitle: 'अभी साइट पर शांति है',
    quietNextPrefix: 'अगला अपडेट लगभग',
    newPhoto: 'नई फ़ोटो',
    newPhotos: 'नई फ़ोटो',
    photosThisWeek: 'इस हफ़्ते',
    lastSitePhoto: 'आख़िरी साइट फ़ोटो',
    rdToday: 'आज',
    rdYesterday: 'कल',
    rdDaysAgo: 'दिन पहले',
    rdLastWeek: 'पिछले हफ़्ते',
    rdWeeksAgo: 'हफ़्ते पहले',
  },
} as const

// ─── Helper utilities ────────────────────────────────────────────────────────

function greetingFor(g: { morning: string; afternoon: string; evening: string }): string {
  const h = new Date().getHours()
  if (h < 12) return g.morning
  if (h < 17) return g.afternoon
  return g.evening
}

/** Elapsed fraction of the build (started → handover), as a 0–100 integer. */
function elapsedPct(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!(e > s)) return 0
  const frac = (Date.now() - s) / (e - s)
  return Math.round(Math.max(0, Math.min(1, frac)) * 100)
}

/** "Jan 2026" — month + year for TimeBar start/end labels. */
function monthYear(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** "10 Jun" — short date for milestone expected. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** "15 Sep 2026" — handover target date. */
function handoverDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Soft, day-granular relative time for the Phase 2 heartbeat: "today",
 *  "yesterday", "3 days ago", "last week", "2 weeks ago". Calm-cockpit tone —
 *  day granularity, never hours/minutes. Localized via the STR table. */
function relativeDay(iso: string | null, t: (typeof STR)['en'] | (typeof STR)['hi']): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return t.rdToday
  if (days === 1) return t.rdYesterday
  if (days < 7) return `${days} ${t.rdDaysAgo}`
  if (days < 14) return t.rdLastWeek
  return `${Math.floor(days / 7)} ${t.rdWeeksAgo}`
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function Home() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const t = STR[lang]

  // ── Data queries ────────────────────────────────────────────────────────────
  // All four fire in parallel — none consumes home's result, so gating them on
  // homeQ removed a 2-hop waterfall (cards used to pop in one query at a time).
  const homeQ = useQuery({ queryKey: ['home'], queryFn: () => homeowner.home() })
  const milestonesQ = useQuery({
    queryKey: ['home', 'milestones'],
    queryFn: () => homeowner.milestones(),
  })
  const requestsQ = useQuery({
    queryKey: ['home', 'requests'],
    queryFn: () => homeowner.requests(),
  })
  // Notification bell badge — the unread count for the in-app inbox.
  const notifQ = useQuery({ queryKey: ['notifications'], queryFn: () => homeowner.notifications() })
  const unreadCount = notifQ.data?.unread_count ?? 0

  // Proactive "heads up" — homeowner-safe Site Health findings + the design loop.
  const headsUpQ = useQuery({
    queryKey: ['home', 'headsUp'],
    queryFn: () => homeowner.headsUp(),
  })
  const qc = useQueryClient()
  const respondM = useMutation({
    mutationFn: (v: { id: string; action: HeadsUpAction }) =>
      homeowner.respondHeadsUp(v.id, v.action),
    // Optimistically settle the card only for the two RESOLVING actions —
    // 'show_more' leaves the finding open + respondable, so flipping it would
    // glitch (buttons pop back on refetch).
    onMutate: async (v) => {
      if (v.action !== 'approved' && v.action !== 'disputed') return
      await qc.cancelQueries({ queryKey: ['home', 'headsUp'] })
      const prev = qc.getQueryData<HeadsUp>(['home', 'headsUp'])
      qc.setQueryData<HeadsUp>(['home', 'headsUp'], (old) =>
        old
          ? {
              ...old,
              cards: old.cards.map((cd) =>
                cd.finding_id === v.id ? { ...cd, respondable: false } : cd,
              ),
            }
          : old,
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      const prev = (ctx as { prev?: HeadsUp } | undefined)?.prev
      if (prev) qc.setQueryData(['home', 'headsUp'], prev)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['home', 'headsUp'] })
      void qc.invalidateQueries({ queryKey: ['home', 'requests'] })
    },
  })
  const flagM = useMutation({
    mutationFn: () =>
      homeowner.flagSomething('Something looks off on site — please take a look.'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['home', 'requests'] }),
  })

  // Pull-to-refresh — invalidate every home surface (prefix-matches the
  // ['home', …] queries) plus the notification badge.
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['home'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [qc])

  // ── Loading / error states ───────────────────────────────────────────────────
  if (homeQ.isLoading) {
    return (
      <Screen>
        <ScreenLoader fill={false} />
      </Screen>
    )
  }
  if (homeQ.error || !homeQ.data) {
    return (
      <Screen>
        <View style={{ gap: SPACE.md, paddingVertical: SPACE.xl }}>
          <Small color={c.risk}>{t.errorLine}</Small>
          <Button title={t.tryAgain} variant="secondary" onPress={() => void homeQ.refetch()} />
        </View>
      </Screen>
    )
  }

  // ── Destructure real data ─────────────────────────────────────────────────
  const {
    property,
    milestone_now,
    milestone_next,
    needs_attention,
    recent_activity,
    spend_summary,
    quiet,
  } = homeQ.data

  const milestones = milestonesQ.data ?? []
  const openRequests = (requestsQ.data ?? []).filter((r) => r.status !== 'done').slice(0, 3)

  // ── Phase 2 heartbeat — site liveness from shared contractor photos ────────
  const photosThisWeek = homeQ.data.photos_this_week ?? 0
  const lastPhotoAt = homeQ.data.last_photo_at ?? null
  const heartbeatText =
    photosThisWeek > 0
      ? `${photosThisWeek} ${photosThisWeek === 1 ? t.newPhoto : t.newPhotos} ${t.photosThisWeek}${lastPhotoAt ? ` · ${relativeDay(lastPhotoAt, t)}` : ''}`
      : lastPhotoAt
        ? `${t.lastSitePhoto} ${relativeDay(lastPhotoAt, t)}`
        : ''

  // ── Hero / state resolution ───────────────────────────────────────────────
  const startOn = property?.started_on ?? null
  const handoverOn = property?.expected_handover_on ?? null
  const pct = elapsedPct(startOn, handoverOn)
  const startLabel = monthYear(startOn)
  const endLabel = monthYear(handoverOn)

  const firstAttention = needs_attention[0] ?? null
  const state: 'needs-attention' | 'quiet' | 'on-track' = firstAttention
    ? 'needs-attention'
    : quiet
      ? 'quiet'
      : 'on-track'

  const eyebrow = state === 'quiet' ? `${t.today} · ${t.quietChip.toLowerCase()}` : t.today
  const answer =
    state === 'needs-attention' ? t.answerAttention : state === 'quiet' ? t.answerQuiet : t.answerOk
  const subline =
    state === 'needs-attention' ? t.subAttention : state === 'quiet' ? t.subQuiet : t.subOk

  // Property sub line: "9 BHK Villa, Lucknow · interior finishing" style
  const propertySubLine = property
    ? `${property.display_name}${property.status ? ` · ${property.status}` : ''}`
    : ''

  // ── Token shortcuts ───────────────────────────────────────────────────────
  const clay = AP.clay            // #92482a
  const clayMarker = AP.clayMarker // #ae5635
  // Amber tokens (from prototype --amber-*)
  const amberTint = '#FAF1D9'
  const amberAccentBg = '#f5e8bc'
  const amberText = '#7d5a13'  // c.warn on daylight

  // ── Milestone data helpers ─────────────────────────────────────────────────
  const doneCount = milestones.filter((m) => m.status === 'done').length
  const toGoCount = milestones.filter((m) => m.status === 'upcoming').length
  const nowMilestone = milestone_now
  const nowExpected = shortDate(nowMilestone?.expected_on ?? null)

  // ── Spend summary formatting ──────────────────────────────────────────────
  const totalPaidParts = spend_summary
    ? formatINR(spend_summary.total_change_cost_delta, { sign: 'none' })
    : null
  // We don't have a "next payment" from SpendSummary, show change count instead

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + SPACE.sm,
        paddingHorizontal: SPACE.gutter,
        paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE,
        gap: SPACE.lg,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
      }
    >
      {/* ── Top bar: Logo + greeting + settings ───────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Logo size={40} />
          <BodyLg style={{ fontWeight: '600', marginTop: SPACE.sm }}>{greetingFor(t)}</BodyLg>
          <Small muted style={{ marginTop: 2 }} numberOfLines={1}>
            {property?.display_name
              ? `${property.display_name} · ${new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`
              : new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Small>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {/* Notification bell + unread badge → the in-app inbox */}
          <Link href="/(homeowner)/inbox" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
              hitSlop={8}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather name="bell" size={20} color={c.text} />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: c.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MonoSm style={{ color: '#fff', fontSize: 10 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </MonoSm>
                </View>
              ) : null}
            </Pressable>
          </Link>
          <Link href="/(homeowner)/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.settings}
              hitSlop={8}
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather name="settings" size={20} color={c.text} />
            </Pressable>
          </Link>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          CARD 1: Hero — clay top-accent, clay→surface gradient, serif
          answer, sub line, TimeBar, and two pills.
          Prototype: Card accent="clay" accentSide="top" + linear-gradient.
      ══════════════════════════════════════════════════════════════════ */}
      <FadeInUp>
        <View
          style={{
            backgroundColor: c.secondaryContainer,
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            borderTopWidth: 4,
            borderTopColor: clayMarker,
            padding: SPACE.lg,
            ...theme.shadowCard,
          } as ViewStyle}
        >
          {/* Eyebrow: "Today · all calm" */}
          <Eyebrow>{eyebrow}</Eyebrow>

          {/* Eczar serif headline ~36px — "You're okay." */}
          <Display
            accessibilityRole="header"
            style={{ marginTop: SPACE.xs, fontSize: 36, lineHeight: 48 }}
          >
            {answer}
          </Display>

          {/* Sub line — property name + stage */}
          {propertySubLine ? (
            <Body muted style={{ marginTop: SPACE.xs }}>
              {propertySubLine}
            </Body>
          ) : (
            <Body muted style={{ marginTop: SPACE.xs }}>
              {subline}
            </Body>
          )}

          {/* Phase 2 heartbeat — quiet proof-of-life: N photos this week + last
              update, tap → Photos. Hidden when the site has no photos yet. */}
          {lastPhotoAt ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={heartbeatText}
              onPress={() => router.push('/(homeowner)/photos')}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.xs,
                marginTop: SPACE.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="camera" size={14} color={clay} />
              <Small
                style={{
                  color: photosThisWeek > 0 ? c.text : c.textMute,
                  fontWeight: photosThisWeek > 0 ? '600' : '500',
                }}
              >
                {heartbeatText}
              </Small>
              <Feather name="chevron-right" size={14} color={c.textMute} style={{ marginLeft: 2 }} />
            </Pressable>
          ) : null}

          {/* TimeBar — start → handover with you-are-here dot */}
          {startLabel && endLabel ? (
            <TimeBar
              start={startLabel}
              end={endLabel}
              pct={pct}
              nowLabel={t.youAreHere}
            />
          ) : null}

          {/* Bottom row: On-track pill (left) + Needs pill (right) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACE.lg }}>
            <StatusPill
              status={state === 'quiet' ? 'quiet' : state === 'needs-attention' ? 'warn' : 'ok'}
              label={state === 'quiet' ? t.quietChip : state === 'needs-attention' ? t.needsYou : t.onTrack}
            />
            {needs_attention.length > 0 ? (
              <View style={{ marginLeft: 'auto' }}>
                <StatusPill
                  status="warn"
                  label={`${needs_attention.length} ${needs_attention.length === 1 ? 'choice' : 'choices'} for you`}
                />
              </View>
            ) : null}
          </View>
        </View>
      </FadeInUp>

      {/* ══════════════════════════════════════════════════════════════════
          CARD 2: NeedsInputCard — amber tint + amber accent bar
          Prototype: Card tint="amber" accent="amber"
          Hidden when needs_attention is empty.
      ══════════════════════════════════════════════════════════════════ */}
      {needs_attention.length > 0 ? (
        <FadeInUp delay={30}>
          <View
            style={{
              backgroundColor: amberTint,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              borderLeftWidth: 4,
              borderLeftColor: c.warn,
              padding: SPACE.lg,
              ...theme.shadowCard,
            } as ViewStyle}
          >
            {/* Card header: ⚡ Needs your input (N) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs }}>
              <Feather name="zap" size={18} color={amberText} />
              <Body style={{ color: amberText, fontWeight: '600' }}>
                {t.needsInputTitle} ({needs_attention.length})
              </Body>
            </View>

            {/* Item rows */}
            {needs_attention.map((item: AttentionItem, idx: number) => {
              const isLast = idx === needs_attention.length - 1
              return (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md - 1,
                    paddingVertical: SPACE.md - 1,
                    borderTopWidth: 1,
                    borderTopColor: `rgba(125, 90, 19, 0.14)`,
                  }}
                >
                  {/* Icon tile — amber tint */}
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: theme.radii.chip,
                      backgroundColor: amberAccentBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Feather name="clipboard" size={17} color={amberText} />
                  </View>

                  {/* Text */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={2} style={{ fontSize: 14.5, color: c.text }}>
                      {item.title}
                    </Body>
                    {item.detail ? (
                      <Small muted numberOfLines={1} style={{ marginTop: 1 }}>
                        {item.detail}
                      </Small>
                    ) : null}
                  </View>

                  {/* Soft amber "View" button */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/(homeowner)/decisions/${item.id}`)}
                    style={({ pressed }) => ({
                      height: 38,
                      paddingHorizontal: SPACE.md,
                      borderRadius: theme.radii.chip,
                      backgroundColor: amberAccentBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.75 : 1,
                      flexShrink: 0,
                    })}
                  >
                    <Small style={{ color: amberText, fontWeight: '600' }}>{t.needsInputView}</Small>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </FadeInUp>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          CARD 3: MilestonesCard — flush card (no default padding)
          Prototype: Card flush — clay eyebrow, target handover date,
          On-track pill + chevron; collapsed shows MilestoneStrip + clay "Now" box.
      ══════════════════════════════════════════════════════════════════ */}
      {/* Proactive Heads up — Site Health (schedule honesty + design fidelity). */}
      {headsUpQ.data && headsUpQ.data.cards.length > 0 ? (
        <FadeInUp delay={35}>
          <HeadsUpSection
            data={headsUpQ.data}
            busyId={respondM.isPending ? respondM.variables?.id : undefined}
            flagBusy={flagM.isPending}
            onRespond={(id, action) => {
              void Haptics.selectionAsync()
              respondM.mutate({ id, action })
            }}
            onFlag={() => flagM.mutate()}
          />
        </FadeInUp>
      ) : null}

      <FadeInUp delay={40}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.milestonesEyebrow}
          onPress={() => router.push('/(homeowner)/updates')}
        >
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              overflow: 'hidden',
              ...theme.shadowCard,
            } as ViewStyle}
          >
            {/* Header row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                padding: SPACE.lg,
                paddingBottom: SPACE.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <Eyebrow>{t.milestonesEyebrow}</Eyebrow>
                <Body style={{ marginTop: SPACE.xs, fontWeight: '600', color: c.text }}>
                  {t.milestonesHandover}
                  {handoverOn ? ` · ${handoverDate(handoverOn)}` : ''}
                </Body>
              </View>
              <StatusPill status="ok" label={t.onTrack} size="sm" />
              <Feather name="chevron-right" size={18} color={c.textMute} />
            </View>

            {/* Milestone strip + Foundation/Handover labels */}
            <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm }}>
              {milestones.length > 0 ? (
                <>
                  <MilestoneStrip milestones={milestones} nowLabel={t.milestonesNow} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs }}>
                    <Small muted>Foundation</Small>
                    <Small muted>Handover</Small>
                  </View>
                </>
              ) : null}

              {/* Clay "Now: {stage} · expected {date}" box */}
              {nowMilestone ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.sm,
                    marginTop: SPACE.md,
                    padding: SPACE.md - 2,
                    backgroundColor: c.secondaryContainer,
                    borderRadius: theme.radii.chip,
                  }}
                >
                  <Feather name="circle" size={16} color={clay} />
                  <Body style={{ color: c.text, flex: 1 }}>
                    <Body style={{ fontWeight: '700', color: c.text }}>
                      {t.milestonesNow}:{' '}
                    </Body>
                    {nowMilestone.name}
                    {nowExpected ? ` · ${t.milestonesExpected} ${nowExpected}` : ''}
                  </Body>
                  {(doneCount > 0 || toGoCount > 0) ? (
                    <Small muted style={{ whiteSpace: 'nowrap' } as ViewStyle}>
                      {doneCount} {t.milestonesDone} · {toGoCount} {t.milestonesToGo}
                    </Small>
                  ) : null}
                </View>
              ) : null}

              {/* "Tap to see the full timeline →" */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, marginTop: SPACE.md, marginBottom: SPACE.xs }}>
                <Small style={{ color: c.accent, fontWeight: '600' }}>{t.milestonesSeeTimeline}</Small>
                <Feather name="chevron-down" size={15} color={c.accent} />
              </View>
            </View>
          </View>
        </Pressable>
      </FadeInUp>

      {/* ══════════════════════════════════════════════════════════════════
          CARD 4: RequestsCard — "My requests (N open)"
          Prototype: Card with title + ListRows + "Add a request" + "See all".
          Hidden when no open requests.
      ══════════════════════════════════════════════════════════════════ */}
      {openRequests.length > 0 ? (
        <FadeInUp delay={50}>
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              padding: SPACE.lg,
              ...theme.shadowCard,
            } as ViewStyle}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
              <Body style={{ fontWeight: '600', color: c.text }}>
                {t.requestsTitle}{' '}
                <Body style={{ color: c.textMute, fontWeight: '500' }}>
                  ({openRequests.length} {t.requestsOpen})
                </Body>
              </Body>
            </View>

            {/* Request rows */}
            {openRequests.map((req, idx) => (
              <ListRow
                key={req.id}
                icon="message-square"
                title={req.title}
                subtitle={slaPromise(req, lang) || undefined}
                last={idx === openRequests.length - 1}
                onPress={() => router.push('/(homeowner)/requests')}
                right={
                  <StatusPill
                    status={REQUEST_STATUS_META[req.status]?.status ?? 'info'}
                    label={
                      lang === 'hi'
                        ? (REQUEST_STATUS_META[req.status]?.hi ?? req.status)
                        : (REQUEST_STATUS_META[req.status]?.en ?? req.status)
                    }
                    size="sm"
                  />
                }
              />
            ))}

            {/* Footer: "Add a request" (left) + "See all" (right) */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.sm }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(homeowner)/issue')}
                hitSlop={16}
                style={{ paddingVertical: 6, minHeight: 48, justifyContent: 'center' }}
              >
                <Small color={c.accent} style={{ fontWeight: '600' }}>+ {t.requestsAdd}</Small>
              </Pressable>
              <LinkRow
                label={t.requestsSeeAll}
                onPress={() => router.push('/(homeowner)/requests')}
              />
            </View>
          </View>
        </FadeInUp>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          CARD 5: ActivityCard — "Recent activity"
          Prototype: Card with camera icon + title + activity rows with
          photo thumbnails + "See all updates" link.
          Hidden when recent_activity is empty.
      ══════════════════════════════════════════════════════════════════ */}
      {recent_activity.length > 0 ? (
        <FadeInUp delay={60}>
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              padding: SPACE.lg,
              ...theme.shadowCard,
            } as ViewStyle}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <Feather name="camera" size={18} color={c.textMute} />
              <Body style={{ fontWeight: '600', color: c.text }}>{t.activityTitle}</Body>
            </View>

            {/* Activity rows — scrollable when there are more than 3, so the card
                stays calm but the recent feed feels alive (not a static 3). */}
            <ScrollView
              style={{ maxHeight: recent_activity.length > 3 ? 3 * 76 : undefined }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={recent_activity.length > 3}
              contentContainerStyle={{ gap: SPACE.md }}
            >
              {recent_activity.map((item: Update, idx: number) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => router.push('/(homeowner)/updates')}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    gap: SPACE.md,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  {/* Photo thumbnail — the real site photo when present, else a warm placeholder */}
                  {item.thumbnail_url ? (
                    <Image
                      source={{ uri: item.thumbnail_url }}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: theme.radii.chip,
                        flexShrink: 0,
                        backgroundColor: AP.surfaceContainer,
                      }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: theme.radii.chip,
                        backgroundColor: AP.surfaceContainer,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Feather name="camera" size={20} color={c.textMute} />
                    </View>
                  )}

                  {/* Text */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {item.published_at ? (
                      <Eyebrow style={{ fontSize: 10.5, marginBottom: 2 }}>
                        {shortDate(item.published_at) ?? ''}
                      </Eyebrow>
                    ) : null}
                    <Body numberOfLines={2} style={{ fontSize: 14.5 }}>{item.title}</Body>
                  </View>

                  {/* Chevron */}
                  <Feather name="chevron-right" size={16} color={c.textMute} />
                </Pressable>
              ))}
            </ScrollView>

            {/* Footer */}
            <View style={{ marginTop: SPACE.md }}>
              <LinkRow
                label={t.activitySeeAll}
                onPress={() => router.push('/(homeowner)/updates')}
              />
            </View>
          </View>
        </FadeInUp>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          CARD 6: PaymentsCard — membrane-gated, hidden when spend_summary null.
          Prototype: Card with wallet icon + two stat tiles + meta + "See payment
          schedule" link.
      ══════════════════════════════════════════════════════════════════ */}
      {spend_summary ? (
        <FadeInUp delay={70}>
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              padding: SPACE.lg,
              ...theme.shadowCard,
            } as ViewStyle}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <Feather name="credit-card" size={18} color={c.textMute} />
              <Body style={{ fontWeight: '600', color: c.text, flex: 1 }}>{t.paymentsTitle}</Body>
              <StatusPill status="ok" label={t.paymentsPreApproved} size="sm" />
            </View>

            {/* Two stat tiles */}
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              {/* Total paid */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: AP.surfaceLow,
                  borderRadius: theme.radii.chip,
                  padding: SPACE.md,
                }}
              >
                <Small muted>{t.paymentsTotalPaid}</Small>
                <Body
                  style={{
                    fontSize: 19,
                    fontWeight: '600',
                    color: c.text,
                    marginTop: SPACE.xs,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {totalPaidParts
                    ? `${totalPaidParts.currency}${totalPaidParts.value}`
                    : '—'}
                </Body>
              </View>

              {/* Change count tile — we don't have a "next payment" amount */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: AP.surfaceLow,
                  borderRadius: theme.radii.chip,
                  padding: SPACE.md,
                }}
              >
                <Small muted>Approved changes</Small>
                <Body
                  style={{
                    fontSize: 19,
                    fontWeight: '600',
                    color: c.text,
                    marginTop: SPACE.xs,
                  }}
                >
                  {spend_summary.change_count}
                </Body>
              </View>
            </View>

            {/* "See payment schedule" link */}
            <View style={{ marginTop: SPACE.md }}>
              <LinkRow
                label={t.paymentsSeeSchedule}
                onPress={() => router.push('/(homeowner)/updates')}
              />
            </View>
          </View>
        </FadeInUp>
      ) : null}
    </ScrollView>
  )
}
