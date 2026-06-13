/**
 * Design — the homeowner's "Calm Cockpit" design hub (handoff §5 "Design").
 *
 * Wave 2b layout: a persistent DesignProfileCard banner at the top, then
 * `SegmentedTabs [Profile · Plans · Selections]` below.
 *
 * Tab mapping (every real-data section preserved; reorganised, not removed):
 *   Profile  — style-profile card, "decide together" conflicts, room coherence
 *              (consistency-check rows), inspiration board, monthly-digest stub.
 *   Plans    — published drawings grouped by kind; pending-approval callout;
 *              each row → `/(homeowner)/drawings/[id]` (new Drawing detail screen).
 *   Selections — room-by-room selections grouped by space; pending → decisions/[id]
 *                or the select flow; each room has a "References →" button →
 *                `/(homeowner)/design/references/[room]`.
 *
 * Philosophy: seek feedback, never gatekeep. Real photos only, Feather icons,
 * honest stubs (approve + digest), single language, advisory design tone never red.
 */
import { useState } from 'react'
import { Alert, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link, useRouter } from 'expo-router'

import { homeowner } from '../../src/api/client'
import type {
  ConsistencyCheck,
  DesignConflict,
  DesignSelection,
  Drawing,
} from '../../src/api/types'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  CalmCard,
  Display,
  H2,
  LinkRow,
  Micro,
  MonoSm,
  PhotoTile,
  Screen,
  SegmentedTabs,
  Small,
  StatusPill,
  Title,
  FLOATING_NAV_CLEARANCE,
  FadeInUp,
} from '../../src/ui'
import {
  DESIGN_STR,
  drawingDate,
  drawingKindLabel,
  drawingSummary,
  isProfileEmpty,
  profileConflicts,
  profileContributors,
  profileText,
  profileTone,
  selectionStatus,
} from './_design.util'

// ---- local STR additions (for new segmented-tab copy) -----------------------

const TAB_STR = {
  en: {
    tabProfile: 'Profile',
    tabPlans: 'Plans',
    tabSelections: 'Selections',
    bannerEyebrow: 'YOUR STYLE',
    bannerUpdated: 'Updated',
    bannerEmpty: 'Add your style profile',
    bannerTap: 'Tap to set up →',
    pendingApprovalCallout: 'Pending your approval',
    pendingApprovalBody:
      'Your builder shared plans waiting for your review. Tap any drawing to see details.',
    noDrawingsInGroup: 'None yet.',
    refsButton: 'References',
    decidedLabel: 'Decided',
    pendingLabel: 'Pending',
    allDecided: 'All selections decided.',
    wholeHouse: 'Whole house',
    groupFloorPlan: 'Floor plans',
    groupElecPlumb: 'Electrical & plumbing',
    groupElevations: 'Elevations',
    groupOther: 'Other drawings',
    viewDrawing: 'View',
  } as Record<string, string>,
  hi: {
    tabProfile: 'प्रोफ़ाइल',
    tabPlans: 'नक्शे',
    tabSelections: 'चयन',
    bannerEyebrow: 'आपकी शैली',
    bannerUpdated: 'अपडेटेड',
    bannerEmpty: 'अपनी शैली प्रोफ़ाइल जोड़ें',
    bannerTap: 'सेट करने के लिए टैप करें →',
    pendingApprovalCallout: 'आपकी स्वीकृति बाकी',
    pendingApprovalBody:
      'आपके बिल्डर ने नक्शे साझा किए हैं जो आपकी समीक्षा की प्रतीक्षा कर रहे हैं। विवरण देखने के लिए किसी भी नक्शे पर टैप करें।',
    noDrawingsInGroup: 'अभी कोई नहीं।',
    refsButton: 'संदर्भ',
    decidedLabel: 'तय',
    pendingLabel: 'बाकी',
    allDecided: 'सभी चयन तय हो गए।',
    wholeHouse: 'पूरा घर',
    groupFloorPlan: 'फ़्लोर प्लान',
    groupElecPlumb: 'इलेक्ट्रिकल और प्लंबिंग',
    groupElevations: 'एलिवेशन',
    groupOther: 'अन्य नक्शे',
    viewDrawing: 'देखें',
  } as Record<string, string>,
}

// ---- helpers -----------------------------------------------------------------

/** Hex + alpha → rgba (warm-amber tint). */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

type DrawingGroup = { label: string; kinds: string[]; drawings: Drawing[] }

function groupDrawings(drawings: Drawing[], T: Record<string, string>): DrawingGroup[] {
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

// Group selections by space name (null/undefined space → "Whole house").
function groupSelections(
  selections: DesignSelection[],
  wholeHouseLabel: string,
): Array<{ spaceId: string | null; spaceName: string; items: DesignSelection[] }> {
  const map = new Map<string, { spaceId: string | null; spaceName: string; items: DesignSelection[] }>()
  for (const s of selections) {
    const key = s.space_id ?? '__whole__'
    if (!map.has(key)) {
      map.set(key, { spaceId: s.space_id, spaceName: s.space_id ? s.space_id : wholeHouseLabel, items: [] })
    }
    map.get(key)!.items.push(s)
  }
  return Array.from(map.values())
}

// ---- component ---------------------------------------------------------------

export default function Design() {
  const { lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const STR = DESIGN_STR[lang as 'en' | 'hi'] ?? DESIGN_STR.en
  const T = TAB_STR[lang as 'en' | 'hi'] ?? TAB_STR.en
  const c = theme.colors

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
  const referencesQ = useQuery({
    queryKey: ['design', 'references'],
    queryFn: () => homeowner.designReferences(),
  })
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })

  const refs = referencesQ.data ?? []
  const canDesign = capsQ.data?.can_design ?? false
  const drawings = drawingsQ.data ?? []
  const selections = selectionsQ.data ?? []
  const profile = profileQ.data

  // ---- local state -----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<string>('profile')
  const [advice, setAdvice] = useState<Record<string, ConsistencyCheck>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)

  // ---- mutations -------------------------------------------------------------
  const addRefMut = useMutation({
    mutationFn: (image_url: string) => homeowner.references({ image_url, source: 'upload' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'references'] })
      Alert.alert(STR.inspirationTitle, STR.added)
    },
    onError: (err: Error) => Alert.alert(STR.errorTitle, err.message),
  })

  const resolveMut = useMutation({
    mutationFn: (vars: { conflict: DesignConflict; choice: string }) =>
      homeowner.resolveDesignConflict({
        item: vars.conflict.item,
        choice: vars.choice,
        space_id: vars.conflict.room ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'profile'] })
      void qc.invalidateQueries({ queryKey: ['design', 'selections'] })
      Alert.alert(STR.conflictsTitle, STR.conflictResolved)
    },
    onError: (err: Error) => Alert.alert(STR.errorTitle, err.message),
  })

  // ---- handlers --------------------------------------------------------------
  async function pickInspiration() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(STR.inspirationTitle, STR.permissionDenied)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 })
    if (result.canceled || !result.assets?.length) return
    addRefMut.mutate(result.assets[0].uri)
  }

  async function checkFit(sel: DesignSelection) {
    setCheckingId(sel.id)
    try {
      const res = await homeowner.consistencyCheck({ item: sel.item, choice: sel.choice })
      setAdvice((prev) => ({ ...prev, [sel.id]: res }))
    } catch (err) {
      Alert.alert(STR.errorTitle, (err as Error).message)
    } finally {
      setCheckingId(null)
    }
  }

  // ---- derived ---------------------------------------------------------------
  const contributors = profileContributors(profile)
  const conflicts = profileConflicts(profile)
  const tones = profileTone(profile)
  const hasPending = drawings.length > 0 // all drawings shown as pending (approve not built)
  const drawingGroups = groupDrawings(drawings, T)
  const selectionGroups = groupSelections(selections, T.wholeHouse /* "whole house" fallback */)

  // ---- render helpers --------------------------------------------------------
  const eyebrow = (text: string) => (
    <Micro color={c.secondary} style={{ letterSpacing: 1.2 }}>
      {text}
    </Micro>
  )

  const chip = (key: string, content: React.ReactNode) => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.paper,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.xs,
      }}
    >
      {content}
    </View>
  )

  const surface = (children: React.ReactNode, extraStyle?: object) => (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          padding: SPACE.lg,
        },
        theme.shadowCard,
        extraStyle,
      ]}
    >
      {children}
    </View>
  )

  // ============================================================================
  // TAB: Profile
  // (style profile card + "decide together" + coherence + inspiration + digest)
  // ============================================================================
  const renderProfileTab = () => (
    <View style={{ gap: SPACE.xl }}>
      {/* 1. Style Profile */}
      {profileQ.isLoading ? (
        surface(<Small muted>{STR.loading}</Small>)
      ) : profileQ.isError ? (
        surface(
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{STR.errorTitle}</BodyStrong>
            <Button title={STR.retry} variant="secondary" onPress={() => void profileQ.refetch()} />
          </View>,
        )
      ) : isProfileEmpty(profile) ? (
        <CalmCard
          status="info"
          eyebrow={STR.styleEyebrow}
          title={STR.profileEmptyTitle}
          body={STR.profileEmptyBody}
        >
          <Link href="/intake" asChild>
            <Button title={STR.setupProfile} block />
          </Link>
        </CalmCard>
      ) : (
        surface(
          <View style={{ gap: SPACE.md }}>
            <View style={{ gap: 4 }}>
              {eyebrow(STR.styleEyebrow)}
              <Title>{STR.styleTitle}</Title>
            </View>

            {profileText(profile) ? <Body muted>{profileText(profile)}</Body> : null}

            {tones.length ? (
              <View style={{ gap: SPACE.sm }}>
                <MonoSm muted style={{ letterSpacing: 0.5 }}>
                  {STR.toneEyebrow}
                </MonoSm>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {tones.map((tone) =>
                    chip(
                      `tone-${tone}`,
                      <>
                        <Feather name="feather" size={12} color={c.accent} />
                        <Small color={c.accentDeep} style={{ fontWeight: '600' }}>
                          {tone}
                        </Small>
                      </>,
                    ),
                  )}
                </View>
              </View>
            ) : null}

            {contributors.length > 0 ? (
              <View style={{ gap: SPACE.sm }}>
                <MonoSm muted style={{ letterSpacing: 0.5 }}>
                  {STR.contributorsTitle.toUpperCase()}
                </MonoSm>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {contributors.map((person) =>
                    chip(
                      `c-${person.member_id ?? person.name}`,
                      <>
                        <Feather
                          name={person.authoritative ? 'user-check' : 'user'}
                          size={12}
                          color={c.textMute}
                        />
                        <BodyStrong>{person.name}</BodyStrong>
                        <Micro muted>
                          {person.authoritative ? STR.authoritativeTag : STR.advisoryTag}
                        </Micro>
                      </>,
                    ),
                  )}
                </View>
              </View>
            ) : null}

            {canDesign ? (
              <Link href="/(homeowner)/design/profile" asChild>
                <Button
                  title={STR.refreshStyle}
                  variant="ghost"
                  size="md"
                  leading={<Feather name="refresh-cw" size={15} color={c.accent} />}
                />
              </Link>
            ) : null}
          </View>,
        )
      )}

      {/* 1b. "Decide together" — calm amber, human picks, AI never adjudicates */}
      {conflicts.length > 0 ? (
        <CalmCard
          status="warn"
          eyebrow={STR.conflictsTitle.toUpperCase()}
          title={STR.conflictsTitle}
          body={STR.conflictsBody}
        >
          <View style={{ gap: SPACE.md }}>
            {conflicts.map((conflict, ci) => (
              <View
                key={`${conflict.item}-${conflict.room ?? 'house'}-${ci}`}
                style={{ gap: SPACE.sm }}
              >
                <BodyStrong>{conflict.item}</BodyStrong>
                {conflict.options.map((opt, oi) => (
                  <View
                    key={`${opt.choice}-${oi}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: SPACE.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Body>{opt.choice}</Body>
                      <Small muted>{opt.by}</Small>
                    </View>
                    {canDesign ? (
                      <Button
                        title={STR.decideTogether}
                        variant="secondary"
                        size="md"
                        loading={resolveMut.isPending}
                        onPress={() => resolveMut.mutate({ conflict, choice: opt.choice })}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </CalmCard>
      ) : null}

      {/* 3. Room-by-room coherence — advisory, never red */}
      <View style={{ gap: SPACE.md }}>
        <View style={{ gap: 4 }}>
          {eyebrow(STR.coherenceEyebrow)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Feather name="grid" size={18} color={c.accent} />
            <H2>{STR.coherenceTitle}</H2>
          </View>
          <Small muted>{STR.coherenceSubtitle}</Small>
        </View>

        {selectionsQ.isLoading ? (
          surface(<Small muted>{STR.loading}</Small>)
        ) : selectionsQ.isError ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <Small muted>{STR.errorTitle}</Small>
              <Button
                title={STR.retry}
                variant="secondary"
                onPress={() => void selectionsQ.refetch()}
              />
            </View>,
          )
        ) : selections.length === 0 ? (
          surface(<Small muted>{STR.selectionsEmpty}</Small>)
        ) : (
          <View style={{ gap: SPACE.md }}>
            {selections.map((sel) => {
              const note = advice[sel.id]
              const advisoryTone = note ? (note.fits ? 'ok' : 'warn') : selectionStatus(sel)
              const safeTone = advisoryTone === 'risk' ? 'warn' : advisoryTone
              return (
                <View
                  key={sel.id}
                  style={[
                    {
                      backgroundColor: c.card,
                      borderRadius: theme.radii.card,
                      borderWidth: 1,
                      borderColor: c.line,
                      padding: SPACE.lg,
                    },
                    theme.shadowCard,
                  ]}
                >
                  <View style={{ gap: SPACE.sm }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: SPACE.sm,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <BodyStrong>{sel.item}</BodyStrong>
                        <Small muted>{sel.choice}</Small>
                      </View>
                      {note ? (
                        <StatusPill
                          status={safeTone}
                          size="sm"
                          label={note.fits ? STR.fitsLabel : STR.worthLookLabel}
                        />
                      ) : null}
                    </View>

                    {note ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: SPACE.sm,
                          backgroundColor: c.paper,
                          borderRadius: theme.radii.control,
                          padding: SPACE.md,
                        }}
                      >
                        <Feather
                          name={note.fits ? 'check-circle' : 'help-circle'}
                          size={16}
                          color={note.fits ? c.ok : c.warn}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1, gap: SPACE.xs }}>
                          <Small>{note.feedback}</Small>
                          <Micro muted>{STR.adviceNote}</Micro>
                        </View>
                      </View>
                    ) : null}

                    <Button
                      title={STR.checkFit}
                      variant="ghost"
                      size="md"
                      loading={checkingId === sel.id}
                      onPress={() => void checkFit(sel)}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* 4. Inspiration board — real photos + provenance */}
      <View style={{ gap: SPACE.md }}>
        <View style={{ gap: 4 }}>
          {eyebrow(STR.inspirationEyebrow)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Feather name="image" size={18} color={c.accent} />
            <H2>{STR.inspirationTitle}</H2>
          </View>
          <Small muted>{STR.inspirationSubtitle}</Small>
        </View>

        {referencesQ.isLoading ? (
          surface(<Small muted>{STR.loading}</Small>)
        ) : refs.length === 0 ? (
          <View
            style={{
              borderRadius: theme.radii.card,
              borderWidth: 1,
              borderColor: c.line,
              borderStyle: 'dashed',
              backgroundColor: c.paper,
              padding: SPACE.xl,
              alignItems: 'center',
              gap: SPACE.xs,
            }}
          >
            <Feather name="image" size={22} color={c.textMute} />
            <Small muted style={{ textAlign: 'center' }}>
              {STR.inspirationEmpty}
            </Small>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md }}>
            {refs.map((ref) => {
              const provenance =
                ref.source === 'pinterest' ? STR.provenancePinterest : STR.provenanceUpload
              return (
                <PhotoTile
                  key={ref.id}
                  photo={{ id: ref.id, imageUri: ref.image_url, caption: provenance }}
                  variant="grid"
                  size={148}
                  style={{ width: 148 }}
                  labels={{
                    caption: STR.inspirationCaption,
                    translate: '',
                    save: '',
                    share: '',
                    hide: '',
                    video: '',
                    starred: '',
                  }}
                />
              )
            })}
          </View>
        )}

        {canDesign ? (
          <Button
            title={STR.addInspiration}
            variant="secondary"
            loading={addRefMut.isPending}
            onPress={() => void pickInspiration()}
          />
        ) : null}
      </View>

      {/* 5. Monthly digest — honest warm-clay "coming soon" placeholder */}
      <View
        style={[
          {
            backgroundColor: c.card,
            borderRadius: theme.radii.card,
            borderLeftWidth: 4,
            borderLeftColor: c.secondary,
            padding: SPACE.lg,
            gap: SPACE.sm,
          },
          theme.shadowCard,
        ]}
      >
        <Micro color={c.secondary} style={{ letterSpacing: 1.2 }}>
          {STR.digestEyebrow}
        </Micro>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.secondaryContainer,
            }}
          >
            <Feather name="calendar" size={16} color={c.secondary} />
          </View>
          <Title>{STR.digestTitle}</Title>
        </View>
        <Body muted>{STR.digestComingSoon}</Body>
      </View>

      {/* Design Profiler entry points */}
      <LinkRow
        label="Open your design profile"
        onPress={() => router.push('/(homeowner)/design/profiler')}
      />
      <LinkRow
        label="View your design brief"
        onPress={() => router.push('/(homeowner)/design/brief')}
      />
    </View>
  )

  // ============================================================================
  // TAB: Plans
  // Drawings grouped by kind; pending-approval callout; → drawings/[id]
  // ============================================================================
  const renderPlansTab = () => (
    <View style={{ gap: SPACE.xl }}>
      {/* "Pending approval" callout when any drawings exist (approve not built) */}
      {hasPending && drawings.length > 0 ? (
        <CalmCard
          status="warn"
          eyebrow={T.pendingApprovalCallout.toUpperCase()}
          title={T.pendingApprovalCallout}
          body={T.pendingApprovalBody}
        />
      ) : null}

      {drawingsQ.isLoading ? (
        surface(<Small muted>{STR.loading}</Small>)
      ) : drawingsQ.isError ? (
        surface(
          <View style={{ gap: SPACE.sm }}>
            <Small muted>{STR.errorTitle}</Small>
            <Button
              title={STR.retry}
              variant="secondary"
              onPress={() => void drawingsQ.refetch()}
            />
          </View>,
        )
      ) : drawings.length === 0 ? (
        <View
          style={{
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: c.line,
            borderStyle: 'dashed',
            backgroundColor: c.paper,
            padding: SPACE.xl,
            alignItems: 'center',
            gap: SPACE.xs,
          }}
        >
          <Feather name="layout" size={22} color={c.textMute} />
          <BodyStrong style={{ textAlign: 'center' }}>{STR.plansEmptyTitle}</BodyStrong>
          <Small muted style={{ textAlign: 'center' }}>
            {STR.plansEmpty}
          </Small>
        </View>
      ) : (
        <View style={{ gap: SPACE.xl }}>
          {drawingGroups.map((group) => (
            <View key={group.label} style={{ gap: SPACE.md }}>
              {eyebrow(group.label.toUpperCase())}
              <View
                style={{
                  backgroundColor: c.card,
                  borderRadius: theme.radii.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  overflow: 'hidden',
                }}
              >
                {group.drawings.map((d, idx) => {
                  const when = drawingDate(d.published_at, lang as 'en' | 'hi')
                  const summary = drawingSummary(d, lang as 'en' | 'hi')
                  const isLast = idx === group.drawings.length - 1
                  return (
                    <View
                      key={d.id}
                      style={[
                        {
                          padding: SPACE.md,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: SPACE.md,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: c.line,
                          minHeight: 56,
                        },
                      ]}
                    >
                      <Feather name="file-text" size={20} color={c.accent} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <BodyStrong numberOfLines={1}>{d.title}</BodyStrong>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                          <Micro muted>{drawingKindLabel(d.kind, STR)}</Micro>
                          {when ? <Micro muted>· {when}</Micro> : null}
                        </View>
                        {summary ? (
                          <Micro color={c.accentDeep} numberOfLines={1}>
                            {summary}
                          </Micro>
                        ) : null}
                      </View>
                      {/* Version pill */}
                      <View
                        style={{
                          backgroundColor: tint(c.warn, 0.12),
                          borderRadius: theme.radii.pill,
                          paddingHorizontal: SPACE.sm,
                          paddingVertical: 2,
                          borderWidth: 1,
                          borderColor: tint(c.warn, 0.3),
                        }}
                      >
                        <MonoSm color={c.warn} style={{ fontWeight: '600' }}>
                          v{d.version}
                        </MonoSm>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: SPACE.xs }}>
                        <StatusPill status="warn" size="sm" label={STR.needsYourChoice} />
                        <Button
                          title={T.viewDrawing}
                          variant="secondary"
                          size="md"
                          onPress={() => router.push(`/(homeowner)/drawings/${d.id}`)}
                        />
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )

  // ============================================================================
  // TAB: Selections
  // Rooms → selections (decided / pending), References → button per room
  // ============================================================================
  const renderSelectionsTab = () => (
    <View style={{ gap: SPACE.xl }}>
      {selectionsQ.isLoading ? (
        surface(<Small muted>{STR.loading}</Small>)
      ) : selectionsQ.isError ? (
        surface(
          <View style={{ gap: SPACE.sm }}>
            <Small muted>{STR.errorTitle}</Small>
            <Button
              title={STR.retry}
              variant="secondary"
              onPress={() => void selectionsQ.refetch()}
            />
          </View>,
        )
      ) : selections.length === 0 ? (
        surface(<Small muted>{STR.selectionsEmpty}</Small>)
      ) : (
        <View style={{ gap: SPACE.lg }}>
          {selectionGroups.map((group) => {
            const decidedCount = group.items.filter((s) =>
              ['approved', 'final', 'done'].includes(s.status?.toLowerCase()),
            ).length
            const pendingItems = group.items.filter(
              (s) => !['approved', 'final', 'done'].includes(s.status?.toLowerCase()),
            )
            const decidedItems = group.items.filter((s) =>
              ['approved', 'final', 'done'].includes(s.status?.toLowerCase()),
            )
            // Room slug for references screen (use space_id if present, else 'all')
            const roomSlug = group.spaceId ?? 'all'
            return (
              <View key={group.spaceId ?? '__whole__'} style={{ gap: SPACE.md }}>
                {/* Room header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                    <Feather name="home" size={15} color={c.accent} />
                    <BodyStrong>{group.spaceName}</BodyStrong>
                    <Micro muted>
                      {decidedCount}/{group.items.length}
                    </Micro>
                  </View>
                  {/* References button → per-room references screen */}
                  <Button
                    title={T.refsButton}
                    variant="ghost"
                    size="md"
                    leading={<Feather name="image" size={14} color={c.accentDeep} />}
                    onPress={() =>
                      router.push(`/(homeowner)/design/references/${encodeURIComponent(roomSlug)}`)
                    }
                  />
                </View>

                {/* Pending selections */}
                {pendingItems.length > 0 ? (
                  <View
                    style={{
                      backgroundColor: c.card,
                      borderRadius: theme.radii.card,
                      borderWidth: 1,
                      borderColor: c.line,
                      overflow: 'hidden',
                    }}
                  >
                    {pendingItems.map((sel, idx) => {
                      const isLast = idx === pendingItems.length - 1
                      return (
                        <View
                          key={sel.id}
                          style={{
                            padding: SPACE.md,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: SPACE.sm,
                            borderBottomWidth: isLast ? 0 : 1,
                            borderBottomColor: c.line,
                            minHeight: 56,
                          }}
                        >
                          <StatusPill status="warn" size="sm" label={T.pendingLabel} />
                          <View style={{ flex: 1 }}>
                            <BodyStrong numberOfLines={1}>{sel.item}</BodyStrong>
                            <Small muted numberOfLines={1}>
                              {sel.choice}
                            </Small>
                          </View>
                          {/* Navigate to decision detail if this selection has a linked decision */}
                          <Button
                            title={STR.checkFit}
                            variant="ghost"
                            size="md"
                            loading={checkingId === sel.id}
                            onPress={() => void checkFit(sel)}
                          />
                        </View>
                      )
                    })}
                  </View>
                ) : null}

                {/* Decided selections */}
                {decidedItems.length > 0 ? (
                  <View
                    style={{
                      backgroundColor: c.card,
                      borderRadius: theme.radii.card,
                      borderWidth: 1,
                      borderColor: c.line,
                      overflow: 'hidden',
                      opacity: 0.85,
                    }}
                  >
                    {decidedItems.map((sel, idx) => {
                      const isLast = idx === decidedItems.length - 1
                      return (
                        <View
                          key={sel.id}
                          style={{
                            padding: SPACE.md,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: SPACE.sm,
                            borderBottomWidth: isLast ? 0 : 1,
                            borderBottomColor: c.line,
                            minHeight: 56,
                          }}
                        >
                          <StatusPill status="ok" size="sm" label={T.decidedLabel} />
                          <View style={{ flex: 1 }}>
                            <BodyStrong numberOfLines={1}>{sel.item}</BodyStrong>
                            <Small muted numberOfLines={1}>
                              {sel.choice}
                            </Small>
                          </View>
                          <Feather name="check-circle" size={16} color={c.ok} />
                        </View>
                      )
                    })}
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {/* Add selection — gated: only a member with design say */}
      {canDesign ? (
        <Link href="/(homeowner)/design/select" asChild>
          <Button
            title={STR.addSelection}
            variant="secondary"
            leading={<Feather name="plus" size={16} color={c.accentDeep} />}
          />
        </Link>
      ) : null}
    </View>
  )

  // ============================================================================
  // DesignProfileCard banner — always visible above the tabs
  // ============================================================================
  const profileSummary = profileText(profile)
  const profileUpdated = profile?.updated_at
    ? drawingDate(profile.updated_at, lang as 'en' | 'hi')
    : null

  return (
    <Screen style={{ paddingBottom: navClearance }}>
      {/* Calm header */}
      <FadeInUp>
        <View style={{ gap: 2 }}>
          <Display>{STR.title}</Display>
          <Small muted>{STR.subtitle}</Small>
          {capsQ.data && !canDesign ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.xs,
                marginTop: SPACE.xs,
              }}
            >
              <Feather name="eye" size={13} color={c.textMute} />
              <Micro muted style={{ flex: 1 }}>
                {STR.readOnlyNotice}
              </Micro>
            </View>
          ) : null}
        </View>
      </FadeInUp>

      {/* DesignProfileCard banner — always visible, tapping → design/profile */}
      <FadeInUp delay={30}>
        <Link href="/(homeowner)/design/profile" asChild>
          <View
            style={[
              {
                backgroundColor: c.card,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                borderColor: c.line,
                padding: SPACE.lg,
                gap: SPACE.xs,
              },
              theme.shadowCard,
            ]}
            accessibilityRole="button"
            accessibilityLabel={STR.refreshStyle}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="feather" size={15} color={c.accent} />
              <Micro color={c.secondary} style={{ letterSpacing: 1.2, flex: 1 }}>
                {T.bannerEyebrow}
              </Micro>
              <Feather name="chevron-right" size={15} color={c.textMute} />
            </View>
            {profileSummary ? (
              <Body numberOfLines={2}>{profileSummary}</Body>
            ) : (
              <Small muted>{T.bannerEmpty}</Small>
            )}
            {tones.length > 0 ? (
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 2 }}
              >
                {tones.slice(0, 4).map((tone) => (
                  <View
                    key={tone}
                    style={{
                      backgroundColor: c.accentWarm,
                      borderRadius: theme.radii.pill,
                      paddingHorizontal: SPACE.sm,
                      paddingVertical: 2,
                    }}
                  >
                    <Micro color={c.accentDeep} style={{ fontWeight: '600' }}>
                      {tone}
                    </Micro>
                  </View>
                ))}
              </View>
            ) : null}
            {profileUpdated ? (
              <Micro muted>
                {T.bannerUpdated} {profileUpdated}
              </Micro>
            ) : null}
          </View>
        </Link>
      </FadeInUp>

      {/* SegmentedTabs */}
      <FadeInUp delay={50}>
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
      <FadeInUp delay={70}>
        {activeTab === 'profile'
          ? renderProfileTab()
          : activeTab === 'plans'
            ? renderPlansTab()
            : renderSelectionsTab()}
      </FadeInUp>
    </Screen>
  )
}
