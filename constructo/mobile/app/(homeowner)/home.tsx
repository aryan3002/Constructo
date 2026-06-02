/**
 * Homeowner Home — the "Architectural Precision" dashboard (Stitch design).
 *
 * A full-bleed hero photo with the property name + reassuring headline, an
 * overlapping progress-ring card, a deep-teal "Next up" card, a horizontal
 * "Latest from site" gallery, an approved-changes summary, and the "Ask your
 * builder" CTA. All wired to real homeowner data; sections hide when empty.
 *
 * H6: renders a quiet card when home.quiet is present (contractor-confirmed
 * quiet period — explains silence calmly instead of leaving the feed blank).
 */
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Link } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { homeowner } from '../../src/api/client'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  H2,
  HomeWidget,
  Micro,
  Screen,
  SettleBar,
  Small,
} from '../../src/ui'
import type { QuietPeriod } from '../../src/api/types'

const STR = {
  en: {
    settings: 'Settings',
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    headline: 'Your home is taking shape.',
    onTrack: 'On track',
    inProgress: 'In progress',
    started: 'Started',
    handover: 'Handover',
    progressBody: "Here's where your build stands today.",
    nextUp: 'NEXT UP',
    latest: 'Latest from site',
    approvedChanges: 'APPROVED CHANGES',
    changeLine: '{n} change(s) recorded so far',
    askBuilder: 'Ask your builder',
    needs: 'Needs your attention',
    review: 'Review',
    allCalm: 'All calm tonight.',
    allCalmBodyFallback: 'Your site team is on it.',
    latestCount: '{n} photos',
    thisWeek: 'this week',
    askShort: 'ASK',
    askVoice: 'Ask by voice',
    errorLine: "Couldn't load your home.",
    tryAgain: 'Try again',
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next update expected around',
  },
  hi: {
    settings: 'सेटिंग्स',
    morning: 'सुप्रभात',
    afternoon: 'नमस्ते',
    evening: 'शुभ संध्या',
    headline: 'आपका घर आकार ले रहा है।',
    onTrack: 'सब ठीक चल रहा है',
    inProgress: 'चल रहा है',
    started: 'शुरू',
    handover: 'कब्ज़ा',
    progressBody: 'आज आपके निर्माण की स्थिति यह है।',
    nextUp: 'आगे',
    latest: 'साइट से ताज़ा',
    approvedChanges: 'मंज़ूर बदलाव',
    changeLine: 'अब तक {n} बदलाव दर्ज',
    askBuilder: 'बिल्डर से पूछें',
    needs: 'आपके ध्यान की ज़रूरत',
    review: 'देखें',
    allCalm: 'आज सब शांत है।',
    allCalmBodyFallback: 'आपकी साइट टीम काम पर है।',
    latestCount: '{n} फ़ोटो',
    thisWeek: 'इस हफ़्ते',
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
 * uses the STR table.
 */
function QuietCard({ quiet, lang }: { quiet: QuietPeriod; lang: 'en' | 'hi' }) {
  const t = STR[lang]
  const nextDate = shortDate(quiet.next_expected_at)

  // Body: backend reason (already translated) + optional next-expected date.
  const bodyParts: string[] = []
  if (quiet.reason) bodyParts.push(quiet.reason)
  if (nextDate) bodyParts.push(`${t.quietNextPrefix} ${nextDate}.`)
  const body = bodyParts.join(' ') || undefined

  return (
    <CalmCard
      status="info"
      title={t.quietTitle}
      body={body}
    />
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

export default function Home() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const t = STR[lang]

  const homeQ = useQuery({ queryKey: ['home'], queryFn: () => homeowner.home() })
  const photosQ = useQuery({ queryKey: ['home', 'photos'], queryFn: () => homeowner.photos() })

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

  const startOn = property?.started_on ?? null
  const handoverOn = property?.expected_handover_on ?? null
  const timeFrac = elapsedFraction(startOn, handoverOn)
  const frac = timeFrac ?? 0
  const handover = monthYear(handoverOn)
  // Honest time-bar labels (no completion number — Hard Rule #4).
  const hasTimeline = timeFrac !== null
  const startLabel = `${t.started} ${dayMonth(startOn) ?? ''}`.trim()
  const handoverMonth = handoverOn
    ? new Date(handoverOn).toLocaleDateString('en-GB', { month: 'short' })
    : null
  const endLabel = handoverMonth ? `${t.handover} ~${handoverMonth}` : t.handover
  const tickFrac = fractionAt(startOn, handoverOn, milestone_next?.expected_on ?? null)
  const firstAttention = needs_attention[0]
  const progressBody =
    milestone_now?.name ? recent_activity[0]?.body ?? t.progressBody : t.progressBody

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xl }}
    >
      {/* ---- Hero ---- */}
      <View style={{ height: 360 }}>
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.accent }]} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Top bar overlay */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 6,
            left: SPACE.lg,
            right: SPACE.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Small color="#ffffff" style={{ letterSpacing: 3, fontWeight: '700' }}>
            CONSTRUCTO
          </Small>
          <Link href="/(homeowner)/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.settings}
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="settings" size={20} color="#ffffff" />
            </Pressable>
          </Link>
        </View>

        {/* Hero text */}
        <View style={{ position: 'absolute', left: SPACE.lg, right: SPACE.lg, bottom: 40 }}>
          <Small color="rgba(255,255,255,0.92)">{greetingFor(t)}</Small>
          {property?.display_name ? (
            <Micro color="rgba(255,255,255,0.82)" style={{ letterSpacing: 2, marginTop: 2 }}>
              {property.display_name.toUpperCase()}
            </Micro>
          ) : null}
          <Display color="#ffffff" style={{ marginTop: SPACE.sm }}>
            {t.headline}
          </Display>
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              marginTop: SPACE.md,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255,255,255,0.18)',
              paddingHorizontal: SPACE.md,
              paddingVertical: 6,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AP.chip }} />
            <Micro color="#ffffff">
              {t.onTrack}
              {handover ? ` · ${handover}` : ''}
            </Micro>
          </View>
        </View>
      </View>

      {/* ---- Overlapping content ---- */}
      <View style={{ paddingHorizontal: SPACE.lg, gap: SPACE.md, marginTop: -28 }}>
        {/* Status card — honest TIME-BAR (never a %), warm sentence below. */}
        <Card style={{ gap: SPACE.md }}>
          <H2>{milestone_now?.name ?? t.inProgress}</H2>
          {hasTimeline ? (
            <SettleBar
              fraction={frac}
              startLabel={startLabel}
              endLabel={endLabel}
              tickFraction={tickFrac}
              color={c.accent}
              trackColor={AP.ringTrack}
              labelColor={c.textMute}
            />
          ) : null}
          <Body muted numberOfLines={4}>
            {progressBody}
          </Body>
        </Card>

        {/* Needs your attention (calm, one at a time) — or quiet / "all calm" empty state */}
        {firstAttention ? (
          <Link href="/requests" asChild>
            <Pressable>
              <Card style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
                <Micro muted style={{ letterSpacing: 1 }}>
                  {t.needs.toUpperCase()}
                </Micro>
                <BodyStrong style={{ marginTop: SPACE.xs }}>{firstAttention.title}</BodyStrong>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.xs,
                    marginTop: SPACE.sm,
                  }}
                >
                  <Small color={c.accent}>{t.review}</Small>
                  <Feather name="arrow-right" size={14} color={c.accent} />
                </View>
              </Card>
            </Pressable>
          </Link>
        ) : quiet ? (
          <QuietCard quiet={quiet} lang={lang} />
        ) : (
          // HomeOut does not carry company_name — use generic "your site team" fallback.
          <CalmCard
            status="ok"
            title={t.allCalm}
            body={t.allCalmBodyFallback}
          />
        )}

        {/* ---- Widget Row 1: Next Up + Latest Photos ---- */}
        {(milestone_next || photos.length > 0) ? (
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
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
          </View>
        ) : null}

        {/* ---- Widget Row 2: Approved Changes + Ask Builder ---- */}
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
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
        </View>
      </View>
    </ScrollView>
  )
}
