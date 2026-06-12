/**
 * Homeowner Home — the flagship "Calm Cockpit" screen, Direction C ("Blend").
 *
 * The product's one job is REASSURE → earned absence: open it, learn "you're
 * okay — nothing needs you today," close it calm. So Home LEADS WITH THE ANSWER
 * on open warm sand — a clay "TODAY" eyebrow + the serif (Eczar) 3-second answer
 * + a reassuring line + a status pill — NOT a photo-over-text hero (that was the
 * superseded direction). The living-home warmth returns as a real-photo "latest
 * from site" strip lower down (evidence, never an AI/3D render — §8).
 *
 * One shell, three states — cards are CONDITIONAL (render only with content):
 *   - on-track:        answer ("You're okay.") + StatusCard time-bar
 *                      + latest-from-site photo + shortcut tiles + weekly letter.
 *   - needs-attention: amber answer + the signature DecisionCard (a pre-briefed
 *                      choice, never red) ABOVE the time-bar. One item at a time.
 *   - quiet:           muted answer + QuietCard explaining the contractor-
 *                      confirmed silence (never red, never pulse).
 *
 * Honest time-bar only (never a %); premium Feather icons (never emoji); warm
 * sand canvas; red only for genuine risk. Keeps this screen's local `STR`
 * (en/hi) table — the shared i18n catalog migration is a separate WIP.
 */
import { Pressable, ScrollView, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../../src/api/client'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../src/theme/tokens'
import {
  Body,
  BodyLg,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  DecisionCard,
  Display,
  Eyebrow,
  FadeInUp,
  HomeWidget,
  ListRow,
  MilestoneStrip,
  PhotoTile,
  Screen,
  Small,
  StatusCard,
  StatusPill,
  WeeklySummaryCard,
  FLOATING_NAV_CLEARANCE,
} from '../../src/ui'
import type { PhotoTileData } from '../../src/ui'
import type { AttentionItem, QuietPeriod } from '../../src/api/types'
import { REQUEST_STATUS_META, slaPromise } from '../_requests.util'

const STR = {
  en: {
    finishesEyebrow: 'YOUR FINISHES',
    finishesLabel: 'Your finishes',
    finishesSub: 'Room-by-room choices for your home',
    settings: 'Open settings',
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    today: 'Today',
    // The 3-second answer (Eczar serif), per state.
    answerOk: "You're okay.",
    answerAttention: 'One thing for you.',
    answerQuiet: 'All quiet on site.',
    // The reassuring line under the answer.
    subOk: "Nothing needs you today. We'll tell you the moment it does.",
    subAttention: 'Take a look when you have a minute — no rush.',
    subQuiet: 'Your site team is on it. Calm is good news.',
    onTrack: 'On track',
    needsYou: 'Needs you',
    quietChip: 'Quiet',
    inProgress: 'In progress',
    started: 'Started',
    handover: 'Handover',
    startingSoon: 'Starting soon',
    progressBody: "Here's where your build stands today.",
    reviewed: 'Reviewed by site',
    youAreHere: 'you are here',
    nextUp: 'NEXT UP',
    latest: 'Latest from site',
    latestFromSite: 'LATEST FROM SITE',
    approvedChanges: 'APPROVED CHANGES',
    changeLine: '{n} change(s) recorded so far',
    askBuilder: 'Ask your builder',
    review: 'Review',
    latestCount: '{n} photos',
    thisWeek: 'This week',
    thisWeekEyebrow: 'This week',
    listen: 'Listen',
    readLetter: 'Read the full letter',
    askShort: 'ASK',
    askVoice: 'Ask by voice',
    errorLine: "Couldn't load your home.",
    tryAgain: 'Try again',
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next update expected around',
    // PhotoTile a11y/action labels.
    captionFallback: 'Site photo',
    save: 'Save',
    share: 'Share',
    hide: 'Hide',
    videoLabel: 'Video',
    savedLabel: 'Saved',
    // B1 — Needs your input
    needsInputEyebrow: 'NEEDS YOUR INPUT',
    needsInputReview: 'Review',
    needsInputSeeAll: 'See all',
    // B2 — Milestone strip
    milestonesEyebrow: 'YOUR MILESTONES',
    milestonesTitle: 'Build milestones',
    milestonesSub: 'Tap to see the full timeline',
    milestoneNow: 'Now',
    // B3 — My requests
    requestsEyebrow: 'MY REQUESTS',
    requestsTitle: 'Your requests',
    requestsSeeAll: 'See all',
    requestsAdd: 'Add a request',
    requestsEmpty: 'No open requests',
    // B4 — Recent activity
    activityEyebrow: 'RECENT ACTIVITY',
    activityTitle: 'Latest from your team',
    activitySeeAll: 'See photos',
    activityEmpty: 'No recent activity',
  },
  hi: {
    finishesEyebrow: 'आपकी सामग्री',
    finishesLabel: 'आपकी फ़िनिश',
    finishesSub: 'घर के हर कमरे के लिए चुनी गई सामग्री',
    settings: 'सेटिंग्स खोलें',
    morning: 'सुप्रभात',
    afternoon: 'नमस्ते',
    evening: 'शुभ संध्या',
    today: 'आज',
    answerOk: 'सब ठीक है।',
    answerAttention: 'आपके लिए एक बात।',
    answerQuiet: 'साइट पर शांति है।',
    subOk: 'आज आपकी कोई ज़रूरत नहीं। जैसे ही होगी, हम बता देंगे।',
    subAttention: 'फ़ुरसत में एक नज़र डाल लें — कोई जल्दी नहीं।',
    subQuiet: 'आपकी साइट टीम काम पर है। शांति अच्छी ख़बर है।',
    onTrack: 'सब ठीक चल रहा है',
    needsYou: 'आपकी ज़रूरत',
    quietChip: 'शांत',
    inProgress: 'चल रहा है',
    started: 'शुरू',
    handover: 'कब्ज़ा',
    startingSoon: 'जल्द शुरू',
    progressBody: 'आज आपके निर्माण की स्थिति यह है।',
    reviewed: 'साइट द्वारा जाँचा गया',
    youAreHere: 'आप यहाँ हैं',
    nextUp: 'आगे',
    latest: 'साइट से ताज़ा',
    latestFromSite: 'साइट से ताज़ा',
    approvedChanges: 'मंज़ूर बदलाव',
    changeLine: 'अब तक {n} बदलाव दर्ज',
    askBuilder: 'बिल्डर से पूछें',
    review: 'देखें',
    latestCount: '{n} फ़ोटो',
    thisWeek: 'इस हफ़्ते',
    thisWeekEyebrow: 'इस हफ़्ते',
    listen: 'सुनें',
    readLetter: 'पूरा पत्र पढ़ें',
    askShort: 'सवाल?',
    askVoice: 'बोलकर पूछें',
    errorLine: 'आपका घर लोड नहीं हो सका।',
    tryAgain: 'फिर कोशिश करें',
    quietTitle: 'अभी साइट पर शांति है',
    quietNextPrefix: 'अगला अपडेट लगभग',
    captionFallback: 'साइट फ़ोटो',
    save: 'सहेजें',
    share: 'साझा करें',
    hide: 'छिपाएँ',
    videoLabel: 'वीडियो',
    savedLabel: 'सहेजा गया',
    // B1 — Needs your input
    needsInputEyebrow: 'आपकी ज़रूरत',
    needsInputReview: 'देखें',
    needsInputSeeAll: 'सब देखें',
    // B2 — Milestone strip
    milestonesEyebrow: 'आपके पड़ाव',
    milestonesTitle: 'निर्माण पड़ाव',
    milestonesSub: 'पूरी टाइमलाइन देखने के लिए टैप करें',
    milestoneNow: 'अभी',
    // B3 — My requests
    requestsEyebrow: 'मेरे अनुरोध',
    requestsTitle: 'आपके अनुरोध',
    requestsSeeAll: 'सब देखें',
    requestsAdd: 'अनुरोध जोड़ें',
    requestsEmpty: 'कोई खुला अनुरोध नहीं',
    // B4 — Recent activity
    activityEyebrow: 'हालिया गतिविधि',
    activityTitle: 'आपकी टीम से ताज़ा',
    activitySeeAll: 'फ़ोटो देखें',
    activityEmpty: 'कोई हालिया गतिविधि नहीं',
  },
} as const

function greetingFor(g: { morning: string; afternoon: string; evening: string }): string {
  const h = new Date().getHours()
  if (h < 12) return g.morning
  if (h < 17) return g.afternoon
  return g.evening
}

/** "Friday, 7 June" — a calm, single-language date line for the top bar. */
function weekdayDate(lang: 'en' | 'hi'): string {
  return new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Elapsed fraction of the build (started → handover), clamped 0..1. */
function elapsedFraction(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!(e > s)) return null
  const frac = (Date.now() - s) / (e - s)
  return Math.max(0, Math.min(1, frac))
}

/** Where a target date falls on the (start → end) timeline, clamped 0..1.
 *  Drives the next-milestone tick on the SettleBar. */
function fractionAt(start: string | null, end: string | null, target: string | null): number | null {
  if (!start || !end || !target) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const t = new Date(target).getTime()
  if (!(e > s)) return null
  return Math.max(0, Math.min(1, (t - s) / (e - s)))
}

/** "14 Jan" — a calm day+month with no year (the bar already implies the span). */
function dayMonth(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "6 Jun" — calm short date for quiet-card / photo display. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * QuietCard — a calm CalmCard explaining a confirmed quiet period.
 *
 * The `reason` text comes from the backend already in the user's language. We
 * render it as-is — never hardcode English for dynamic backend strings. Static
 * chrome (title, next-prefix) uses the STR table. Mounts with a plain fade only
 * (CalmCard never pulses).
 */
function QuietCard({ quiet, lang }: { quiet: QuietPeriod; lang: 'en' | 'hi' }) {
  const t = STR[lang]
  const nextDate = shortDate(quiet.next_expected_at)

  const bodyParts: string[] = []
  if (quiet.reason) bodyParts.push(quiet.reason)
  if (nextDate) bodyParts.push(`${t.quietNextPrefix} ${nextDate}.`)
  const body = bodyParts.join(' ') || undefined

  // §3.6: quiet-period card mounts with a plain fade only — never a rise/pulse.
  return (
    <FadeInUp rise={false} linear>
      <CalmCard status="quiet" title={t.quietTitle} body={body} />
    </FadeInUp>
  )
}

function formatRupees(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function monthYear(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** "26 May – 1 Jun" — the 7-day window of a weekly summary, from its week_start. */
function weekRange(weekStart: string): string | null {
  const s = new Date(weekStart)
  if (Number.isNaN(s.getTime())) return null
  const e = new Date(s)
  e.setDate(e.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(s)} – ${fmt(e)}`
}

/** The small status badge beside the answer (sage/amber/muted circle + glyph). */
function AnswerBadge({ tone, icon }: { tone: Status; icon: React.ComponentProps<typeof Feather>['name'] }) {
  const { theme } = useTheme()
  const bg = theme.colors[tone]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        // soft tone halo (never harsh)
        shadowColor: bg,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      }}
    >
      <Feather name={icon} size={26} color="#ffffff" />
    </View>
  )
}

export default function Home() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const t = STR[lang]

  const homeQ = useQuery({ queryKey: ['home'], queryFn: () => homeowner.home() })
  const photosQ = useQuery({ queryKey: ['home', 'photos'], queryFn: () => homeowner.photos() })
  const weeklyQ = useQuery({ queryKey: ['home', 'weekly'], queryFn: () => homeowner.weeklySummary() })
  // B2 — milestone strip (only fire if home query succeeded; skip on error)
  const milestonesQ = useQuery({
    queryKey: ['home', 'milestones'],
    queryFn: () => homeowner.milestones(),
    enabled: homeQ.isSuccess,
  })
  // B3 — my requests (open only; only fire if home query succeeded)
  const requestsQ = useQuery({
    queryKey: ['home', 'requests'],
    queryFn: () => homeowner.requests(),
    enabled: homeQ.isSuccess,
  })

  if (homeQ.isLoading) {
    return (
      <Screen>
        <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
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

  const { property, milestone_now, milestone_next, needs_attention, recent_activity, spend_summary, quiet } =
    homeQ.data
  const photos = photosQ.data?.items ?? []
  const latest = photos[0]
  const weekly = weeklyQ.data?.[0]
  // B2 — milestones for the strip
  const milestones = milestonesQ.data ?? []
  // B3 — open requests (not done)
  const openRequests = (requestsQ.data ?? []).filter((r) => r.status !== 'done').slice(0, 3)

  const startOn = property?.started_on ?? null
  const handoverOn = property?.expected_handover_on ?? null
  const timeFrac = elapsedFraction(startOn, handoverOn)
  const frac = timeFrac ?? 0
  const hasTimeline = timeFrac !== null
  const startLabel = `${t.started} ${dayMonth(startOn) ?? ''}`.trim()
  const handoverMonth = handoverOn
    ? new Date(handoverOn).toLocaleDateString('en-GB', { month: 'short' })
    : null
  const endLabel = handoverMonth ? `${t.handover} ~${handoverMonth}` : t.handover
  const tickFrac = fractionAt(startOn, handoverOn, milestone_next?.expected_on ?? null)

  const firstAttention = needs_attention[0]
  const statusSentence =
    milestone_now?.name ? recent_activity[0]?.body ?? t.progressBody : t.progressBody

  // ---- Resolve the screen state. Exception always wins: needs > quiet > ok. ----
  const state: 'needs-attention' | 'quiet' | 'on-track' = firstAttention
    ? 'needs-attention'
    : quiet
      ? 'quiet'
      : 'on-track'

  const answer =
    state === 'needs-attention' ? t.answerAttention : state === 'quiet' ? t.answerQuiet : t.answerOk
  const subline =
    state === 'needs-attention' ? t.subAttention : state === 'quiet' ? t.subQuiet : t.subOk
  const badge: { tone: Status; icon: React.ComponentProps<typeof Feather>['name'] } =
    state === 'needs-attention'
      ? { tone: 'warn', icon: 'bell' }
      : state === 'quiet'
        ? { tone: 'quiet', icon: 'clock' }
        : { tone: 'ok', icon: 'check' }
  const pillStatus: Status = state === 'needs-attention' ? 'warn' : state === 'quiet' ? 'quiet' : 'ok'
  const pillLabel = state === 'needs-attention' ? t.needsYou : state === 'quiet' ? t.quietChip : t.onTrack

  const latestPhoto: PhotoTileData | null = latest
    ? {
        id: latest.id,
        imageUri: latest.image_url,
        caption: latest.caption,
        room: latest.room_tag,
        date: shortDate(latest.published_at),
        starred: latest.is_starred,
      }
    : null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + SPACE.sm,
        paddingHorizontal: SPACE.gutter,
        paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE,
        gap: SPACE.lg,
      }}
    >
      {/* ---- Top bar: greeting + date (left) · settings (right). No photo hero. ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <BodyLg style={{ fontWeight: '600' }}>{greetingFor(t)}</BodyLg>
          <Small muted style={{ marginTop: 2 }} numberOfLines={1}>
            {property?.display_name ? `${property.display_name} · ${weekdayDate(lang)}` : weekdayDate(lang)}
          </Small>
        </View>
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

      {/* ---- The answer on open sand — the 3-second REASSURE moment. ---- */}
      <FadeInUp style={{ gap: SPACE.md, marginTop: SPACE.xs }}>
        <AnswerBadge tone={badge.tone} icon={badge.icon} />
        <View style={{ gap: SPACE.xs }}>
          <Eyebrow>{t.today}</Eyebrow>
          <Display
            accessibilityRole="header"
            accessibilityLabel={`${answer} ${subline}`}
          >
            {answer}
          </Display>
        </View>
        <BodyLg muted numberOfLines={3}>
          {subline}
        </BodyLg>
        <StatusPill status={pillStatus} label={pillLabel} />
      </FadeInUp>

      {/* ---- Needs-you: the signature DecisionCard (calm amber, one item). ---- */}
      {state === 'needs-attention' && firstAttention ? (
        <FadeInUp>
          <DecisionCard
            eyebrow={t.needsYou}
            title={firstAttention.title}
            whenLabel={firstAttention.detail ?? undefined}
            reviewLabel={t.review}
            onReview={() => router.push('/requests')}
            style={{ borderRadius: theme.radii.card }}
          />
        </FadeInUp>
      ) : null}

      {/* ---- Honest TIME-BAR (never a %) + current phase + reassuring sentence. ---- */}
      <FadeInUp delay={40}>
        <StatusCard
          milestoneTitle={milestone_now?.name ?? t.inProgress}
          statusSentence={statusSentence}
          reviewedLabel={t.reviewed}
          hasTimeline={hasTimeline}
          fraction={frac}
          startLabel={startLabel}
          endLabel={endLabel}
          tickFraction={tickFrac}
          youAreHereLabel={t.youAreHere}
        />
      </FadeInUp>

      {/* ---- Quiet: explain the contractor-confirmed silence (no red/pulse). ---- */}
      {state === 'quiet' && quiet ? <QuietCard quiet={quiet} lang={lang} /> : null}

      {/* ==== B1: All "Needs your input" items (multi-item, conditional). ====
          The existing DecisionCard above shows only the first item for the quick
          reassure. This block renders ALL items for completeness, but only when
          there are MORE than one (to avoid duplication when there's just one).
          Each routes to /(homeowner)/decisions/[id]. */}
      {needs_attention.length > 1 ? (
        <FadeInUp delay={50}>
          <Card>
            <View style={{ gap: SPACE.sm }}>
              <Eyebrow>{t.needsInputEyebrow}</Eyebrow>
              {needs_attention.map((item: AttentionItem, idx: number) => {
                const isLast = idx === needs_attention.length - 1
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => router.push(`/(homeowner)/decisions/${item.id}`)}
                    style={({ pressed }) => ({
                      paddingVertical: SPACE.md,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: c.line,
                      opacity: pressed ? 0.85 : 1,
                      gap: SPACE.xs,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md }}>
                      <BodyStrong style={{ flex: 1, color: c.warn }}>{item.title}</BodyStrong>
                      <Feather name="chevron-right" size={18} color={c.accent} />
                    </View>
                    {item.detail ? <Small muted numberOfLines={1}>{item.detail}</Small> : null}
                  </Pressable>
                )
              })}
            </View>
          </Card>
        </FadeInUp>
      ) : null}

      {/* ==== B2: Milestone strip card (conditional — when milestones exist). ==== */}
      {milestones.length > 0 ? (
        <FadeInUp delay={55}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.milestonesTitle}
            onPress={() => router.push('/(homeowner)/updates')}
          >
            <Card style={{ gap: SPACE.sm }}>
              <Eyebrow>{t.milestonesEyebrow}</Eyebrow>
              <MilestoneStrip milestones={milestones} nowLabel={t.milestoneNow} />
              <Small color={c.accent} style={{ fontWeight: '600', marginTop: SPACE.xs }}>
                {t.milestonesSub} →
              </Small>
            </Card>
          </Pressable>
        </FadeInUp>
      ) : null}

      {/* ==== B3: "My requests" card (conditional — when open requests exist). ====
          Shows up to 3 open requests with status pills; See all → requests screen. */}
      {openRequests.length > 0 ? (
        <FadeInUp delay={62}>
          <Card style={{ gap: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.sm }}>
              <Eyebrow>{t.requestsEyebrow}</Eyebrow>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.requestsSeeAll}
                onPress={() => router.push('/(homeowner)/requests')}
                hitSlop={16}
                style={{ paddingVertical: 6 }}
              >
                <Small color={c.accent} style={{ fontWeight: '600' }}>{t.requestsSeeAll}</Small>
              </Pressable>
            </View>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.requestsAdd}
              onPress={() => router.push('/(homeowner)/issue')}
              hitSlop={16}
              style={{ marginTop: SPACE.sm, paddingVertical: 6, minHeight: 48, justifyContent: 'center' }}
            >
              <Small color={c.accent} style={{ fontWeight: '600' }}>+ {t.requestsAdd}</Small>
            </Pressable>
          </Card>
        </FadeInUp>
      ) : null}

      {/* ==== B4: "Recent activity" compact list (conditional). ====
          Up to 3 recent_activity updates from home payload. Compact, no second
          big photo hero — the hero PhotoTile below is kept as the one visual anchor. */}
      {recent_activity.length > 0 ? (
        <FadeInUp delay={68}>
          <Card style={{ gap: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.sm }}>
              <Eyebrow>{t.activityEyebrow}</Eyebrow>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.activitySeeAll}
                onPress={() => router.push('/(homeowner)/photos')}
                hitSlop={16}
                style={{ paddingVertical: 6 }}
              >
                <Small color={c.accent} style={{ fontWeight: '600' }}>{t.activitySeeAll}</Small>
              </Pressable>
            </View>
            {recent_activity.slice(0, 3).map((item, idx) => (
              <ListRow
                key={item.id}
                icon="activity"
                title={item.title}
                subtitle={item.body ?? undefined}
                last={idx === Math.min(recent_activity.length - 1, 2)}
                statusTone={
                  item.type === 'milestone' ? 'ok'
                  : item.type === 'delay' ? 'risk'
                  : item.type === 'decision_needed' ? 'warn'
                  : 'info'
                }
              />
            ))}
          </Card>
        </FadeInUp>
      ) : null}

      {/* ---- Latest from site — real photo, keeps the home feeling alive. ---- */}
      {latestPhoto ? (
        <FadeInUp delay={60} style={{ gap: SPACE.sm }}>
          <Eyebrow>{t.latestFromSite}</Eyebrow>
          <PhotoTile
            photo={latestPhoto}
            variant="hero"
            onPress={() => router.push('/(homeowner)/photos')}
            labels={{
              caption: t.captionFallback,
              translate: t.askBuilder,
              save: t.save,
              share: t.share,
              hide: t.hide,
              video: t.videoLabel,
              starred: t.savedLabel,
            }}
          />
        </FadeInUp>
      ) : null}

      {/* ---- Shortcut tiles: Next up · Changes · Ask (Photos lives above). ---- */}
      <FadeInUp delay={80} style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {milestone_next ? (
          <HomeWidget
            eyebrow={t.nextUp}
            primary={milestone_next.name}
            secondary={milestone_next.expected_on ? `~${monthYear(milestone_next.expected_on) ?? ''}` : undefined}
            bgColor={c.accent}
            href="/(homeowner)/updates"
            accessibilityLabel={`${t.nextUp}: ${milestone_next.name}`}
          />
        ) : null}
        {spend_summary && spend_summary.change_count > 0 ? (
          <HomeWidget
            eyebrow={t.approvedChanges}
            primary={formatRupees(spend_summary.total_change_cost_delta)}
            secondary={t.changeLine.replace('{n}', String(spend_summary.change_count))}
            href="/(homeowner)/updates"
            accessibilityLabel={`${spend_summary.change_count} approved changes totalling ${formatRupees(spend_summary.total_change_cost_delta)}`}
          />
        ) : null}
      </FadeInUp>

      {/* Ask your builder — always present as a calm anchor. */}
      <FadeInUp delay={100} style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <HomeWidget
          eyebrow={t.askShort}
          primary={t.askBuilder}
          secondary={t.askVoice}
          href="/ask"
          accessibilityLabel={t.askBuilder}
        />
      </FadeInUp>

      {/* ---- Finishes — calm entry to the room-by-room finishes screen. ---- */}
      <FadeInUp delay={110}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.finishesLabel}
          onPress={() => router.push('/(homeowner)/finishes')}
        >
          <CalmCard
            status="ok"
            eyebrow={t.finishesEyebrow}
            title={t.finishesLabel}
            body={t.finishesSub}
            trailing={
              <Feather name="chevron-right" size={20} color={c.accent} />
            }
          />
        </Pressable>
      </FadeInUp>

      {/* ---- Weekly summary letter (warm-clay) — when one exists. ---- */}
      {weekly?.text ? (
        <FadeInUp delay={120}>
          <WeeklySummaryCard
            eyebrowPrefix={t.thisWeekEyebrow}
            rangeLabel={weekRange(weekly.week_start) ?? ''}
            summary={weekly.text}
            listenLabel={t.listen}
            readMoreLabel={t.readLetter}
            readMoreHref="/(homeowner)/updates"
            lang={lang}
          />
        </FadeInUp>
      ) : null}
    </ScrollView>
  )
}
