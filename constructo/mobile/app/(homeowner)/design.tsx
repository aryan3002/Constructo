/**
 * Design — the homeowner's "Calm Cockpit" design hub (handoff §5 "Design"):
 *   1. Style Profile card — a premium read of the AI design profile (tone pills,
 *      contributors from proposal C, "decide together" conflict cards).
 *   2. Plans — published drawings (title · version · kind · the AI "what changed"
 *      line in the active language · an amber "Pending your approval" chip). The
 *      file opens via `file_url`; the Approve action is an HONEST "coming soon —
 *      ask your builder" placeholder (the approve backend isn't built yet).
 *   3. Room-by-room coherence — advisory tone (✓ fits / ~ worth a look), NEVER
 *      blocking, NEVER red.
 *   4. Inspiration board — real reference photos with a provenance label.
 *   5. Monthly digest — an honest warm-clay "coming soon" placeholder.
 *
 * Philosophy: seek feedback, never gatekeep. Real photos only, premium Feather
 * icons (no emoji), no `%`, advisory design tone never red/blocking, honest
 * placeholders (never fake an approval/digest).
 */
import { useState } from 'react'
import { Alert, Image, Linking, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link } from 'expo-router'

import { homeowner, request } from '../../src/api/client'
import type {
  ConsistencyCheck,
  DesignConflict,
  DesignSelection,
  Drawing,
} from '../../src/api/types'
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
  Micro,
  MonoSm,
  Screen,
  Small,
  StatusPill,
  Title,
  FLOATING_NAV_CLEARANCE,
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

  // Per-selection consistency advice, keyed by selection id.
  const [advice, setAdvice] = useState<Record<string, ConsistencyCheck>>({})
  const [checkingId, setCheckingId] = useState<string | null>(null)

  // Add-selection form state.
  const [item, setItem] = useState('')
  const [choice, setChoice] = useState('')

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

  const addSelectionMut = useMutation({
    mutationFn: () =>
      request<DesignSelection>('/api/v1/homeowner/design/selections', {
        method: 'POST',
        body: JSON.stringify({ item: item.trim(), choice: choice.trim() }),
      }),
    onSuccess: () => {
      setItem('')
      setChoice('')
      void qc.invalidateQueries({ queryKey: ['design', 'selections'] })
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
      const res = await request<ConsistencyCheck>(
        '/api/v1/homeowner/design/consistency-check',
        { method: 'POST', body: JSON.stringify({ item: sel.item, choice: sel.choice }) },
      )
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

  const inputStyle = {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    color: c.text,
    fontSize: 16,
    letterSpacing: 0, // prevent iOS custom-font tracking from leaking into placeholder
  }

  const profile = profileQ.data
  const contributors = profileContributors(profile)
  const conflicts = profileConflicts(profile)
  const tones = profileTone(profile)
  const drawings = drawingsQ.data ?? []

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

  return (
    <Screen style={{ paddingBottom: navClearance }}>
      <View style={{ gap: 2 }}>
        <Display>{STR.title}</Display>
        <Small muted>{STR.subtitle}</Small>
      </View>

      {/* 1. Style Profile -------------------------------------------------- */}
      {profileQ.isLoading ? (
        <Card>
          <Small muted>{STR.loading}</Small>
        </Card>
      ) : profileQ.isError ? (
        <Card>
          <View style={{ gap: SPACE.sm }}>
            <BodyStrong>{STR.errorTitle}</BodyStrong>
            <Button
              title={STR.retry}
              variant="secondary"
              onPress={() => void profileQ.refetch()}
            />
          </View>
        </Card>
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
        <Card>
          <View style={{ gap: SPACE.md }}>
            <View style={{ gap: 2 }}>
              <Micro muted style={{ letterSpacing: 1 }}>
                {STR.styleEyebrow}
              </Micro>
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
          </View>
        </Card>
      )}

      {/* 1b. "Decide together" — diverging authoritative choices ------------- */}
      {/* Calm, never a fight: the app surfaces both picks and a HUMAN chooses;
          the AI never adjudicates a winner (Hard Rule 5). Amber (warn), never red. */}
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
                    <Button
                      title={STR.decideTogether}
                      variant="secondary"
                      size="md"
                      loading={resolveMut.isPending}
                      onPress={() => resolveMut.mutate({ conflict, choice: opt.choice })}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </CalmCard>
      ) : null}

      {/* 2. Plans & drawings ------------------------------------------------ */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="file-text" size={18} color={c.accent} />
              <H2>{STR.plansTitle}</H2>
            </View>
            <Small muted>{STR.plansSubtitle}</Small>
          </View>

          {drawingsQ.isLoading ? (
            <Small muted>{STR.loading}</Small>
          ) : drawingsQ.isError ? (
            <View style={{ gap: SPACE.sm }}>
              <Small muted>{STR.errorTitle}</Small>
              <Button
                title={STR.retry}
                variant="secondary"
                onPress={() => void drawingsQ.refetch()}
              />
            </View>
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
                return (
                  <View
                    key={d.id}
                    style={{
                      borderRadius: theme.radii.card,
                      borderWidth: 1,
                      borderColor: c.line,
                      backgroundColor: c.paper,
                      padding: SPACE.lg,
                      gap: SPACE.sm,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: SPACE.sm,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
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
                          {when ? <MonoSm muted>{when}</MonoSm> : null}
                        </View>
                      </View>
                      {/* Amber "Pending your approval" — honest: approval flow
                          is not built, so this is a status chip, not an action. */}
                      <StatusPill status="warn" size="sm" label={STR.pendingApproval} />
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

                    <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs }}>
                      <Button
                        title={STR.openFile}
                        variant="secondary"
                        size="md"
                        onPress={() => void openDrawing(d)}
                      />
                      {/* HONEST placeholder — the approve backend isn't built. */}
                      <Button
                        title={STR.approveDrawing}
                        variant="ghost"
                        size="md"
                        onPress={() => Alert.alert(STR.approveDrawing, STR.approveDrawingComingSoon)}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </Card>

      {/* 3. Room-by-room coherence — advisory, NEVER blocking, NEVER red ---- */}
      {/* A gentle read on how choices fit. Tones are limited to ok (✓ fits) and
          warn (~ worth a look) — risk/red is deliberately never used here. */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="grid" size={18} color={c.accent} />
              <H2>{STR.coherenceTitle}</H2>
            </View>
            <Small muted>{STR.coherenceSubtitle}</Small>
          </View>

          {selectionsQ.isLoading ? (
            <Small muted>{STR.loading}</Small>
          ) : selectionsQ.isError ? (
            <View style={{ gap: SPACE.sm }}>
              <Small muted>{STR.errorTitle}</Small>
              <Button
                title={STR.retry}
                variant="secondary"
                onPress={() => void selectionsQ.refetch()}
              />
            </View>
          ) : (selectionsQ.data?.length ?? 0) === 0 ? (
            <Small muted>{STR.selectionsEmpty}</Small>
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
                    style={{
                      gap: SPACE.sm,
                      paddingBottom: SPACE.md,
                      borderBottomWidth: 1,
                      borderBottomColor: c.line,
                    }}
                  >
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
                )
              })}
            </View>
          )}

          {/* Add-a-selection form */}
          <View style={{ gap: SPACE.sm, marginTop: SPACE.sm }}>
            <BodyStrong>{STR.addSelectionTitle}</BodyStrong>
            <TextInput
              value={item}
              onChangeText={setItem}
              placeholder={STR.itemLabel}
              placeholderTextColor={c.textMute}
              style={inputStyle}
            />
            <TextInput
              value={choice}
              onChangeText={setChoice}
              placeholder={STR.choiceLabel}
              placeholderTextColor={c.textMute}
              style={inputStyle}
            />
            <Button
              title={STR.addSelection}
              loading={addSelectionMut.isPending}
              disabled={item.trim().length === 0 || choice.trim().length === 0}
              onPress={() => addSelectionMut.mutate()}
            />
          </View>
        </View>
      </Card>

      {/* 4. Inspiration board — REAL photos + provenance ------------------- */}
      <Card>
        <View style={{ gap: SPACE.md }}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Feather name="image" size={18} color={c.accent} />
              <H2>{STR.inspirationTitle}</H2>
            </View>
            <Small muted>{STR.inspirationSubtitle}</Small>
          </View>

          {referencesQ.isLoading ? (
            <Small muted>{STR.loading}</Small>
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
              {refs.map((ref) => (
                <View key={ref.id} style={{ width: 104, gap: SPACE.xs }}>
                  <Image
                    source={{ uri: ref.image_url }}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: theme.radii.control,
                      backgroundColor: AP.surfaceLow,
                      borderWidth: 1,
                      borderColor: c.line,
                    }}
                  />
                  {/* Provenance label — where this reference came from. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather
                      name={ref.source === 'pinterest' ? 'bookmark' : 'upload'}
                      size={11}
                      color={c.textMute}
                    />
                    <Micro muted numberOfLines={1}>
                      {ref.source === 'pinterest'
                        ? STR.provenancePinterest
                        : STR.provenanceUpload}
                    </Micro>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Button
            title={STR.addInspiration}
            variant="secondary"
            loading={addRefMut.isPending}
            onPress={() => void pickInspiration()}
          />
        </View>
      </Card>

      {/* 5. Monthly digest — honest warm-clay "coming soon" placeholder ----- */}
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
    </Screen>
  )
}
