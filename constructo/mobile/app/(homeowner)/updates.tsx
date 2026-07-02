/**
 * Project Updates — the homeowner's "what's happening" screen ("Calm Cockpit",
 * handoff §5 Updates).
 *
 * Layout faithfully matched to screen-updates.jsx (Neev-2 prototype):
 *
 *   Timeline   — MilestonesCard (collapsible strip → full tracker) pinned at top,
 *                WeeklySummaryCard (clay top-accent), timeline feed entries,
 *                Changes-log summary tappable card, quiet periods.
 *   Milestones — vertical tracker with spine dots + EvidenceCard on done entries.
 *   Changes    — sticky summary banner + filter chips + change story cards with
 *                cost/schedule pills + approval/status row.
 *   Property   — room-by-room stage chips, taps into Photos.
 *
 * Data hooks + i18n kept intact. Composition upgraded to match prototype exactly.
 */
import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, TextInput, View, type TextStyle } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { homeowner } from '../../src/api/client'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, STATUS, type Status } from '../../src/theme/tokens'
import type { Change, ComponentStatus, Milestone, QuietPeriod, Update } from '../../src/api/types'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Card,
  Chip,
  Display,
  Eyebrow,
  EvidenceCard,
  FadeInUp,
  H2,
  LinkRow,
  MilestoneStrip,
  Mono,
  MonoSm,
  Small,
  StatusPill,
  Screen,
  ScreenLoader,
  WeeklySummaryCard,
  FLOATING_NAV_CLEARANCE,
} from '../../src/ui'
import {
  SUB_TABS,
  dayNumberSince,
  delayStory,
  formatDate,
  formatDayDelta,
  formatDayNumber,
  formatRupeeDelta,
  formatTypicalRange,
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
    delayRevised: 'Now expected',
    delayImpact: 'What this means',
    reason: 'Why',
    milestoneEyebrow: 'Milestone',
    changeEyebrow: 'Change',
    progressEyebrow: 'Progress',
    // Milestones card (collapsible)
    milestonesEyebrow: 'Milestones',
    targetHandover: 'Target handover',
    nowLabel: 'Now',
    tapFullTimeline: 'Tap to see the full timeline',
    showLess: 'Show less',
    done: 'done',
    toGo: 'to go',
    // Milestones tab
    msStartedOn: 'Started',
    msExpected: 'Expected',
    msDoneOn: 'Done',
    msEvidence: 'Proof from site',
    msEvidenceClaim: 'Completed and reviewed on site',
    msNoProof: 'No proof attached yet',
    // Change story card
    changeWhat: 'What changed',
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
    noImpact: 'No impact',
    // Property
    propertyEyebrow: 'Room by room',
    viewPhotos: 'View photos',
    // Changes log summary (Timeline → tappable card)
    changesLogTitle: 'Changes log',
    changesLogSubtitle: (n: number, cost: string, days: string) =>
      `${n} change${n === 1 ? '' : 's'} · ${cost} · ${days}`,
    changesLogTap: 'See all changes',
    // Changes filter chips
    filterAll: 'All',
    filterByMe: 'By me',
    filterByContractor: 'By contractor',
    filterCostImpact: 'Cost impact',
    filterNoCost: 'No cost',
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
    delayRevised: 'अब अपेक्षित',
    delayImpact: 'इसका मतलब',
    reason: 'कारण',
    milestoneEyebrow: 'पड़ाव',
    changeEyebrow: 'बदलाव',
    progressEyebrow: 'प्रगति',
    // Milestones card (collapsible)
    milestonesEyebrow: 'पड़ाव',
    targetHandover: 'लक्षित सौंपना',
    nowLabel: 'अभी',
    tapFullTimeline: 'पूरी टाइमलाइन देखने के लिए दबाएँ',
    showLess: 'कम दिखाएँ',
    done: 'पूरे',
    toGo: 'बाकी',
    // Milestones tab
    msStartedOn: 'शुरू',
    msExpected: 'अनुमानित',
    msDoneOn: 'पूरा',
    msEvidence: 'साइट से प्रमाण',
    msEvidenceClaim: 'साइट पर पूरा और जाँचा गया',
    msNoProof: 'अभी कोई प्रमाण नहीं',
    // Change story card
    changeWhat: 'क्या बदला',
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
    noImpact: 'कोई असर नहीं',
    // Property
    propertyEyebrow: 'कमरा दर कमरा',
    viewPhotos: 'तस्वीरें देखें',
    // Changes log summary (Timeline → tappable card)
    changesLogTitle: 'बदलावों का सारांश',
    changesLogSubtitle: (n: number, cost: string, days: string) =>
      `${n} बदलाव · ${cost} · ${days}`,
    changesLogTap: 'सभी बदलाव देखें',
    // Changes filter chips
    filterAll: 'सभी',
    filterByMe: 'मेरे द्वारा',
    filterByContractor: 'ठेकेदार द्वारा',
    filterCostImpact: 'लागत प्रभाव',
    filterNoCost: 'बिना लागत',
  },
} as const

type Lang = 'en' | 'hi'

export default function Updates() {
  const { t, lang } = useT()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const c = theme.colors
  const qc = useQueryClient()
  const [tab, setTab] = useState<SubTab>('timeline')
  // Keep each visited tab MOUNTED (toggle visibility) so switching back doesn't
  // re-run its queries / lose scroll + expanded/filter state (spinner re-flash).
  const [visited, setVisited] = useState<Set<SubTab>>(() => new Set<SubTab>(['timeline']))
  const [refreshing, setRefreshing] = useState(false)
  const str = STR[lang]

  const showTab = useCallback((key: SubTab) => {
    setTab(key)
    setVisited((v) => (v.has(key) ? v : new Set(v).add(key)))
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await qc.invalidateQueries({ queryKey: ['homeowner'] })
    } finally {
      setRefreshing(false)
    }
  }, [qc])

  return (
    <Screen
      style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
      }
    >
      <View>
        <Display>{t('nav.updates')}</Display>
        <Body muted style={{ marginTop: SPACE.xs }}>
          {str.subtitle}
        </Body>
      </View>

      {/* Sub-tab row — prototype: evenly spaced pills, ink-filled active */}
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
              onPress={() => showTab(key)}
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

      {/* Each visited tab stays mounted; only the active one is displayed. */}
      {visited.has('timeline') ? (
        <View style={{ display: tab === 'timeline' ? 'flex' : 'none' }}>
          <TimelineTab onSwitchToChanges={() => showTab('changes')} />
        </View>
      ) : null}
      {visited.has('milestones') ? (
        <View style={{ display: tab === 'milestones' ? 'flex' : 'none' }}>
          <MilestonesTab />
        </View>
      ) : null}
      {visited.has('changes') ? (
        <View style={{ display: tab === 'changes' ? 'flex' : 'none' }}>
          <ChangesTab />
        </View>
      ) : null}
      {visited.has('property') ? (
        <View style={{ display: tab === 'property' ? 'flex' : 'none' }}>
          <PropertyTab />
        </View>
      ) : null}
    </Screen>
  )
}

// ---- shared state views ----
function Loading() {
  // Calm breathing mark (doctrine) rather than a raw racing spinner.
  return (
    <View style={{ paddingVertical: SPACE.xl }}>
      <ScreenLoader fill={false} />
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

// ---- MilestonesCard (collapsible strip → tracker, pinned on Timeline) ----

/**
 * MilestonesCard — the collapsible milestone overview pinned at the top of the
 * Timeline tab (prototype MilestonesCard). Collapsed: MilestoneStrip + "Now"
 * banner. Expanded: full vertical MilestoneTracker.
 */
function MilestonesCard({
  milestones,
  lang,
}: {
  milestones: Milestone[]
  lang: Lang
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const [open, setOpen] = useState(false)

  const sorted = [...milestones].sort((a, b) => a.order - b.order)
  const doneCount = sorted.filter((m) => m.status === 'done').length
  const upcomingCount = sorted.filter((m) => m.status === 'upcoming').length
  const nowM = sorted.find((m) => m.status === 'now')
  // Target handover = last milestone's expected_on
  const handoverM = sorted[sorted.length - 1]
  const handoverLabel = handoverM ? shortDate(handoverM.expected_on, lang) : null

  if (sorted.length === 0) return null

  return (
    <FadeInUp>
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.line,
          ...theme.shadowCard,
        }}
      >
        {/* Header row — always visible */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.md,
            padding: SPACE.lg,
            paddingBottom: SPACE.md,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ marginBottom: 2 }}>{str.milestonesEyebrow}</Eyebrow>
            <BodyStrong>
              {str.targetHandover}
              {handoverLabel ? ` · ${handoverLabel}` : ''}
            </BodyStrong>
          </View>
          <StatusPill status="ok" label="On track" size="sm" />
          <Feather
            name={open ? 'chevron-down' : 'chevron-right'}
            size={18}
            color={c.textMute}
          />
        </Pressable>

        {!open ? (
          /* Collapsed: horizontal strip + "Now" summary */
          <Pressable
            onPress={() => setOpen(true)}
            style={({ pressed }) => ({
              paddingHorizontal: SPACE.lg,
              paddingBottom: SPACE.lg,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {/* Horizontal milestone dots */}
            <MilestoneStrip milestones={sorted} nowLabel={str.nowLabel} />

            {/* Foundation … Handover labels */}
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs }}
            >
              <Small muted>{sorted[0]?.name ?? ''}</Small>
              <Small muted>{handoverM?.name ?? ''}</Small>
            </View>

            {/* "Now" summary pill */}
            {nowM ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  marginTop: SPACE.md,
                  padding: SPACE.md,
                  backgroundColor: AP.surfaceContainer,
                  borderRadius: theme.radii.chip,
                }}
              >
                <Feather name="circle" size={16} color={AP.clay} />
                <Body style={{ flex: 1, color: c.text }}>
                  <BodyStrong>Now: </BodyStrong>
                  {nowM.name}
                  {nowM.expected_on ? ` · expected ${shortDate(nowM.expected_on, lang)}` : ''}
                </Body>
                <Small muted>
                  {doneCount} {str.done} · {upcomingCount} {str.toGo}
                </Small>
              </View>
            ) : null}

            {/* "Tap to see full timeline" hint */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACE.xs,
                marginTop: SPACE.md,
              }}
            >
              <Small color={c.accentDeep} style={{ fontWeight: '600' }}>
                {str.tapFullTimeline}
              </Small>
              <Feather name="chevron-down" size={15} color={c.accentDeep} />
            </View>
          </Pressable>
        ) : (
          /* Expanded: full vertical tracker */
          <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md }}>
            <MilestoneTracker milestones={sorted} lang={lang} />
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACE.xs,
                paddingVertical: SPACE.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Small color={c.textMute} style={{ fontWeight: '600' }}>
                {str.showLess}
              </Small>
              <Feather name="chevron-up" size={15} color={c.textMute} />
            </Pressable>
          </View>
        )}
      </View>
    </FadeInUp>
  )
}

/** Full vertical milestone tracker (expanded view inside MilestonesCard). */
function MilestoneTracker({ milestones, lang }: { milestones: Milestone[]; lang: Lang }) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]

  return (
    <View style={{ paddingTop: SPACE.sm }}>
      {milestones.map((m, i) => {
        const isLast = i === milestones.length - 1
        const isDone = m.status === 'done'
        const isNow = m.status === 'now'
        const spineColor = isDone ? c.ok : isNow ? c.secondary : c.line

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
          <View key={m.id} style={{ flexDirection: 'row', gap: SPACE.md }}>
            {/* Left rail */}
            <View style={{ alignItems: 'center', width: 24 }}>
              <View
                style={{
                  width: isNow ? 22 : 18,
                  height: isNow ? 22 : 18,
                  borderRadius: 11,
                  backgroundColor: isDone ? c.ok : isNow ? c.secondary : 'transparent',
                  borderWidth: m.status === 'upcoming' ? 1.5 : 0,
                  borderColor: c.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                  zIndex: 2,
                  ...(isNow
                    ? {
                        shadowColor: c.secondary,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.35,
                        shadowRadius: 8,
                      }
                    : {}),
                }}
              >
                {isDone ? (
                  <Feather name="check" size={12} color="#fff" />
                ) : isNow ? (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: '#fff',
                    }}
                  />
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    backgroundColor: isDone ? c.ok : 'transparent',
                    borderLeftWidth: m.status === 'upcoming' ? 1.5 : 0,
                    borderLeftColor: c.line,
                    borderStyle: 'dashed',
                    marginTop: 2,
                    marginBottom: 2,
                  }}
                />
              ) : null}
            </View>

            {/* Content */}
            <View
              style={{
                flex: 1,
                paddingBottom: isLast ? 0 : SPACE.xl,
                gap: SPACE.xs,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  flexWrap: 'wrap',
                }}
              >
                <BodyStrong
                  color={m.status === 'upcoming' ? c.textMute : c.text}
                  style={{ flex: 1 }}
                >
                  {m.name}
                </BodyStrong>
                {isNow ? <StatusPill status="ok" label="On track" size="sm" /> : null}
              </View>
              <MonoSm muted>{dateLine}</MonoSm>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ---- Timeline ----
/**
 * One feed entry. A DELAY is the only archetype with a hard data rule (§5): it
 * MUST carry a reason/impact narrative (the `body`) and ideally a revised date.
 */
function TimelineEntry({ u, lang }: { u: Update; lang: Lang }) {
  const str = STR[lang]
  const { theme } = useTheme()
  const c = theme.colors
  const meta = updateMeta(u.type, lang)
  const occurred = formatDate(u.published_at, lang)

  // DELAY archetype — red ONLY with the full STRUCTURED story.
  const story = delayStory(u)
  if (story) {
    return (
      <CalmCard status="risk" eyebrow={str.delayEyebrow} title={u.title}>
        <View style={{ gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'baseline' }}>
            <Small muted>{str.delayRevised}:</Small>
            <Mono>{formatDate(story.revisedDate, lang)}</Mono>
          </View>
          {story.impactDays != null || story.impactCost != null ? (
            <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
              {story.impactDays != null ? (
                <View>
                  <Small muted>{str.changeSchedule}</Small>
                  <Mono color={STATUS.risk}>{formatDayDelta(story.impactDays, lang)}</Mono>
                </View>
              ) : null}
              {story.impactCost != null ? (
                <View>
                  <Small muted>{str.changeCost}</Small>
                  <Mono color={STATUS.risk}>{formatRupeeDelta(story.impactCost)}</Mono>
                </View>
              ) : null}
            </View>
          ) : null}
          <View>
            <Eyebrow>{str.reason}</Eyebrow>
            <Body>{story.reason}</Body>
          </View>
        </View>
      </CalmCard>
    )
  }

  // Quiet day — keep the calm muted card.
  if (u.type === 'quiet') {
    return (
      <CalmCard
        status="quiet"
        title={u.title}
        body={u.body ?? undefined}
        trailing={<MonoSm muted style={{ fontSize: 12 }}>{occurred}</MonoSm>}
      />
    )
  }

  // Progress / milestone / change — a premium card: a status-tinted icon chip,
  // an eyebrow + title + body, and a soft date pill. Reads as a real timeline
  // entry rather than a flat row.
  const eyebrow =
    u.type === 'milestone'
      ? str.milestoneEyebrow
      : u.type === 'change'
        ? str.changeEyebrow
        : str.progressEyebrow
  const tone: Status = meta.status === 'mute' ? 'quiet' : meta.status
  const accent = STATUS[tone] ?? c.accent
  const icon =
    u.type === 'milestone' ? 'flag' : u.type === 'change' ? 'refresh-cw' : 'trending-up'
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
          flexDirection: 'row',
          gap: SPACE.md,
        },
        theme.shadowCard,
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: `${accent}1A`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm }}
        >
          <Eyebrow style={{ color: accent }}>{eyebrow}</Eyebrow>
          <View
            style={{
              backgroundColor: c.paper,
              borderRadius: theme.radii.pill,
              paddingHorizontal: SPACE.sm,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <MonoSm muted style={{ fontSize: 11 }}>{occurred}</MonoSm>
          </View>
        </View>
        <Body style={{ fontWeight: '600' }}>{u.title}</Body>
        {u.body ? <Body muted style={{ fontSize: 14 }}>{u.body}</Body> : null}
      </View>
    </View>
  )
}

/** Inline quiet-period divider (prototype QuietState). */
function InlineQuiet({ quiet, lang }: { quiet: QuietPeriod; lang: Lang }) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const nextDate = shortDate(quiet.next_expected_at, lang)
  const bodyParts: string[] = []
  if (quiet.reason) bodyParts.push(quiet.reason)
  if (nextDate) bodyParts.push(`${str.quietNextPrefix} ${nextDate}.`)
  const body = bodyParts.join(' ') || undefined

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingVertical: SPACE.lg,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      <View style={{ alignItems: 'center', maxWidth: 240 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginBottom: 4 }}
        >
          <Feather name="clock" size={13} color={c.textMute} />
          <Small muted style={{ fontWeight: '600' }}>
            {str.quietTitle}
          </Small>
        </View>
        {body ? (
          <Small muted style={{ textAlign: 'center', fontStyle: 'italic' }}>
            {body}
          </Small>
        ) : null}
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    </View>
  )
}

function TimelineTab({ onSwitchToChanges }: { onSwitchToChanges: () => void }) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
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
  const changesQ = useQuery({
    queryKey: ['homeowner', 'changes'],
    queryFn: () => homeowner.changes(),
  })
  // Milestones for the collapsible MilestonesCard at the top
  const milestonesQ = useQuery({
    queryKey: ['homeowner', 'milestones'],
    queryFn: () => homeowner.milestones(),
  })

  if (updatesQ.isLoading || summaryQ.isLoading) return <Loading />
  if (updatesQ.isError) {
    return <ErrorState message={str.errTimeline} onRetry={() => void updatesQ.refetch()} />
  }

  const weekly = summaryQ.data?.[0]
  const items = updatesQ.data?.items ?? []
  const activeQuiet: QuietPeriod | null = quietQ.data?.[0] ?? null
  const changesLog = changesQ.data
  const changeCount = changesLog?.items.length ?? 0
  const milestones = milestonesQ.data ?? []

  return (
    <View style={{ gap: SPACE.md }}>
      {/* 1. Collapsible MilestonesCard — pinned at the very top (prototype). */}
      {milestones.length > 0 ? (
        <MilestonesCard milestones={milestones} lang={lang} />
      ) : null}

      {/* 2. Weekly summary card — clay top-accent (prototype WeeklySummary). */}
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

      {/* 3. Changes-log summary card — clay left-accent, tappable. */}
      {changeCount > 0 && changesLog ? (
        <FadeInUp>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={str.changesLogTitle}
            onPress={onSwitchToChanges}
          >
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: theme.radii.card,
                borderLeftWidth: 4,
                borderLeftColor: c.secondary,
                padding: SPACE.lg,
                gap: SPACE.sm,
                ...theme.shadowCard,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                {/* Icon badge */}
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    backgroundColor: AP.surfaceContainer,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="shield" size={18} color={c.textMute} />
                </View>
                <View style={{ flex: 1 }}>
                  <Small color={c.secondary} style={{ fontWeight: '600', letterSpacing: 0.5 }}>
                    {str.changesLogTitle.toUpperCase()}
                  </Small>
                  <Body>
                    {str.changesLogSubtitle(
                      changeCount,
                      formatRupeeDelta(changesLog.total_cost_delta),
                      formatDayDelta(changesLog.total_schedule_delta_days, lang),
                    )}
                  </Body>
                </View>
                <Feather name="chevron-right" size={18} color={c.textMute} />
              </View>
            </View>
          </Pressable>
        </FadeInUp>
      ) : null}

      {/* 4. Timeline feed — updates + quiet-period dividers. */}
      {items.length === 0 ? (
        activeQuiet ? (
          <QuietEmptyCard quiet={activeQuiet} lang={lang} />
        ) : (
          <Empty message={str.emptyTimeline} />
        )
      ) : (
        <>
          {items.map((u, i) => (
            <FadeInUp key={u.id} delay={Math.min(i, 4) * 30}>
              <TimelineEntry u={u} lang={lang} />
            </FadeInUp>
          ))}
          {/* Inline quiet-period divider below the feed (if active) */}
          {activeQuiet ? <InlineQuiet quiet={activeQuiet} lang={lang} /> : null}
        </>
      )}
    </View>
  )
}

// ---- Milestones tab ----
/**
 * Vertical tracker (dedicated tab view). NO % — each milestone reads in TIME.
 */
function MilestoneRow({ m, isLast, lang }: { m: Milestone; isLast: boolean; lang: Lang }) {
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const meta = milestoneMeta(m.status, lang)
  const spineColor =
    m.status === 'done' ? STATUS.ok : m.status === 'now' ? STATUS.info : c.quiet

  const dayN = m.status === 'now' ? dayNumberSince(m.started_on) : null
  const typical = m.status === 'done' ? null : formatTypicalRange(m.typical_duration_days, lang)
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

        {/* Industry-typical range — honest "usually X–Y days", never a %. */}
        {typical ? <Small muted>{typical}</Small> : null}

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
      {/* Header row: icon + title + requested-by */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
        <Feather name="refresh-cw" size={17} color={c.textMute} style={{ marginTop: 3 }} />
        <View style={{ flex: 1 }}>
          <BodyStrong>{ch.description}</BodyStrong>
          {ch.requested_by_name ? (
            <Small muted style={{ marginTop: 2 }}>
              {str.changeRequested}: {ch.requested_by_name}
              {ch.created_at ? ` · ${shortDate(ch.created_at, lang)}` : ''}
            </Small>
          ) : null}
        </View>
      </View>

      {/* WHY */}
      {ch.reason ? (
        <Body muted>
          {ch.reason}
        </Body>
      ) : null}

      {/* Cost + Schedule pills — prototype style */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap', marginTop: SPACE.xs }}>
        {/* Cost pill */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            height: 26,
            paddingHorizontal: 10,
            borderRadius: theme.radii.pill,
            backgroundColor: (ch.cost_delta ?? 0) !== 0 ? 'rgba(164,56,42,0.10)' : AP.surfaceContainer,
          }}
        >
          <Feather name="credit-card" size={13} color={(ch.cost_delta ?? 0) !== 0 ? c.risk : c.textMute} />
          <Mono
            color={(ch.cost_delta ?? 0) !== 0 ? c.risk : c.textMute}
            style={{ fontSize: 12 }}
          >
            {formatRupeeDelta(ch.cost_delta)}
          </Mono>
        </View>
        {/* Schedule pill */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            height: 26,
            paddingHorizontal: 10,
            borderRadius: theme.radii.pill,
            backgroundColor:
              (ch.schedule_delta_days ?? 0) !== 0 ? 'rgba(164,56,42,0.10)' : AP.surfaceContainer,
          }}
        >
          <Feather
            name="clock"
            size={13}
            color={(ch.schedule_delta_days ?? 0) !== 0 ? c.risk : c.textMute}
          />
          <Small
            color={(ch.schedule_delta_days ?? 0) !== 0 ? c.risk : c.textMute}
            style={{ fontWeight: '600', fontSize: 12 }}
          >
            {(ch.schedule_delta_days ?? 0) === 0
              ? str.noImpact
              : formatDayDelta(ch.schedule_delta_days, lang)}
          </Small>
        </View>
      </View>

      {/* Approved-by row — green check mark */}
      {ch.approved_by_name ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            paddingTop: SPACE.sm,
            borderTopWidth: 1,
            borderTopColor: c.line,
            marginTop: SPACE.xs,
          }}
        >
          <Feather name="check-circle" size={15} color={c.ok} />
          <Small color={c.ok} style={{ fontWeight: '600' }}>
            {str.changeWho}: {ch.approved_by_name}
            {ch.created_at ? ` · ${shortDate(ch.created_at, lang)}` : ''}
          </Small>
        </View>
      ) : null}

      {/* Running total */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Small muted>{str.changeRunning}:</Small>
        <Mono color={runningColor}>{formatRupeeDelta(ch.running_total_cost)}</Mono>
      </View>

      {/* Action — owners see approval stub; others may comment. */}
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

// ---- Changes tab ----

type ChangeFilter = 'all' | 'by_me' | 'by_contractor' | 'cost_impact' | 'no_cost'

function ChangesTab() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const str = STR[lang]
  const [filter, setFilter] = useState<ChangeFilter>('all')

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
  const allItems = log?.items ?? []
  const costDelta = log?.total_cost_delta ?? 0
  const dayDelta = log?.total_schedule_delta_days ?? 0

  const items = allItems.filter((ch) => {
    if (filter === 'all') return true
    if (filter === 'by_me') return ch.requested_by == null
    if (filter === 'by_contractor') return ch.requested_by != null
    if (filter === 'cost_impact') return (ch.cost_delta ?? 0) !== 0
    if (filter === 'no_cost') return (ch.cost_delta ?? 0) === 0
    return true
  })

  const FILTERS: { key: ChangeFilter; label: string }[] = [
    { key: 'all', label: str.filterAll },
    { key: 'by_me', label: str.filterByMe },
    { key: 'by_contractor', label: str.filterByContractor },
    { key: 'cost_impact', label: str.filterCostImpact },
    { key: 'no_cost', label: str.filterNoCost },
  ]

  return (
    <View style={{ gap: SPACE.md }}>
      {/* Sticky summary banner — prototype: shield icon + bold count + cost + days */}
      <View
        style={{
          backgroundColor: AP.surfaceContainer,
          borderRadius: theme.radii.card,
          padding: SPACE.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <Feather name="shield" size={16} color={c.textMute} />
        <Body style={{ flex: 1 }}>
          <BodyStrong>
            {str.changesLogSubtitle(allItems.length, formatRupeeDelta(costDelta), formatDayDelta(dayDelta, lang))}
          </BodyStrong>
        </Body>
      </View>

      {/* Filter chips — horizontal scroll, client-side */}
      {allItems.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: SPACE.sm, paddingVertical: 2 }}
        >
          {FILTERS.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              active={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </ScrollView>
      ) : null}

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

// ---- Property tab ----
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
          const components = s.components ?? []
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.name} — ${str.viewPhotos}`}
              onPress={() =>
                router.push({
                  pathname: '/(homeowner)/photos',
                  params: { tab: 'all', room: s.name },
                })
              }
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
