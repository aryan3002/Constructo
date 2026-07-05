/**
 * Design — homeowner Design tab. Rebuilt to faithfully match screen-design.jsx
 * prototype composition (Neev-2_owner):
 *
 *   1. DesignProfileCard banner (top, always visible, taps → profiler)
 *   2. SubTabs: Profile | Plans | Selections
 *
 * Profile tab → DPHub (the Profiler progress card + areas accordion),
 *               surfaced inline here as in the prototype where DPHub lives
 *               inside the Design tab's "Profile" sub-tab.
 *
 * Plans → grouped drawings, pending-approval callout.
 * Selections → rooms × decided + pending rows, References button per room.
 *
 * All real data hooks are preserved from the previous implementation.
 * Prototype-specific UI components (ConfPill, DPProgress, accordion, etc.)
 * are built inline with RN + tokens — no hardcoded hex values.
 */
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { ApiError, design, homeowner } from '../../src/api/client'
import { chatApi } from '../../src/api/chat'
import type { Drawing } from '../../src/api/types'
import { useAuth } from '../../src/auth/AuthContext'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Eyebrow,
  FadeInUp,
  FLOATING_NAV_CLEARANCE,
  ListRow,
  Micro,
  Screen,
  SegmentedTabs,
  Small,
  StatusPill,
  Title,
  useToast,
} from '../../src/ui'
import {
  areaProgressLabel,
  confidenceBand,
  designChatDraft,
  designChatRoute,
  groupAreasByKind,
  PROFILER_STR,
} from '../../src/homeowner/design_profiler.util'
import { briefStateCard } from '../../src/homeowner/brief_state.util'
import { briefBornDecisions } from '../../src/homeowner/brief_selections.util'
import { clarCountLabel, openClarifications } from '../../src/homeowner/clarifications.util'
import {
  DESIGN_STR,
  drawingDate,
  drawingKindLabel,
  groupSelections,
  isProfileEmpty,
  profileText,
  profileTone,
  selectionStatus,
} from './_design.util'

// ---------------------------------------------------------------------------
// Colour helpers (Calm Cockpit, Daylight palette)
// ---------------------------------------------------------------------------

/** Confidence pill — high=green, building=amber, low=grey (never red). */
function ConfPill({ confidence, size = 'md' }: { confidence: number; size?: 'sm' | 'md' }) {
  const { theme } = useTheme()
  const c = theme.colors
  const band = confidenceBand(confidence)
  const sm = size === 'sm'

  const bg =
    band.band === 'high'
      ? AP.chip
      : band.band === 'building'
        ? 'rgba(232,163,23,0.15)'
        : AP.surfaceContainer

  const fg =
    band.band === 'high' ? c.ok : band.band === 'building' ? c.warn : c.quiet

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: sm ? 24 : 28,
        paddingHorizontal: sm ? 9 : 11,
        borderRadius: theme.radii.pill,
        backgroundColor: bg,
      }}
    >
      <Feather
        name={band.icon as React.ComponentProps<typeof Feather>['name']}
        size={sm ? 12 : 13}
        color={fg}
      />
      <Micro style={{ color: fg, fontWeight: '600', fontSize: sm ? 11.5 : 12 }}>
        AI: {band.label}
      </Micro>
    </View>
  )
}

/** Segmented progress bar (not a ring, not a %). */
function DPProgressBar({ pct, tone }: { pct: number; tone: 'ok' | 'warn' }) {
  const { theme } = useTheme()
  const fill = tone === 'ok' ? theme.colors.ok : theme.colors.warn
  return (
    <View
      style={{
        height: 8,
        borderRadius: theme.radii.pill,
        backgroundColor: AP.surfaceContainer,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.min(100, pct)}%`,
          height: '100%',
          borderRadius: theme.radii.pill,
          backgroundColor: fill,
        }}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

type DrawingGroup = { label: string; kinds: string[]; drawings: Drawing[] }

function buildDrawingGroups(
  drawings: Drawing[],
  T: Record<string, string>,
): DrawingGroup[] {
  const groups: DrawingGroup[] = [
    { label: T.groupFloorPlan, kinds: ['plan', 'section', 'structural'], drawings: [] },
    { label: T.groupElecPlumb, kinds: ['electrical', 'plumbing'], drawings: [] },
    { label: T.groupElevations, kinds: ['elevation'], drawings: [] },
    { label: T.groupOther, kinds: ['other'], drawings: [] },
  ]
  for (const d of drawings) {
    const g = groups.find((g) => g.kinds.includes(d.kind)) ?? groups[groups.length - 1]
    g.drawings.push(d)
  }
  return groups.filter((g) => g.drawings.length > 0)
}

// ---------------------------------------------------------------------------
// String tables
// ---------------------------------------------------------------------------

const TAB_STR = {
  en: {
    tabProfile: 'Profile',
    tabPlans: 'Plans',
    tabSelections: 'Selections',
    bannerEyebrow: 'YOUR STYLE',
    bannerUpdated: 'Updated',
    bannerEmpty: 'Add your style profile',
    pendingApprovalCallout: 'Pending your approval',
    pendingApprovalBody:
      'Your builder shared plans waiting for your review. Tap any drawing to see details.',
    refsButton: 'References',
    decidedLabel: 'Decided',
    pendingLabel: 'Pending',
    wholeHouse: 'Whole house',
    groupFloorPlan: 'Floor plans',
    groupElecPlumb: 'Electrical & plumbing',
    groupElevations: 'Elevations & 3D',
    groupOther: 'Other drawings',
    viewDrawing: 'Review',
    // Profiler hub (Profile tab)
    profileEyebrow: 'DESIGN PROFILE',
    profileH3: 'Building your brief',
    addInspiration: 'Add inspiration',
    designChat: 'Design chat',
    scopeLabel: 'Scope',
    wholeHouseScope: 'Whole house',
    contributorsLabel: 'Contributors',
    areasFromAI: 'FROM THE AI',
    themeSuggestions: 'Theme suggestions',
    themeSub: '3 directions, with evidence',
    conflictLabel: 'Preferences differ',
    conflictSub: 'Resolve together',
    briefPreview: 'Brief preview',
    briefSub: 'Whole-house design brief',
    howItWorks: 'How this works',
    notStarted: 'Not started',
    ready: 'Ready',
    inProgress: 'In progress',
    // Brief-born selections (the payoff — routed Specs reaching the homeowner)
    fromYourBrief: 'From your design brief',
    briefBornCountOne: 'Your brief became a material choice — 1 waiting on you',
    briefBornCountMany: 'Your brief became material choices — {count} waiting on you',
    briefBornCountNoneWaiting: 'Your brief became material choices — all decided',
  } as Record<string, string>,
  hi: {
    tabProfile: 'प्रोफ़ाइल',
    tabPlans: 'नक्शे',
    tabSelections: 'चुनाव',
    bannerEyebrow: 'आपकी शैली',
    bannerUpdated: 'अपडेट किया गया',
    bannerEmpty: 'अपनी शैली प्रोफ़ाइल जोड़ें',
    pendingApprovalCallout: 'आपकी मंज़ूरी बाकी',
    pendingApprovalBody:
      'आपके बिल्डर ने समीक्षा के लिए नक्शे साझा किए हैं। विवरण देखने के लिए किसी भी नक्शे पर टैप करें।',
    refsButton: 'संदर्भ',
    decidedLabel: 'तय हुआ',
    pendingLabel: 'लंबित',
    wholeHouse: 'पूरा घर',
    groupFloorPlan: 'फ़्लोर प्लान',
    groupElecPlumb: 'बिजली और प्लंबिंग',
    groupElevations: 'एलिवेशन और 3D',
    groupOther: 'अन्य नक्शे',
    viewDrawing: 'समीक्षा करें',
    profileEyebrow: 'डिज़ाइन प्रोफ़ाइल',
    profileH3: 'आपकी ब्रीफ़ बन रही है',
    addInspiration: 'प्रेरणा जोड़ें',
    designChat: 'डिज़ाइन चैट',
    scopeLabel: 'दायरा',
    wholeHouseScope: 'पूरा घर',
    contributorsLabel: 'योगदानकर्ता',
    areasFromAI: 'AI की ओर से',
    themeSuggestions: 'थीम सुझाव',
    themeSub: '3 दिशाएं, सबूत सहित',
    conflictLabel: 'पसंद अलग-अलग हैं',
    conflictSub: 'साथ मिलकर तय करें',
    briefPreview: 'ब्रीफ़ पूर्वावलोकन',
    briefSub: 'पूरे घर की डिज़ाइन ब्रीफ़',
    howItWorks: 'यह कैसे काम करता है',
    notStarted: 'शुरू नहीं हुआ',
    ready: 'तैयार',
    inProgress: 'जारी है',
    fromYourBrief: 'आपकी डिज़ाइन ब्रीफ़ से',
    briefBornCountOne: 'आपकी ब्रीफ़ से एक सामग्री चुनाव बना — 1 आप पर लंबित',
    briefBornCountMany: 'आपकी ब्रीफ़ से सामग्री चुनाव बने — {count} आप पर लंबित',
    briefBornCountNoneWaiting: 'आपकी ब्रीफ़ से सामग्री चुनाव बने — सभी तय हो गए',
  } as Record<string, string>,
}

/** Map decision.state → Status tone for the StatusPill (mirrors
 * app/(homeowner)/decisions/[id].tsx's stateStatus so the pill on the Design
 * tab matches the one on the decision detail screen). */
function briefDecisionStatus(state: string): 'warn' | 'ok' | 'risk' | 'info' {
  switch (state) {
    case 'pending':
      return 'warn'
    case 'acknowledged':
      return 'info'
    case 'resolved':
      return 'ok'
    case 'rejected':
    case 'escalated':
      return 'risk'
    default:
      return 'info'
  }
}

// ---------------------------------------------------------------------------
// Profile tab: DPHub inline
// ---------------------------------------------------------------------------

function DPHubSection({ profileId }: { profileId?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { siteId: authSiteId } = useAuth()

  // Fetch the profiler profile by site
  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  // "Design chat" → her real builder/crew thread, not a stub. Resolved the
  // same way the Messages inbox resolves it (get-or-create on the shared
  // queryKey, so a prior inbox visit is a cache hit) — then a deep-link with
  // a prefilled draft so she never faces a blank composer.
  const openDesignChat = async (draft: string) => {
    if (!authSiteId) {
      toast('Pick your project chat.')
      router.push('/(homeowner)/messages')
      return
    }
    try {
      const conv = await qc.fetchQuery({
        queryKey: ['homeowner', 'channel', authSiteId],
        queryFn: () => chatApi.homeownerChannel(authSiteId),
      })
      router.push(designChatRoute(conv, draft))
    } catch {
      toast('Pick your project chat.')
      router.push('/(homeowner)/messages')
    }
  }

  const q = useQuery({
    queryKey: ['design', 'profiler', 'by-site', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })
  const pid = q.data?.id

  // State-aware "whose move is it" banner — same brief rendering the brief
  // screen uses (design.brief), so the state is always in sync. A 404 (no
  // brief shared yet) is a calm null, not an error.
  const briefQ = useQuery({
    queryKey: ['design', 'profiler', 'brief', pid, 'homeowner'],
    queryFn: () => design.brief(pid as string, 'homeowner'),
    enabled: !!pid,
    retry: false,
  })
  const briefState = briefQ.data?.state ?? null
  const card = briefState ? briefStateCard(briefState) : null
  const noBriefYet = briefQ.isError && (briefQ.error as ApiError | null)?.status === 404

  // Gates the first-brief CTA to owners/co-owners — a family member sees an
  // explainer instead (only an owner can kick off generation).
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canApprove = capsQ.data?.can_approve ?? false

  // "Questions for you" — open clarifications the AI needs answered.
  const clarQ = useQuery({
    queryKey: ['design', 'profiler', 'clarifications', pid],
    queryFn: () => design.clarifications(pid as string),
    enabled: !!pid,
    retry: false,
  })
  const openClars = openClarifications(clarQ.data ?? [])

  const regenMut = useMutation({
    mutationFn: () => design.generateBrief(pid as string),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: unknown) => toast((e as Error).message),
  })

  // First-brief generation (brief 404s — nothing to regenerate yet). Separate
  // from regenMut because only this path navigates straight to the new brief;
  // the in-banner "Regenerate brief" CTA (revision_requested) stays on DPHub.
  const genFirstMut = useMutation({
    mutationFn: () => design.generateBrief(pid as string),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
      router.push('/(homeowner)/design/brief')
    },
    onError: (e: unknown) => toast((e as Error).message),
  })

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ interior: true })

  const areas = q.data?.areas ?? []
  const groups = groupAreasByKind(areas)
  const ranked = areas.reduce((s, a) => s + (a.my_ranked_count ?? 0), 0)
  const recTotal = areas.reduce((s, a) => s + a.recommended_count, 0)
  const pct = recTotal > 0 ? Math.round((ranked / recTotal) * 100) : 0

  // Overall confidence across all areas — average (matches design/profiler.tsx).
  const avgConfidence =
    areas.length > 0 ? areas.reduce((s, a) => s + a.confidence, 0) / areas.length : 0

  const catIcon: Record<string, React.ComponentProps<typeof Feather>['name']> = {
    house_build: 'home',
    interior: 'image',
    element: 'layers',
  }

  if (propQ.isLoading || q.isLoading) {
    return (
      <Card padded>
        <Small muted>Loading design profile…</Small>
      </Card>
    )
  }

  // A 404 from the profiler means the designer hasn't started this home's design
  // profile yet — a calm "on its way" state, NOT an error. Only genuine failures
  // (network / 500 / the property lookup) show the retry card.
  const notStarted = q.isError && (q.error as ApiError | null)?.status === 404
  if (propQ.isError || (q.isError && !notStarted)) {
    return (
      <Card padded>
        <BodyStrong style={{ color: c.warn }}>Couldn't load design profile</BodyStrong>
        <Button
          title="Try again"
          variant="secondary"
          size="md"
          onPress={() => void q.refetch()}
        />
      </Card>
    )
  }

  if (notStarted) {
    return (
      <Card padded>
        <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' }}>
          <Feather name="feather" size={18} color={c.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <BodyStrong>Your design profile is on its way</BodyStrong>
            <Small muted>
              Your designer will set up your style ranking here. You’ll rank what you love and
              we’ll turn it into a clear brief — nothing for you to do yet.
            </Small>
          </View>
        </View>
      </Card>
    )
  }

  return (
    <View style={{ gap: SPACE.md }}>
      {/* Progress card */}
      <Card
        padded
        style={{ backgroundColor: AP.chip + '40', borderColor: c.ok + '30' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm }}>
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ color: c.ok }}>Design profile</Eyebrow>
            <Title style={{ marginTop: 4 }}>Building your brief</Title>
          </View>
          <ConfPill confidence={avgConfidence} />
        </View>
        <View style={{ marginTop: SPACE.md }}>
          <DPProgressBar pct={pct} tone="warn" />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Small muted>{ranked} references ranked</Small>
          <Small style={{ fontWeight: '600', color: c.ok }}>{pct}% complete</Small>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
          <Button
            title="Add inspiration"
            variant="primary"
            size="md"
            leading={<Feather name="plus" size={16} color={c.onAccent} />}
            onPress={() => router.push('/(homeowner)/design/profiler')}
            style={{ flex: 1 }}
          />
          <Button
            title="Design chat"
            variant="secondary"
            size="md"
            leading={<Feather name="message-circle" size={16} color={c.accentDeep} />}
            onPress={() =>
              void openDesignChat(designChatDraft({ briefVersion: briefQ.data?.version ?? undefined }))
            }
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {/* Brief state banner — always says whose move it is */}
      {card ? (
        <Card padded>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm }}>
            <View style={{ flex: 1, gap: 4 }}>
              <BodyStrong>{card.title}</BodyStrong>
              <Small muted>{card.body}</Small>
            </View>
            <StatusPill status={card.tone} size="sm" />
          </View>
          {card.cta ? (
            <View style={{ marginTop: SPACE.md }}>
              {card.cta === 'view_brief' ? (
                <Button
                  title="View brief"
                  variant="secondary"
                  size="md"
                  leading={<Feather name="clipboard" size={16} color={c.accentDeep} />}
                  onPress={() => router.push('/(homeowner)/design/brief')}
                />
              ) : (
                <Button
                  title="Regenerate brief"
                  variant="secondary"
                  size="md"
                  loading={regenMut.isPending}
                  leading={<Feather name="refresh-cw" size={16} color={c.accentDeep} />}
                  onPress={() => regenMut.mutate()}
                />
              )}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* First-brief CTA — no brief exists yet (404) but at least one area has
          enough ranked references to be "ready". Owners/co-owners can kick off
          generation; everyone else sees an honest explainer instead. */}
      {noBriefYet && areas.some((a) => a.status === 'ready') ? (
        <Card padded>
          {canApprove ? (
            <>
              <BodyStrong>Your first areas are ready</BodyStrong>
              <Small muted style={{ marginTop: 4 }}>
                We can put together a whole-house brief from what's ranked so far.
              </Small>
              <View style={{ marginTop: SPACE.md }}>
                <Button
                  title="Get my brief"
                  variant="primary"
                  size="md"
                  loading={genFirstMut.isPending}
                  leading={<Feather name="file-text" size={16} color={c.onAccent} />}
                  onPress={() => genFirstMut.mutate()}
                />
              </View>
            </>
          ) : (
            <Small muted>An owner can generate the brief when you're ready.</Small>
          )}
        </Card>
      ) : null}

      {/* "Questions for you" — open clarifications, press → area's AI Notes tab */}
      {openClars.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clarCountLabel(openClars.length)}
          onPress={() => {
            const first = openClars[0]
            const area = areas.find((a) => a.id === first.area_id)
            if (!area) {
              // No area match (e.g. a whole-profile question) — nothing to
              // deep-link into yet, so fall back to the profiler overview.
              router.push('/(homeowner)/design/profiler')
              return
            }
            router.push({
              pathname: '/(homeowner)/design/profiler/[area]',
              params: { area: area.id, pid: q.data!.id, key: area.area_key, tab: 'notes' },
            })
          }}
        >
          <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.secondary }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
              <Feather name="help-circle" size={18} color={c.secondary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <BodyStrong>{clarCountLabel(openClars.length)}</BodyStrong>
                <Small muted numberOfLines={1}>
                  {openClars[0].question}
                </Small>
              </View>
              <Feather name="chevron-right" size={18} color={c.textMute} style={{ marginTop: 2 }} />
            </View>
          </Card>
        </Pressable>
      ) : null}

      {/* Scope + Contributors row */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <Pressable
          onPress={() => toast('Scope: set up via design profiler intake.')}
          style={{ flex: 1 }}
          accessibilityRole="button"
        >
          <Card padded style={{ flex: 1 }}>
            <Small muted>Scope</Small>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Feather name="home" size={16} color={c.textMute} />
              <Body style={{ fontWeight: '600', fontSize: 14 }}>Whole house</Body>
            </View>
          </Card>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(homeowner)/members')}
          style={{ flex: 1 }}
          accessibilityRole="button"
        >
          <Card padded style={{ flex: 1 }}>
            <Small muted>Contributors</Small>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: SPACE.sm }}>
              <Feather name="users" size={16} color={c.textMute} />
              <Small muted>Manage</Small>
            </View>
          </Card>
        </Pressable>
      </View>

      {/* Category accordions */}
      <View style={{ gap: SPACE.sm }}>
        {groups.map((group) => {
          const readyCount = group.areas.filter((a) => a.status === 'ready').length
          const isOpen = !!openCats[group.kind]
          return (
            <Card key={group.kind} padded={false}>
              {/* Accordion header */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpenCats((o) => ({ ...o, [group.kind]: !o[group.kind] }))}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.md,
                  padding: SPACE.lg,
                  backgroundColor: pressed ? AP.surfaceLow : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: theme.radii.chip,
                    backgroundColor: AP.surfaceContainer,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Feather name={catIcon[group.kind] ?? 'layers'} size={18} color={c.textMute} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600', fontSize: 15 }}>{group.label}</Body>
                  <Small muted style={{ marginTop: 1 }}>
                    {readyCount} of {group.areas.length} areas ready
                  </Small>
                </View>
                <Feather
                  name={isOpen ? 'chevron-down' : 'chevron-right'}
                  size={18}
                  color={c.textMute}
                />
              </Pressable>

              {/* Area rows */}
              {isOpen ? (
                <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm }}>
                  {group.areas.map((a) => {
                    const band = confidenceBand(a.confidence)
                    const dotColor =
                      band.band === 'high' ? c.ok : band.band === 'building' ? c.warn : c.quiet
                    const checkIcon: React.ComponentProps<typeof Feather>['name'] =
                      a.status === 'ready'
                        ? 'check-circle'
                        : a.status === 'in_progress'
                          ? 'circle'
                          : 'circle'
                    const checkColor =
                      a.status === 'ready' ? c.ok : a.status === 'in_progress' ? c.warn : c.quiet
                    const progLabel = areaProgressLabel(0, a.recommended_count)
                    return (
                      <Pressable
                        key={a.id}
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: '/(homeowner)/design/profiler/[area]',
                            params: { area: a.id, pid: q.data!.id, key: a.area_key },
                          })
                        }
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: SPACE.sm + 2,
                          paddingVertical: 11,
                          borderTopWidth: 1,
                          borderTopColor: theme.colors.line,
                          backgroundColor: pressed ? AP.surfaceLow : 'transparent',
                        })}
                      >
                        <Feather name={checkIcon} size={18} color={checkColor} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Body style={{ fontSize: 14, fontWeight: '500' }}>
                            {a.area_key.replace(/_/g, ' ')}
                          </Body>
                          <Small muted style={{ marginTop: 1 }}>
                            {progLabel}
                            {a.has_conflict ? ' · needs a decision' : ''}
                          </Small>
                        </View>
                        {a.has_conflict ? (
                          <Feather name="users" size={15} color={c.secondary} />
                        ) : null}
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: dotColor,
                            flexShrink: 0,
                          }}
                        />
                        <Feather name="chevron-right" size={16} color={c.textMute} />
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </Card>
          )
        })}
      </View>

      {/* AI outputs */}
      <Eyebrow style={{ color: c.textMute, marginTop: SPACE.sm }}>FROM THE AI</Eyebrow>
      <Card padded={false}>
        <View style={{ paddingHorizontal: SPACE.lg }}>
          <ListRow
            icon="star"
            title="Theme suggestions"
            subtitle="Directions with evidence"
            onPress={() => router.push('/(homeowner)/design/brief')}
            right={<Feather name="chevron-right" size={18} color={c.textMute} />}
          />
          <ListRow
            icon="clipboard"
            title="Brief preview"
            subtitle="Whole-house design brief"
            onPress={() => router.push('/(homeowner)/design/brief')}
            right={<Feather name="chevron-right" size={18} color={c.textMute} />}
            last
          />
        </View>
      </Card>

      <Button
        title="How this works"
        variant="ghost"
        size="md"
        leading={<Feather name="info" size={16} color={c.accentDeep} />}
        onPress={() => router.push('/(homeowner)/design/profiler')}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Design() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<string>('profile')

  const STR = DESIGN_STR.en
  const T = TAB_STR.en

  const navClearance = insets.bottom + FLOATING_NAV_CLEARANCE

  // ---- queries ---------------------------------------------------------------
  const profileQ = useQuery({
    queryKey: ['design', 'profile'],
    queryFn: () => homeowner.designProfile(),
  })
  const selectionsQ = useQuery({
    queryKey: ['design', 'selections'],
    queryFn: () => homeowner.selections(),
  })
  const drawingsQ = useQuery({
    queryKey: ['design', 'drawings'],
    queryFn: () => homeowner.drawings(),
  })
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const decisionsQ = useQuery({
    queryKey: ['homeowner', 'decisions'],
    queryFn: () => homeowner.decisions(),
  })
  // Real space names (id → name) so the Selections tab shows a room name
  // instead of a raw UUID, and the References chip can push a NAME the
  // profiler bridge (areaForRoom) actually matches against.
  const propertyQ = useQuery({
    queryKey: ['design', 'property'],
    queryFn: () => homeowner.property(),
  })

  const drawings = drawingsQ.data ?? []
  const selections = selectionsQ.data ?? []
  const profile = profileQ.data
  const canDesign = capsQ.data?.can_design ?? false
  const briefDecisions = briefBornDecisions(decisionsQ.data ?? [])
  const briefDecisionsPending = briefDecisions.filter((d) => d.state === 'pending').length

  const tones = profileTone(profile)
  const profileSummary = profileText(profile)
  const profileUpdated = profile?.updated_at
    ? drawingDate(profile.updated_at, 'en')
    : null

  // drawing groups
  const drawingGroups = buildDrawingGroups(drawings, T)

  // selection groups — resolved against real space names, not raw UUIDs
  const spaceNameById = Object.fromEntries(
    (propertyQ.data?.spaces ?? []).map((s) => [s.id, s.name]),
  )
  const selGroups = groupSelections(selections, T.wholeHouse, spaceNameById)

  // ============================================================================
  // TAB: Profile — DPHub inline
  // ============================================================================
  const renderProfileTab = () => (
    <DPHubSection />
  )

  // ============================================================================
  // TAB: Plans — drawings grouped by kind, pending-approval callout
  // ============================================================================
  const renderPlansTab = () => (
    <View style={{ gap: SPACE.xl }}>
      {/* Pending approval callout — amber card (prototype: amber accent) */}
      {drawings.length > 0 ? (
        <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
          <Eyebrow style={{ color: c.warn, marginBottom: 6 }}>
            {T.pendingApprovalCallout.toUpperCase()} ({drawings.length})
          </Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radii.chip,
                backgroundColor: 'rgba(232,163,23,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Feather name="layout" size={19} color={c.warn} />
            </View>
            <View style={{ flex: 1 }}>
              <Body style={{ fontSize: 14.5, fontWeight: '600' }}>
                {drawings[0]?.title ?? 'Drawing'}
              </Body>
              <Small muted style={{ marginTop: 1 }}>Sent by contractor</Small>
            </View>
            <Button
              title="Review"
              variant="ghost"
              size="md"
              onPress={() =>
                drawings[0] && router.push(`/(homeowner)/drawings/${drawings[0].id}`)
              }
            />
          </View>
        </Card>
      ) : null}

      {drawingsQ.isLoading ? (
        <Card padded><Small muted>Loading plans…</Small></Card>
      ) : drawingsQ.isError ? (
        <Card padded>
          <Small muted>{STR.errorTitle}</Small>
          <Button title={STR.retry} variant="secondary" size="md" onPress={() => void drawingsQ.refetch()} />
        </Card>
      ) : drawings.length === 0 ? (
        <Card variant="quiet" padded style={{ alignItems: 'center', gap: SPACE.xs }}>
          <Feather name="layout" size={22} color={c.textMute} />
          <BodyStrong style={{ textAlign: 'center' }}>{STR.plansEmptyTitle}</BodyStrong>
          <Small muted style={{ textAlign: 'center' }}>{STR.plansEmpty}</Small>
        </Card>
      ) : (
        <View style={{ gap: SPACE.xl }}>
          {drawingGroups.map((group) => (
            <View key={group.label} style={{ gap: SPACE.md }}>
              <Eyebrow style={{ color: c.textMute }}>{group.label.toUpperCase()}</Eyebrow>
              <Card padded={false}>
                <View style={{ paddingHorizontal: SPACE.lg }}>
                  {group.drawings.map((d, idx) => {
                    const when = drawingDate(d.published_at, 'en')
                    const isLast = idx === group.drawings.length - 1
                    return (
                      <ListRow
                        key={d.id}
                        icon="file-text"
                        title={d.title}
                        subtitle={when ? `${drawingKindLabel(d.kind, STR)} · ${when}` : drawingKindLabel(d.kind, STR)}
                        onPress={() => router.push(`/(homeowner)/drawings/${d.id}`)}
                        last={isLast}
                        right={
                          <View
                            style={{
                              backgroundColor: AP.chip,
                              borderRadius: theme.radii.pill,
                              paddingHorizontal: SPACE.sm,
                              paddingVertical: 2,
                            }}
                          >
                            <Micro style={{ color: c.ok, fontWeight: '700' }}>v{d.version}</Micro>
                          </View>
                        }
                      />
                    )
                  })}
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}
    </View>
  )

  // ============================================================================
  // TAB: Selections — rooms × decided + pending rows
  // ============================================================================
  const renderSelectionsTab = () => (
    <View style={{ gap: SPACE.xl }}>
      {/* "From your design brief" — the payoff: routed Specs reaching the
          homeowner as material choices, via the existing decisions surface. */}
      {briefDecisions.length > 0 ? (
        <View style={{ gap: SPACE.md }}>
          <View style={{ gap: 2 }}>
            <Eyebrow style={{ color: c.accentDeep }}>{T.fromYourBrief.toUpperCase()}</Eyebrow>
            <Small muted>
              {briefDecisionsPending === 0
                ? T.briefBornCountNoneWaiting
                : briefDecisionsPending === 1
                  ? T.briefBornCountOne
                  : T.briefBornCountMany.replace('{count}', String(briefDecisionsPending))}
            </Small>
          </View>
          <Card padded={false}>
            <View style={{ paddingHorizontal: SPACE.lg }}>
              {briefDecisions.map((d, idx) => (
                <ListRow
                  key={d.id}
                  icon="feather"
                  title={d.spec_label ?? d.title}
                  onPress={() => router.push(`/(homeowner)/decisions/${d.id}`)}
                  last={idx === briefDecisions.length - 1}
                  right={
                    <StatusPill
                      status={briefDecisionStatus(d.state)}
                      size="sm"
                      label={d.state === 'pending' ? T.pendingLabel : undefined}
                    />
                  }
                />
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {selectionsQ.isLoading ? (
        <Card padded><Small muted>Loading selections…</Small></Card>
      ) : selectionsQ.isError ? (
        <Card padded>
          <Small muted>{STR.errorTitle}</Small>
          <Button title={STR.retry} variant="secondary" size="md" onPress={() => void selectionsQ.refetch()} />
        </Card>
      ) : selections.length === 0 ? (
        <Card padded><Small muted>{STR.selectionsEmpty}</Small></Card>
      ) : (
        <View style={{ gap: SPACE.lg }}>
          {selGroups.map((group) => {
            const roomSlug = group.roomSlug
            const decidedItems = group.items.filter((s) =>
              ['approved', 'final', 'done'].includes(s.status?.toLowerCase()),
            )
            const pendingItems = group.items.filter(
              (s) => !['approved', 'final', 'done'].includes(s.status?.toLowerCase()),
            )
            return (
              <Card key={group.spaceId ?? '__whole__'} padded={false}>
                {/* Room header */}
                <View
                  style={{
                    paddingHorizontal: SPACE.lg,
                    paddingTop: SPACE.md,
                    paddingBottom: SPACE.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: SPACE.sm,
                  }}
                >
                  <Body style={{ fontWeight: '700', fontSize: 15 }}>{group.spaceName}</Body>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        `/(homeowner)/design/references/${encodeURIComponent(roomSlug)}`,
                      )
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      height: 32,
                      paddingHorizontal: SPACE.md,
                      borderRadius: theme.radii.pill,
                      backgroundColor: pressed ? AP.surfaceContainer : AP.surfaceLow,
                      borderWidth: 1,
                      borderColor: theme.colors.line,
                    })}
                  >
                    <Feather name="image" size={14} color={c.textMute} />
                    <Small style={{ fontWeight: '600', color: c.textMute }}>
                      {T.refsButton}
                    </Small>
                  </Pressable>
                </View>

                {/* Selection rows */}
                <View style={{ paddingHorizontal: SPACE.lg }}>
                  {group.items.map((sel, idx) => {
                    const decided = ['approved', 'final', 'done'].includes(
                      sel.status?.toLowerCase(),
                    )
                    const isLast = idx === group.items.length - 1
                    return (
                      <View
                        key={sel.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: SPACE.md,
                          paddingVertical: 11,
                          borderTopWidth: 1,
                          borderTopColor: theme.colors.line,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {!decided ? (
                              <Feather name="zap" size={14} color={c.warn} />
                            ) : null}
                            <Body
                              numberOfLines={1}
                              style={{
                                fontSize: 14,
                                fontWeight: decided ? '500' : '600',
                                color: decided ? c.textMute : c.warn,
                                flex: 1,
                              }}
                            >
                              {sel.item}
                              {!decided ? ' — pending' : ''}
                            </Body>
                          </View>
                          <Small muted numberOfLines={1} style={{ marginTop: 2 }}>
                            {sel.choice}
                          </Small>
                        </View>
                        {decided ? (
                          <Feather name="check-circle" size={16} color={c.ok} />
                        ) : (
                          <StatusPill status="warn" size="sm" label={T.pendingLabel} />
                        )}
                      </View>
                    )
                  })}
                </View>
              </Card>
            )
          })}
        </View>
      )}

      {canDesign ? (
        <Button
          title={STR.addSelection}
          variant="secondary"
          size="md"
          leading={<Feather name="plus" size={16} color={c.accentDeep} />}
          onPress={() => router.push('/(homeowner)/design/select')}
        />
      ) : null}
    </View>
  )

  // ============================================================================
  // DesignProfileCard banner — prototype-faithful composition
  // (green gradient background, sparkles icon, style eyebrow, title, meta)
  // ============================================================================

  return (
    <Screen style={{ paddingBottom: navClearance }}>
      {/* DesignProfileCard banner — always at top, tapping → profiler */}
      <FadeInUp>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your design profile"
          onPress={() => router.push('/(homeowner)/design/profiler')}
        >
          <Card
            padded
            style={{
              backgroundColor: AP.chip + '40',
              borderColor: c.ok + '30',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm + 2 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: theme.radii.chip,
                  backgroundColor: AP.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Feather name="feather" size={19} color={c.ok} />
              </View>
              <View style={{ flex: 1 }}>
                <Eyebrow style={{ color: c.ok }}>Your style</Eyebrow>
                {profileSummary ? (
                  <Body style={{ fontSize: 15.5, marginTop: 3, fontWeight: '600' }} numberOfLines={2}>
                    {profileSummary}
                  </Body>
                ) : isProfileEmpty(profile) ? (
                  <Body style={{ fontSize: 15.5, marginTop: 3 }}>
                    {T.bannerEmpty}
                  </Body>
                ) : null}
                {tones.length > 0 ? (
                  <Small muted style={{ marginTop: 3 }}>
                    Based on your references
                    {profileUpdated ? ` · updated ${profileUpdated}` : ''}
                  </Small>
                ) : null}
              </View>
              <Feather name="chevron-right" size={18} color={c.textMute} style={{ marginTop: 6 }} />
            </View>
          </Card>
        </Pressable>
      </FadeInUp>

      {/* SubTabs: Profile | Plans | Selections */}
      <FadeInUp delay={30}>
        <SegmentedTabs
          tabs={[
            { key: 'profile', label: T.tabProfile },
            { key: 'plans', label: T.tabPlans },
            { key: 'selections', label: T.tabSelections },
          ]}
          active={activeTab}
          onChange={setActiveTab}
          style={{ paddingHorizontal: 0 }}
        />
      </FadeInUp>

      {/* Tab content */}
      <FadeInUp delay={60}>
        {activeTab === 'profile'
          ? renderProfileTab()
          : activeTab === 'plans'
            ? renderPlansTab()
            : renderSelectionsTab()}
      </FadeInUp>
    </Screen>
  )
}
