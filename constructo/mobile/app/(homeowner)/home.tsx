/**
 * Homeowner Home — the flagship "Calm Cockpit" screen (handoff §5).
 *
 * One shell, three states — cards are CONDITIONAL (render only with content):
 *   - on-track:        LivingHomeHero (green chip) + StatusCard + ShortcutRail
 *                      + Latest-from-site strip + WeeklySummaryCard.
 *   - needs-attention: hero (amber chip, compact) + NeedsAttentionCard ABOVE
 *                      the StatusCard. One item at a time.
 *   - quiet:           hero (grey chip, compact) + the calm QuietCard explaining
 *                      the contractor-confirmed silence (never red, never pulse).
 *
 * The living-home hero IS the header (§2.3): a real photo, "CONSTRUCTO"
 * wordmark + an avatar/settings button — no standard top bar. Honest time-bar
 * only (never a %); premium Feather icons (never emoji); warm paper; red only
 * for genuine risk (§8).
 *
 * Keeps this screen's local `STR` (en/hi) table — the shared i18n catalog
 * migration is a separate WIP and is intentionally not adopted here.
 */
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../../src/api/client'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Button,
  CalmCard,
  HomeWidget,
  LivingHomeHero,
  NeedsAttentionCard,
  Screen,
  Small,
  StatusCard,
  WeeklySummaryCard,
  FLOATING_NAV_CLEARANCE,
  FadeInUp,
} from '../../src/ui'
import type { LivingHomeHeroStatusChip } from '../../src/ui'
import type { QuietPeriod } from '../../src/api/types'

const STR = {
  en: {
    settings: 'Open settings',
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    headline: 'Your home is taking shape.',
    headlineAttention: 'One thing needs you.',
    headlineQuiet: "It's quiet on site.",
    onTrack: 'On track',
    needsYou: 'Needs you',
    quietChip: 'Quiet',
    inProgress: 'In progress',
    started: 'Started',
    handover: 'Handover',
    startingSoon: 'Starting soon',
    progressBody: "Here's where your build stands today.",
    reviewed: 'Reviewed by site',
    nextUp: 'NEXT UP',
    latest: 'Latest from site',
    approvedChanges: 'APPROVED CHANGES',
    changeLine: '{n} change(s) recorded so far',
    askBuilder: 'Ask your builder',
    needsEyebrow: 'Needs you · 1 of 1',
    review: 'Review',
    allCalm: 'All calm today.',
    allCalmBodyFallback: 'Your site team is on it.',
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
  },
  hi: {
    settings: 'सेटिंग्स खोलें',
    morning: 'सुप्रभात',
    afternoon: 'नमस्ते',
    evening: 'शुभ संध्या',
    headline: 'आपका घर आकार ले रहा है।',
    headlineAttention: 'एक चीज़ को आपकी ज़रूरत है।',
    headlineQuiet: 'साइट पर अभी शांति है।',
    onTrack: 'सब ठीक चल रहा है',
    needsYou: 'आपकी ज़रूरत',
    quietChip: 'शांत',
    inProgress: 'चल रहा है',
    started: 'शुरू',
    handover: 'कब्ज़ा',
    startingSoon: 'जल्द शुरू',
    progressBody: 'आज आपके निर्माण की स्थिति यह है।',
    reviewed: 'साइट द्वारा जाँचा गया',
    nextUp: 'आगे',
    latest: 'साइट से ताज़ा',
    approvedChanges: 'मंज़ूर बदलाव',
    changeLine: 'अब तक {n} बदलाव दर्ज',
    askBuilder: 'बिल्डर से पूछें',
    needsEyebrow: 'आपकी ज़रूरत · 1 में से 1',
    review: 'देखें',
    allCalm: 'आज सब शांत है।',
    allCalmBodyFallback: 'आपकी साइट टीम काम पर है।',
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
  },
} as const

function greetingFor(g: { morning: string; afternoon: string; evening: string }): string {
  const h = new Date().getHours()
  if (h < 12) return g.morning
  if (h < 17) return g.afternoon
  return g.evening
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

/** "6 Jun" — calm short date for quiet-card next-expected display. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * QuietCard — a calm CalmCard explaining a confirmed quiet period.
 *
 * The `reason` text comes from the backend already in the user's language
 * (once H6.T translation is live). We render it as-is — never hardcode
 * English for dynamic backend strings. Static chrome (title, next-prefix)
 * uses the STR table. Mounts with a plain fade only (CalmCard never pulses).
 */
function QuietCard({ quiet, lang }: { quiet: QuietPeriod; lang: 'en' | 'hi' }) {
  const t = STR[lang]
  const nextDate = shortDate(quiet.next_expected_at)

  // Body: backend reason (already translated) + optional next-expected date.
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

export default function Home() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const t = STR[lang]

  const homeQ = useQuery({ queryKey: ['home'], queryFn: () => homeowner.home() })
  const photosQ = useQuery({ queryKey: ['home', 'photos'], queryFn: () => homeowner.photos() })
  const weeklyQ = useQuery({ queryKey: ['home', 'weekly'], queryFn: () => homeowner.weeklySummary() })

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
  const heroUri = photos[0]?.image_url
  const weekly = weeklyQ.data?.[0]

  const startOn = property?.started_on ?? null
  const handoverOn = property?.expected_handover_on ?? null
  const timeFrac = elapsedFraction(startOn, handoverOn)
  const frac = timeFrac ?? 0
  // Honest time-bar labels (no completion number — Hard Rule §8).
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

  // ---- Resolve the screen state → hero chip + headline. ----
  // Precedence: needs-attention > quiet > on-track (an exception always wins).
  const state: 'needs-attention' | 'quiet' | 'on-track' = firstAttention
    ? 'needs-attention'
    : quiet
      ? 'quiet'
      : 'on-track'

  const heroChip: LivingHomeHeroStatusChip =
    state === 'needs-attention'
      ? { tone: 'warn', icon: 'alert-triangle', label: t.needsYou }
      : state === 'quiet'
        ? { tone: 'quiet', icon: 'clock', label: t.quietChip }
        : { tone: 'ok', icon: 'check', label: t.onTrack }

  const headline =
    state === 'needs-attention'
      ? t.headlineAttention
      : state === 'quiet'
        ? t.headlineQuiet
        : t.headline

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}
    >
      {/* ---- Living-home hero (IS the header) ---- */}
      <LivingHomeHero
        imageUri={heroUri}
        greeting={greetingFor(t)}
        propertyName={property?.display_name}
        headline={headline}
        statusChip={heroChip}
        onAvatarHref="/(homeowner)/settings"
        avatarLabel={t.settings}
        startingSoonLabel={t.startingSoon}
        compact={state !== 'on-track'}
      />

      {/* ---- Overlapping content (StatusCard lifts ~24px into the hero) ---- */}
      <View style={{ paddingHorizontal: SPACE.gutter, gap: SPACE.md, marginTop: -24 }}>
        {/* Needs-attention card sits ABOVE the StatusCard, one item only. */}
        {state === 'needs-attention' && firstAttention ? (
          <NeedsAttentionCard
            eyebrow={t.needsEyebrow}
            title={firstAttention.title}
            context={firstAttention.detail}
            reviewLabel={t.review}
            href="/requests"
            accessibilityLabel={`${t.needsYou}: ${firstAttention.title}`}
          />
        ) : null}

        {/* Status card — honest TIME-BAR (never a %) + warm sentence + trust badge. */}
        <StatusCard
          milestoneTitle={milestone_now?.name ?? t.inProgress}
          statusSentence={statusSentence}
          reviewedLabel={t.reviewed}
          hasTimeline={hasTimeline}
          fraction={frac}
          startLabel={startLabel}
          endLabel={endLabel}
          tickFraction={tickFrac}
        />

        {/* Quiet card — explains the contractor-confirmed silence (no red/pulse). */}
        {state === 'quiet' && quiet ? <QuietCard quiet={quiet} lang={lang} /> : null}

        {/* ---- ShortcutRail row 1: Next Up + Latest photos ---- */}
        {milestone_next || photos.length > 0 ? (
          <FadeInUp style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {milestone_next ? (
              <HomeWidget
                eyebrow={t.nextUp}
                primary={milestone_next.name}
                secondary={
                  milestone_next.expected_on ? `~${monthYear(milestone_next.expected_on) ?? ''}` : undefined
                }
                bgColor={c.accent}
                href="/(homeowner)/updates"
                accessibilityLabel={`${t.nextUp}: ${milestone_next.name}`}
              />
            ) : null}
            {photos.length > 0 ? (
              <HomeWidget
                eyebrow={t.latest}
                primary={t.latestCount.replace('{n}', String(photos.length))}
                secondary={t.thisWeek}
                bgImageUri={photos[0]?.image_url}
                href="/(homeowner)/photos"
                accessibilityLabel={`${photos.length} site photos — view gallery`}
              />
            ) : null}
          </FadeInUp>
        ) : null}

        {/* ---- ShortcutRail row 2: Approved Changes + Ask Builder ---- */}
        <FadeInUp delay={40} style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {spend_summary && spend_summary.change_count > 0 ? (
            <HomeWidget
              eyebrow={t.approvedChanges}
              primary={formatRupees(spend_summary.total_change_cost_delta)}
              secondary={t.changeLine.replace('{n}', String(spend_summary.change_count))}
              href="/(homeowner)/updates"
              accessibilityLabel={`${spend_summary.change_count} approved changes totalling ${formatRupees(spend_summary.total_change_cost_delta)}`}
            />
          ) : null}
          {/* Ask Builder — always present as anchor */}
          <HomeWidget
            eyebrow={t.askShort}
            primary={t.askBuilder}
            secondary={t.askVoice}
            href="/ask"
            accessibilityLabel={t.askBuilder}
          />
        </FadeInUp>

        {/* ---- Weekly summary (warm-clay) — Home only, when a letter exists ---- */}
        {weekly?.text ? (
          <FadeInUp delay={80}>
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
      </View>
    </ScrollView>
  )
}
