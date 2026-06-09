/**
 * Design — the homeowner's "Calm Cockpit" design hub (handoff §5 "Design").
 *
 * Re-skinned to Direction C ("Blend"): leads with calm content on warm sand —
 * a serif `Display` greeting, clay `Eyebrow`-style kickers (rendered with the
 * Micro primitive — the RN foundation ships no `Eyebrow` component), and
 * `FadeInUp` section rises. Sections:
 *
 *   1. Style Profile — a calm read of the AI design profile (tone pills,
 *      contributors from proposal C). Empty → a warm `CalmCard` invite.
 *   1b. "Decide together" — diverging authoritative picks; a HUMAN chooses,
 *       the AI never adjudicates (Hard Rule 5). Calm amber `CalmCard`, never red.
 *   2. Plans — published drawings (title · version · kind · the AI "what changed"
 *      line in the active language). A plan "Pending your approval" renders as a
 *      DecisionCard pattern: calm AMBER tint, a "Needs your choice" pill, a calm
 *      why-now line, and a single GREEN primary CTA (primary actions are always
 *      green; amber only signals "needs you"). The Approve action is an HONEST
 *      "coming soon — confirm with your builder" placeholder (backend not built).
 *   3. Room-by-room coherence — advisory tone (✓ fits / ~ worth a look) via
 *      `StatusPill`, NEVER blocking, NEVER red.
 *   4. Inspiration board — REAL reference photos via `PhotoTile`, with a
 *      provenance label (never AI/3D renders).
 *   5. Monthly digest — a warm-clay (`secondary`) honest "coming soon" card.
 *
 * Philosophy: seek feedback, never gatekeep. Real photos only, premium Feather
 * icons (no emoji), no `%`, advisory design tone never red/blocking, honest
 * placeholders (never fake an approval/digest), single language per screen.
 */
import { useState } from 'react'
import { Alert, Linking, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link } from 'expo-router'

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
  Micro,
  MonoSm,
  PhotoTile,
  Screen,
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

/** Hex + alpha → rgba (warm-amber tint behind a pending-plan DecisionCard). */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export default function Design() {
  const { lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()
  const STR = DESIGN_STR[lang]
  const c = theme.colors

  // The homeowner layout's `sceneStyle` already reserves room for the floating
  // bar + Ask pill (FLOATING_NAV_CLEARANCE); keep only a small breathing pad.
  const navClearance = insets.bottom + FLOATING_NAV_CLEARANCE

  const profileQ = useQuery({
    queryKey: ['design', 'profile'],
    queryFn: () => homeowner.designProfile(),
  })
  const selectionsQ = useQuery({
    queryKey: ['design', 'selections'],
    queryFn: () => homeowner.selections(),
  })
  // Published drawings/plans (C3 read slice). Approval flow is not built yet.
  const drawingsQ = useQuery({
    queryKey: ['design', 'drawings'],
    queryFn: () => homeowner.drawings(),
  })

  // Inspiration board — backed by GET /design/references so attributed refs
  // survive a reload (proposal C; previously local-only state that vanished).
  const referencesQ = useQuery({
    queryKey: ['design', 'references'],
    queryFn: () => homeowner.designReferences(),
  })
  const refs = referencesQ.data ?? []

  // Capabilities drive every WRITE affordance: only a `can_design` member may
  // make selections / confirm the profile / add inspiration. A non-design member
  // gets a calm read-only view (write affordances simply absent — never a lock).
  const capsQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canDesign = capsQ.data?.can_design ?? false

  // Per-selection consistency advice, keyed by selection id.
  const [advice, setAdvice] = useState<Record<string, ConsistencyCheck>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)

  const addRefMut = useMutation({
    mutationFn: (image_url: string) => homeowner.references({ image_url, source: 'upload' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['design', 'references'] })
      Alert.alert(STR.inspirationTitle, STR.added)
    },
    onError: (err: Error) => Alert.alert(STR.errorTitle, err.message),
  })

  // A human picks one option to settle a "decide together" card — the app NEVER
  // auto-resolves a conflict (Hard Rule 5); this just records the human's pick.
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

  async function pickInspiration() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(STR.inspirationTitle, STR.permissionDenied)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    })
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

  // Open a drawing's real file. The approve path is honestly "coming soon".
  async function openDrawing(drawing: Drawing) {
    if (!drawing.file_url) return
    try {
      await Linking.openURL(drawing.file_url)
    } catch {
      Alert.alert(STR.errorTitle, STR.openFile)
    }
  }

  const profile = profileQ.data
  const contributors = profileContributors(profile)
  const conflicts = profileConflicts(profile)
  const tones = profileTone(profile)
  const drawings = drawingsQ.data ?? []

  // Clay uppercase kicker — the calm "Eyebrow" pattern (no `Eyebrow` primitive
  // in the RN foundation; the warm-clay tone marks a section the way home.tsx does).
  const eyebrow = (text: string) => (
    <Micro color={c.secondary} style={{ letterSpacing: 1.2 }}>
      {text}
    </Micro>
  )

  // A reusable soft chip (warm-paper pill with hairline).
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

  // A calm card surface (warm white, soft shadow) — the Direction-C "letter" feel.
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

  return (
    <Screen style={{ paddingBottom: navClearance }}>
      {/* Calm header — serif greeting on warm sand (like Home). */}
      <FadeInUp>
        <View style={{ gap: 2 }}>
          <Display>{STR.title}</Display>
          <Small muted>{STR.subtitle}</Small>
          {/* Graceful read-only notice — a member without a design say sees this
              instead of (absent) write buttons; never a lock. */}
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

      {/* 1. Style Profile -------------------------------------------------- */}
      <FadeInUp delay={40}>
        {profileQ.isLoading ? (
          surface(<Small muted>{STR.loading}</Small>)
        ) : profileQ.isError ? (
          surface(
            <View style={{ gap: SPACE.sm }}>
              <BodyStrong>{STR.errorTitle}</BodyStrong>
              <Button
                title={STR.retry}
                variant="secondary"
                onPress={() => void profileQ.refetch()}
              />
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

              {/* Contributors — who shaped this household profile (proposal C). */}
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

              {/* Confirm / re-draft her style profile (the PUT /design/profile
                  loop). Gated: only a member with a design say. */}
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
      </FadeInUp>

      {/* 1b. "Decide together" — diverging authoritative choices ------------- */}
      {/* Calm, never a fight: the app surfaces both picks and a HUMAN chooses;
          the AI never adjudicates a winner (Hard Rule 5). Amber (warn), never red. */}
      {conflicts.length > 0 ? (
        <FadeInUp delay={60}>
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
                      {/* Only a member with a design say picks; others see it read-only. */}
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
        </FadeInUp>
      ) : null}

      {/* 2. Plans & drawings ------------------------------------------------ */}
      <FadeInUp delay={80}>
        <View style={{ gap: SPACE.md }}>
          <View style={{ gap: 4 }}>
            {eyebrow(STR.plansEyebrow)}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="file-text" size={18} color={c.accent} />
              <H2>{STR.plansTitle}</H2>
            </View>
            <Small muted>{STR.plansSubtitle}</Small>
          </View>

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
            <View style={{ gap: SPACE.md }}>
              {drawings.map((d) => {
                const summary = drawingSummary(d, lang)
                const when = drawingDate(d.published_at, lang)
                // Every published plan currently awaits the homeowner's approval
                // (the approve backend isn't built) → render the DecisionCard
                // pattern: calm amber tint + warn pill + GREEN primary CTA.
                return (
                  <View
                    key={d.id}
                    style={[
                      {
                        borderRadius: theme.radii.card,
                        borderWidth: 1,
                        borderColor: tint(c.warn, 0.3),
                        backgroundColor: tint(c.warn, 0.1),
                        padding: SPACE.lg,
                        gap: SPACE.sm,
                      },
                      theme.shadowCard,
                    ]}
                  >
                    {/* "Needs your choice" — amber pill, never red, never blocking. */}
                    <StatusPill status="warn" size="sm" label={STR.needsYourChoice} />

                    <View style={{ gap: 2 }}>
                      <Title>{d.title}</Title>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: SPACE.sm,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Micro muted>{drawingKindLabel(d.kind, STR)}</Micro>
                        <MonoSm muted>
                          {STR.versionLabel} {d.version}
                        </MonoSm>
                      </View>
                    </View>

                    {/* Calm "why now" line so it never feels sudden. */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                      <Feather name="clock" size={13} color={c.accentDeep} />
                      <Small muted>
                        {STR.sharedByBuilder}
                        {when ? ` · ${when}` : ''}
                      </Small>
                    </View>

                    {/* AI "what changed" line — active language, as-is. */}
                    {summary ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: SPACE.sm,
                          backgroundColor: c.card,
                          borderRadius: theme.radii.control,
                          padding: SPACE.md,
                        }}
                      >
                        <Feather
                          name="edit-3"
                          size={14}
                          color={c.accent}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <MonoSm muted style={{ letterSpacing: 0.5 }}>
                            {STR.whatChanged}
                          </MonoSm>
                          <Small>{summary}</Small>
                        </View>
                      </View>
                    ) : null}

                    <View
                      style={{
                        flexDirection: 'row',
                        gap: SPACE.sm,
                        marginTop: SPACE.xs,
                        alignItems: 'center',
                      }}
                    >
                      <Button
                        title={STR.openFile}
                        variant="secondary"
                        size="md"
                        onPress={() => void openDrawing(d)}
                      />
                      {/* GREEN primary CTA (primary actions are always green) —
                          HONEST placeholder: the approve backend isn't built. */}
                      <Button
                        title={STR.reviewAndApprove}
                        size="md"
                        leading={<Feather name="check" size={16} color={c.onAccent} />}
                        onPress={() =>
                          Alert.alert(STR.approveDrawing, STR.approveDrawingComingSoon)
                        }
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </FadeInUp>

      {/* 3. Room-by-room coherence — advisory, NEVER blocking, NEVER red ---- */}
      {/* A gentle read on how choices fit. Tones are limited to ok (✓ fits) and
          warn (~ worth a look) — risk/red is deliberately never used here. */}
      <FadeInUp delay={100}>
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
          ) : (selectionsQ.data?.length ?? 0) === 0 ? (
            surface(<Small muted>{STR.selectionsEmpty}</Small>)
          ) : (
            <View style={{ gap: SPACE.md }}>
              {selectionsQ.data!.map((sel) => {
                const note = advice[sel.id]
                // Advisory tone only: ✓ fits (ok) / ~ worth a look (warn).
                // Never derive `risk` here — design feedback never blocks/reds.
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

          {/* Make a selection — opens the room-scoped, status-aware sheet with a
              pre-commit fit check. Gated: only a member with a design say. */}
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
      </FadeInUp>

      {/* 4. Inspiration board — REAL photos via PhotoTile + provenance ----- */}
      <FadeInUp delay={120}>
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
                // Provenance becomes the tile's caption — a real photo, attributed.
                const provenance =
                  ref.source === 'pinterest' ? STR.provenancePinterest : STR.provenanceUpload
                return (
                  <PhotoTile
                    key={ref.id}
                    photo={{
                      id: ref.id,
                      imageUri: ref.image_url,
                      caption: provenance,
                    }}
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
      </FadeInUp>

      {/* 5. Monthly digest — honest warm-clay "coming soon" placeholder ----- */}
      <FadeInUp delay={140}>
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
      </FadeInUp>
    </Screen>
  )
}
