/**
 * Project Updates — the homeowner's "what's happening" screen ("Calm Cockpit",
 * handoff §5 Updates).
 *
 * One screen, four in-screen sub-tabs driven by a segmented control (NOT routes):
 *   Timeline | Milestones | Changes | Property
 * Each sub-tab fetches lazily (one TanStack query, enabled only when selected)
 * and renders its own loading / empty / error states.
 *
 * Re-skinned to Direction C: warm-sand canvas, calm-pine "on track", warm-clay
 * for milestones, amber for "needs you", red ONLY for genuine delay. Status is
 * always colour + icon + word (StatusPill / CalmCard). No %/progress anywhere —
 * milestones read in TIME (dates + honest "day N"); property reads as stage
 * chips. ₹ in mono with Indian grouping. Single language per screen via STR.
 */
import { useState } from 'react'
import { ActivityIndicator, Pressable, TextInput, View, type TextStyle } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../../src/i18n/I18nProvider'
import { homeowner } from '../../src/api/client'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, STATUS, type Status } from '../../src/theme/tokens'
import type { Change, ComponentStatus, Milestone, QuietPeriod, Update } from '../../src/api/types'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Display,
  EvidenceCard,
  FadeInUp,
  H2,
  Mono,
  Small,
  StatusPill,
  Screen,
  WeeklySummaryCard,
  FLOATING_NAV_CLEARANCE,
} from '../../src/ui'
import {
  SUB_TABS,
  dayNumberSince,
  formatDate,
  formatDayDelta,
  formatDayNumber,
  formatRupeeDelta,
  milestoneMeta,
  shortDate,
  updateMeta,
  weekRange,
  type SubTab,
} from './_updates.util'

// ---- localised copy ----
const STR = {
  en: {
    subtitle: 'Your build, explained — milestones, money, and what changed.',
    tabs: { timeline: 'Timeline', milestones: 'Milestones', changes: 'Changes', property: 'Property' },
    weekEyebrow: 'This week',
    listen: 'Listen',
    readLetter: 'Read the full letter',
    loading: 'Loading…',
    retry: 'Try again',
    errTimeline: 'Could not load updates.',
    errMilestones: 'Could not load milestones.',
    errChanges: 'Could not load changes.',
    errProperty: 'Could not load your property.',
    emptyTimeline: "No updates yet — we'll explain quiet stretches so you're never left wondering.",
    quietTitle: 'Quiet on site right now',
    quietNextPrefix: 'Next update expected around',
    emptyMilestones: 'No milestones planned yet.',
    emptyChanges: 'No changes logged yet — costs and dates are holding steady.',
    emptyProperty: 'No spaces added yet.',
    totalsEyebrow: 'Running totals',
    costLabel: 'Cost change',
    scheduleLabel: 'Schedule change',
    notStarted: 'Not started',
    // Timeline
    delayEyebrow: 'Delay',
    delayRevised: 'Revised date',
    delayImpact: 'What this means',
    milestoneEyebrow: 'Milestone',
    changeEyebrow: 'Change',
    progressEyebrow: 'Progress',
    // Milestones
    milestonesEyebrow: 'Your milestones',
    msStartedOn: 'Started',
    msExpected: 'Expected',
    msDoneOn: 'Done',
    msEvidence: 'Proof from site',
    msEvidenceClaim: 'Completed and reviewed on site',
    msNoProof: 'No proof attached yet',
    // Change story card
    changeWhy: 'Why',
    changeCost: 'Cost',
    changeSchedule: 'Schedule',
    changeWho: 'Approved by',
    changeRequested: 'Requested by',
    changeRunning: 'Running total',
    changeOnlyOwnerApprove: 'Only an owner can approve this. You can add a comment.',
    changeCommentPlaceholder: 'Add a note…',
    changeSend: 'Send',
    changeCancel: 'Cancel',
    changeApprovalStub: 'Approval linked to your Decisions tab.',
    // Property
    propertyEyebrow: 'Room by room',
    viewPhotos: 'View photos',
  },
  hi: {
    subtitle: 'आपका निर्माण, समझाया — पड़ाव, पैसा और क्या बदला।',
    tabs: { timeline: 'टाइमलाइन', milestones: 'पड़ाव', changes: 'बदलाव', property: 'संपत्ति' },
    weekEyebrow: 'इस हफ़्ते',
    listen: 'सुनें',
    readLetter: 'पूरा पत्र पढ़ें',
    loading: 'लोड हो रहा है…',
    retry: 'फिर कोशिश करें',
    errTimeline: 'अपडेट लोड नहीं हो सके।',
    errMilestones: 'पड़ाव लोड नहीं हो सके।',
    errChanges: 'बदलाव लोड नहीं हो सके।',
    errProperty: 'आपकी संपत्ति लोड नहीं हो सकी।',
    emptyTimeline: 'अभी कोई अपडेट नहीं — हम शांत दौर समझाएँगे ताकि आप कभी अनजान न रहें।',
    quietTitle: 'अभी साइट पर शांति है',
    quietNextPrefix: 'अगला अपडेट लगभग',
    emptyMilestones: 'अभी कोई पड़ाव तय नहीं है।',
    emptyChanges: 'अभी कोई बदलाव दर्ज नहीं — लागत और तारीखें स्थिर हैं।',
    emptyProperty: 'अभी कोई स्थान नहीं जोड़ा गया।',
    totalsEyebrow: 'कुल योग',
    costLabel: 'लागत में बदलाव',
    scheduleLabel: 'समय में बदलाव',
    notStarted: 'शुरू नहीं हुआ',
    // Timeline
    delayEyebrow: 'देरी',
    delayRevised: 'नई तारीख',
    delayImpact: 'इसका मतलब',
    milestoneEyebrow: 'पड़ाव',
    changeEyebrow: 'बदलाव',
    progressEyebrow: 'प्रगति',
    // Milestones
    milestonesEyebrow: 'आपके पड़ाव',
    msStartedOn: 'शुरू',
    msExpected: 'अनुमानित',
    msDoneOn: 'पूरा',
    msEvidence: 'साइट से प्रमाण',
    msEvidenceClaim: 'साइट पर पूरा और जाँचा गया',
    msNoProof: 'अभी कोई प्रमाण नहीं',
    // Change story card
    changeWhy: 'क्यों',
    changeCost: 'लागत',
    changeSchedule: 'समय',
    changeWho: 'मंज़ूरी दी',
    changeRequested: 'अनुरोध किया',
    changeRunning: 'कुल बदलाव',
    changeOnlyOwnerApprove: 'केवल संपत्ति के मालिक इसे मंज़ूर कर सकते हैं। आप एक टिप्पणी छोड़ सकते हैं।',
    changeCommentPlaceholder: 'नोट जोड़ें…',
    changeSend: 'भेजें',
    changeCancel: 'रद्द करें',
    changeApprovalStub: 'मंज़ूरी आपके निर्णय टैब से जुड़ी है।',
    // Property
    propertyEyebrow: 'कमरा दर कमरा',
    viewPhotos: 'तस्वीरें देखें',
  },
} as const

type Lang = 'en' | 'hi'

export default function Updates() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const c = theme.colors
  const [tab, setTab] = useState<SubTab>('timeline')
  const str = STR[lang]

  return (
    <Screen style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}>
      <View>
        <Display>{t('nav.updates')}</Display>
        <Body muted style={{ marginTop: SPACE.xs }}>
          {str.subtitle}
        </Body>
      </View>

      {/* Segmented control — a row of ≥48px Pressable pills. */}
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
                minHeight: 48,
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

/** Small clay/sage/amber uppercase kicker above a card title (the Direction-C eyebrow). */
function Eyebrow({ children, color }: { children: string; color?: string }) {
  return (
    <Small muted={!color} color={color} style={{ letterSpacing: 1, marginBottom: 2 }}>
      {children.toUpperCase()}
    </Small>
  )
}

/** Quiet-period card used as the empty-state for the Timeline tab.
 * The `reason` text comes from the backend already in the user's language. */
function QuietEmptyCard({ quiet, lang }: { quiet: QuietPeriod; lang: Lang }) {
  const str = STR[lang]
  const nextDate = shortDate(quiet.next_expected_at, lang)
  const bodyParts: string[] = []
  if (quiet.reason) bodyParts.push(quiet.reason)
  if (nextDate) bodyParts.push(`${str.quietNextPrefix} ${nextDate}.`)
  const body = bodyParts.join(' ') || undefined
  return <CalmCard status="quiet" title={str.quietTitle} body={body} />
}

// ---- Timeline ----
/**
 * One feed entry. A DELAY is the only archetype with a hard data rule (§5): it
 * MUST carry a reason/impact narrative (the `body`) and ideally a revised date.
 * A `delay`-typed update with no body is NOT rendered as an alarming red delay
 * card — it degrades to a calm neutral entry so we never raise alarm without an
 * explanation (handoff §6, §8: "alarms without a next step" are forbidden).
 */
function TimelineEntry({ u, lang }: { u: Update; lang: Lang }) {
  const str = STR[lang]
  const meta = updateMeta(u.type, lang)
  const occurred = formatDate(u.published_at, lang)

  // DELAY archetype — red, but only when it carries its required story.
  if (u.type === 'delay' && u.body) {
    const revised = shortDate(u.published_at, lang)
    return (
      <CalmCard status="risk" eyebrow={str.delayEyebrow} title={u.title}>
        <View style={{ gap: SPACE.sm }}>
          {revised ? (
            <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'baseline' }}>
              <Small muted>{str.delayRevised}:</Small>
              <Mono>{revised}</Mono>
            </View>
          ) : null}
          <View>
            <Eyebrow>{str.delayImpact}</Eyebrow>
            <Body>{u.body}</Body>
          </View>
        </View>
      </CalmCard>
    )
  }

  // Milestone / change / progress / quiet — calm coloured-spine cards.
  const eyebrow =
    u.type === 'milestone'
      ? str.milestoneEyebrow
      : u.type === 'change'
        ? str.changeEyebrow
        : meta.status === 'mute'
          ? str.tabs.timeline // generic "quiet" uses no special kicker
          : str.progressEyebrow
  const status: Status = meta.status === 'mute' ? 'quiet' : meta.status
  // Milestones celebrate (clay 'info'→keep ok green per meta); quiet stays grey.
  return (
    <CalmCard
      status={status}
      eyebrow={u.type === 'quiet' ? undefined : eyebrow}
      title={u.title}
      body={u.body ?? undefined}
      trailing={<Mono muted style={{ fontSize: 12 }}>{occurred}</Mono>}
    />
  )
}

function TimelineTab() {
  const { lang } = useT()
  const str = STR[lang]

  const summaryQ = useQuery({
    queryKey: ['homeowner', 'weeklySummary'],
    queryFn: () => homeowner.weeklySummary(),
  })
  const updatesQ = useQuery({
    queryKey: ['homeowner', 'updates'],
    queryFn: () => homeowner.updates(),
  })
  const quietQ = useQuery({
    queryKey: ['homeowner', 'quietPeriods'],
    queryFn: () => homeowner.quietPeriods(),
  })

  if (updatesQ.isLoading || summaryQ.isLoading) return <Loading />
  if (updatesQ.isError) {
    return <ErrorState message={str.errTimeline} onRetry={() => void updatesQ.refetch()} />
  }

  const weekly = summaryQ.data?.[0]
  const items = updatesQ.data?.items ?? []
  // Most-recent quiet period — the endpoint orders detected_at DESC, so newest is first.
  const activeQuiet: QuietPeriod | null = quietQ.data?.[0] ?? null

  return (
    <View style={{ gap: SPACE.md }}>
      {/* FLAGSHIP weekly summary, pinned at the very top (warm-clay). */}
      {weekly?.text ? (
        <FadeInUp>
          <WeeklySummaryCard
            eyebrowPrefix={str.weekEyebrow}
            rangeLabel={weekRange(weekly.week_start, lang) ?? ''}
            summary={weekly.text}
            listenLabel={str.listen}
            readMoreLabel={str.readLetter}
            readMoreHref="/(homeowner)/updates"
            lang={lang}
          />
        </FadeInUp>
      ) : null}

      {items.length === 0 ? (
        activeQuiet ? (
          <QuietEmptyCard quiet={activeQuiet} lang={lang} />
        ) : (
          <Empty message={str.emptyTimeline} />
        )
      ) : (
        items.map((u, i) => (
          <FadeInUp key={u.id} delay={Math.min(i, 4) * 30}>
            <TimelineEntry u={u} lang={lang} />
          </FadeInUp>
        ))
      )}
    </View>
  )
}

// ---- Milestones ----
/**
 * Vertical tracker. NO % (§8) — each milestone reads in TIME: an honest date
 * line plus, for the active ("now") milestone, the elapsed "day N" so far. Done
 * milestones carry an evidence packet (EvidenceCard, "Show proof"). The
 * backend doesn't (yet) carry a "usual range" estimate, so we only ever show
 * real dates + a real elapsed count — never a fabricated range (§6).
 */
function MilestoneRow({ m, isLast, lang }: { m: Milestone; isLast: boolean; lang: Lang }) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const meta = milestoneMeta(m.status, lang)
  const spineColor =
    m.status === 'done' ? STATUS.ok : m.status === 'now' ? STATUS.info : c.quiet

  // Honest time line per status — dates only, plus elapsed "day N" while active.
  const dayN = m.status === 'now' ? dayNumberSince(m.started_on) : null
  const dateLine: string =
    m.status === 'done'
      ? `${str.msDoneOn} ${formatDate(m.completed_on ?? m.expected_on, lang)}`
      : m.status === 'now'
        ? [
            m.started_on ? `${str.msStartedOn} ${formatDate(m.started_on, lang)}` : null,
            m.expected_on ? `${str.msExpected} ${formatDate(m.expected_on, lang)}` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')
        : `${str.msExpected} ${formatDate(m.expected_on, lang)}`

  return (
    <View style={{ flexDirection: 'row', gap: SPACE.md }}>
      {/* Left rail: status dot + connector. */}
      <View style={{ alignItems: 'center', width: 14 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: spineColor,
            marginTop: 4,
          }}
        />
        {!isLast ? (
          <View style={{ flex: 1, width: 2, backgroundColor: c.line, marginTop: 4 }} />
        ) : null}
      </View>

      <View style={{ flex: 1, paddingBottom: isLast ? 0 : SPACE.lg, gap: SPACE.sm }}>
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

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <Mono muted style={{ fontSize: 12 }}>
            {dateLine}
          </Mono>
          {dayN != null ? (
            <Mono color={STATUS.info} style={{ fontSize: 12 }}>
              {`· ${formatDayNumber(dayN, lang)}`}
            </Mono>
          ) : null}
        </View>

        {/* Evidence packet on done milestones — one tap to proof. */}
        {m.status === 'done' ? (
          <EvidenceCard
            claim={str.msEvidenceClaim}
            status="ok"
            detail={m.completed_on ? formatDate(m.completed_on, lang) : undefined}
            evidence={[]}
          />
        ) : null}
      </View>
    </View>
  )
}

function MilestonesTab() {
  const { lang } = useT()
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
    <View style={{ gap: SPACE.md }}>
      <Eyebrow>{str.milestonesEyebrow}</Eyebrow>
      <Card>
        <View style={{ gap: 0 }}>
          {milestones.map((m, i) => (
            <MilestoneRow
              key={m.id}
              m={m}
              isLast={i === milestones.length - 1}
              lang={lang}
            />
          ))}
        </View>
      </Card>
    </View>
  )
}

// ---- Change Story Card ----
function ChangeStoryCard({
  ch,
  canApprove,
  lang,
}: {
  ch: Change
  canApprove: boolean
  lang: Lang
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const [note, setNote] = useState('')
  const [commenting, setCommenting] = useState(false)

  const costColor =
    (ch.cost_delta ?? 0) > 0 ? STATUS.risk : (ch.cost_delta ?? 0) < 0 ? STATUS.ok : c.textMute
  const dayColor =
    (ch.schedule_delta_days ?? 0) > 0
      ? STATUS.risk
      : (ch.schedule_delta_days ?? 0) < 0
        ? STATUS.ok
        : c.textMute
  const runningColor =
    (ch.running_total_cost ?? 0) > 0
      ? STATUS.risk
      : (ch.running_total_cost ?? 0) < 0
        ? STATUS.ok
        : c.textMute

  const inputStyle: TextStyle = {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: theme.radii.control,
    backgroundColor: c.paper,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    minHeight: 72,
    color: c.text,
    textAlignVertical: 'top',
  }

  return (
    <View style={{ gap: SPACE.sm }}>
      {/* WHAT */}
      <BodyStrong>{ch.description}</BodyStrong>

      {/* WHY */}
      {ch.reason ? (
        <Small muted>
          {str.changeWhy}: {ch.reason}
        </Small>
      ) : null}

      {/* +₹ COST + +days SCHEDULE — money story-first, mono. */}
      <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
        <View>
          <Eyebrow>{str.changeCost}</Eyebrow>
          <Mono color={costColor}>{formatRupeeDelta(ch.cost_delta)}</Mono>
        </View>
        <View>
          <Eyebrow>{str.changeSchedule}</Eyebrow>
          <Mono color={dayColor}>{formatDayDelta(ch.schedule_delta_days, lang)}</Mono>
        </View>
      </View>

      {/* WHO: approved_by_name + requested_by_name */}
      {ch.approved_by_name ? (
        <Small muted>
          {str.changeWho}: {ch.approved_by_name} · {formatDate(ch.created_at, lang)}
        </Small>
      ) : null}
      {ch.requested_by_name ? (
        <Small muted>
          {str.changeRequested}: {ch.requested_by_name}
        </Small>
      ) : null}

      {/* RUNNING TOTAL */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Small muted>{str.changeRunning}:</Small>
        <Mono color={runningColor}>{formatRupeeDelta(ch.running_total_cost)}</Mono>
      </View>

      {/* ACTION — owners see the honest decision-link stub; others may comment. */}
      {canApprove ? (
        <View>
          <Small muted style={{ marginBottom: SPACE.xs }}>
            {str.changeApprovalStub}
          </Small>
        </View>
      ) : commenting ? (
        <View style={{ gap: SPACE.sm }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={str.changeCommentPlaceholder}
            placeholderTextColor={c.textMute}
            multiline
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button title={str.changeSend} onPress={() => setCommenting(false)} />
            <Button
              title={str.changeCancel}
              variant="ghost"
              onPress={() => {
                setNote('')
                setCommenting(false)
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: SPACE.xs }}>
          <Small muted>{str.changeOnlyOwnerApprove}</Small>
          <Button
            title={str.changeCommentPlaceholder}
            variant="secondary"
            onPress={() => setCommenting(true)}
          />
        </View>
      )}
    </View>
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

  const capQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canApprove = capQ.data?.can_approve ?? false

  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState message={str.errChanges} onRetry={() => void q.refetch()} />

  const log = q.data
  const items = log?.items ?? []
  const costDelta = log?.total_cost_delta ?? 0
  const dayDelta = log?.total_schedule_delta_days ?? 0

  return (
    <View style={{ gap: SPACE.md }}>
      {/* Pinned running totals (money story-first) — clay celebration accent. */}
      <Card style={{ borderLeftWidth: 4, borderLeftColor: c.secondary }}>
        <View style={{ gap: SPACE.md }}>
          <Eyebrow color={c.secondary}>{str.totalsEyebrow}</Eyebrow>
          <View style={{ flexDirection: 'row', gap: SPACE.xl }}>
            <View style={{ flex: 1 }}>
              <Eyebrow>{str.costLabel}</Eyebrow>
              <H2 color={costDelta > 0 ? STATUS.risk : costDelta < 0 ? STATUS.ok : c.text}>
                {formatRupeeDelta(costDelta)}
              </H2>
            </View>
            <View style={{ flex: 1 }}>
              <Eyebrow>{str.scheduleLabel}</Eyebrow>
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
        items.map((ch, i) => (
          <FadeInUp key={ch.id} delay={Math.min(i, 4) * 30}>
            <Card>
              <ChangeStoryCard ch={ch} canApprove={canApprove} lang={lang} />
            </Card>
          </FadeInUp>
        ))
      )}
    </View>
  )
}

// ---- Property ----
/**
 * Per-component stage → status spine tone (mirrors `milestoneMeta`): done is "on
 * track" green, in-progress is a calm neutral blue, not-started is the muted
 * quiet tone. Calm Cockpit §8 forbids any %/progress bar — rooms read as stage
 * chips (color + icon + the stage word) instead.
 */
const COMPONENT_TONE: Record<ComponentStatus, Status> = {
  done: 'ok',
  in_progress: 'info',
  not_started: 'quiet',
}

function PropertyTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const router = useRouter()

  const q = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })

  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorState message={str.errProperty} onRetry={() => void q.refetch()} />

  const spaces = [...(q.data?.spaces ?? [])].sort((a, b) => a.order - b.order)
  if (spaces.length === 0) return <Empty message={str.emptyProperty} />

  return (
    <View style={{ gap: SPACE.md }}>
      <Eyebrow>{str.propertyEyebrow}</Eyebrow>
      <Card padded={false}>
        {spaces.map((s, i) => {
          // Calm Cockpit §8: no %, no progress bar. Each room reads as its set of
          // stage chips (StatusPill = color + icon + stage word). Tapping a room
          // deep-links to Photos so she can see the proof.
          const components = s.components ?? []
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.name} — ${str.viewPhotos}`}
              onPress={() => router.push('/(homeowner)/photos')}
              style={{
                padding: SPACE.lg,
                minHeight: 48,
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
                <Small color={c.accent} style={{ fontWeight: '600' }}>
                  {str.viewPhotos}
                </Small>
              </View>
              {components.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {components.map((comp) => (
                    <StatusPill
                      key={comp.id}
                      size="sm"
                      status={COMPONENT_TONE[comp.status]}
                      label={comp.name}
                    />
                  ))}
                </View>
              ) : (
                <Small muted>{str.notStarted}</Small>
              )}
            </Pressable>
          )
        })}
      </Card>
    </View>
  )
}
