/**
 * Design Profiler — per-area ranking screen. Rebuilt to faithfully match
 * screen-profiler.jsx prototype composition (DPArea #06 + DPRank #10):
 *
 *   1. SubHeader: area name + "X ranked · Y recommended" subtitle + ConfPill
 *   2. Progress bar (amber until complete)
 *   3. SubTabs: Inspiration | Ranking | AI Notes | Brief
 *
 *   Inspiration tab  — add buttons (Upload / Pinterest / Presets) + reference grid
 *   Ranking tab      — each reference: thumbnail + star picker + save
 *   AI Notes tab     — style summary + open questions
 *   Brief tab        — suggested theme card + link to full brief
 *
 * Real data: design.references(pid, area) → ProfilerReference[]
 *            design.profile(pid) → my_contributor_id (membrane)
 *            design.rankReference() → POST per star pick
 *
 * Visual-only (no engine): Pinterest connect, preset packs (noted below).
 *
 * Membrane: canRank only when my_contributor_id is set; others see read-only.
 * Per-reference state is isolated in RefRankRow so ratings don't bleed.
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError, design, homeowner } from '../../../../src/api/client'
import type { ProfilerConflict, ProfilerReference, ProfilerTheme, ThemeDecisionAction } from '../../../../src/api/client'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import {
  BlurUpImage,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Eyebrow,
  FLOATING_NAV_CLEARANCE,
  Micro,
  Screen,
  SegmentedTabs,
  Small,
  StatusPill,
  SubHeader,
  useToast,
} from '../../../../src/ui'
import {
  areaProgressLabel,
  confidenceBand,
  PROFILER_STR,
  RANKING_TAGS,
} from '../../../../src/homeowner/design_profiler.util'
import { CLAR_STR, openClarifications } from '../../../../src/homeowner/clarifications.util'
import { CONFLICT_STR, conflictSides, resolvedSummary } from '../../../../src/homeowner/conflicts.util'
import { extractPinterestUrls, PIN_PASTE_STR } from '../../../../src/homeowner/pin_paste.util'
import { QUICKSTART_STR } from '../../../../src/homeowner/quickstart.util'
import {
  decidedAttribution,
  THEME_DECISION_STR,
  themeDecisionTone,
} from '../../../../src/homeowner/theme_decisions.util'

// ---------------------------------------------------------------------------
// Confidence pill
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Star picker
// ---------------------------------------------------------------------------

const STAR_LABELS = ['', 'Strong dislike', 'Not preferred', 'Neutral', 'Like', 'Love']

function Stars({
  value,
  onChange,
  size = 28,
}: {
  value: number
  onChange: (n: number) => void
  size?: number
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value >= n
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} stars`}
            onPress={() => onChange(n)}
            hitSlop={8}
            style={{
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? AP.chip + '80' : AP.surfaceContainer,
            }}
          >
            <Feather
              name={on ? 'star' : 'star'}
              size={size - 8}
              color={on ? c.secondary : c.quiet}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Reference image — the real photo (presigned), placeholder while missing
// ---------------------------------------------------------------------------

function sourceLabel(s: string): string {
  if (s === 'upload' || s === 'camera') return 'Upload'
  if (s.startsWith('pinterest')) return 'Pinterest'
  if (s === 'preset') return 'Preset'
  return s
}

function RefImage({ reference, style }: { reference: ProfilerReference; style: ViewStyle }) {
  const { theme } = useTheme()
  const c = theme.colors
  // Fall back to the placeholder not just when there's no URL, but also when a
  // (presigned/expired/404) URL fails to load — otherwise the tile renders blank.
  const [failed, setFailed] = useState(false)
  if (reference.image_url && !failed) {
    return (
      <BlurUpImage uri={reference.image_url} style={style} onError={() => setFailed(true)} />
    )
  }
  return (
    <View
      style={[
        style,
        { backgroundColor: AP.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      <Feather name="image" size={22} color={c.textMute} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Per-reference row (Ranking tab)
// ---------------------------------------------------------------------------

interface RefRankRowProps {
  reference: ProfilerReference
  contributorId: string
  canRank: boolean
  index: number
  onSaved: () => void
}

function RefRankRow({ reference, contributorId, canRank, index, onSaved }: RefRankRowProps) {
  const toast = useToast()
  const { theme } = useTheme()
  const c = theme.colors
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])

  const mut = useMutation({
    mutationFn: () =>
      design.rankReference(reference.id, {
        contributor_id: contributorId,
        stars,
        tags: {
          positive: tags.filter(
            (t) => !t.startsWith('Too') && t !== 'Hard to maintain',
          ),
          negative: tags.filter(
            (t) => t.startsWith('Too') || t === 'Hard to maintain',
          ),
        },
      }),
    onSuccess: () => {
      toast('Rating saved', 'check')
      setStars(0)
      setTags([])
      onSaved()
    },
    onError: (e: Error) => toast(e.message),
  })

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: SPACE.md, padding: SPACE.md, alignItems: 'center' }}>
        {/* Reference thumbnail — the real photo */}
        <RefImage
          reference={reference}
          style={{
            width: 68,
            height: 68,
            borderRadius: theme.radii.chip,
            flexShrink: 0,
          }}
        />
        <View style={{ flex: 1 }}>
          <Micro muted style={{ marginBottom: 6 }}>
            {reference.source_type} · Reference {index + 1}
          </Micro>
          <Stars value={stars} onChange={setStars} size={22} />
          {stars > 0 ? (
            <Small style={{ marginTop: 6, color: c.secondary, fontWeight: '600' }}>
              {STAR_LABELS[stars]}
            </Small>
          ) : null}
        </View>
      </View>

      {/* Quick tags */}
      {stars > 0 ? (
        <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md }}>
          <Micro muted style={{ marginBottom: 8 }}>Quick tags — what stood out?</Micro>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {RANKING_TAGS.map((tg) => {
              const isNeg = tg.startsWith('Too') || tg === 'Hard to maintain'
              return (
                <Chip
                  key={tg}
                  label={tg}
                  active={tags.includes(tg)}
                  onPress={
                    canRank
                      ? () =>
                          setTags((cur) =>
                            cur.includes(tg)
                              ? cur.filter((x) => x !== tg)
                              : [...cur, tg],
                          )
                      : undefined
                  }
                />
              )
            })}
          </View>

          <Button
            title={mut.isPending ? 'Saving…' : 'Save rating'}
            variant="primary"
            size="md"
            loading={mut.isPending}
            onPress={() => {
              if (canRank && stars > 0) mut.mutate()
            }}
            style={{ marginTop: SPACE.md }}
          />
        </View>
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Reference grid tile (Inspiration tab)
// ---------------------------------------------------------------------------

function RefGridTile({
  reference,
  index,
  onPress,
}: {
  reference: ProfilerReference
  index: number
  onPress: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          height: 120,
          borderRadius: theme.radii.card,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.line,
        }}
      >
        <RefImage reference={reference} style={{ width: '100%', height: 120 }} />
        {/* Source kicker */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            backgroundColor: 'rgba(252,250,243,0.92)',
            borderRadius: theme.radii.pill,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Micro style={{ fontWeight: '600', color: c.text, fontSize: 11 }}>
            {sourceLabel(reference.source_type)}
          </Micro>
        </View>
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Clarification row (AI Notes tab) — open (question + answer box) or
// answered (question + quiet answer). Isolated so per-row draft text
// doesn't bleed between rows.
// ---------------------------------------------------------------------------

interface ClarificationRowProps {
  id: string
  question: string
  answer: string | null
  onAnswered: () => void
}

function ClarificationRow({ id, question, answer, onAnswered }: ClarificationRowProps) {
  const { theme } = useTheme()
  const c = theme.colors
  const toast = useToast()
  const S = CLAR_STR.en
  const [draft, setDraft] = useState('')

  const mut = useMutation({
    mutationFn: () => design.answerClarification(id, draft.trim()),
    onSuccess: () => {
      toast(S.answeredToast, 'check')
      onAnswered()
    },
    onError: (e: Error) => toast(e.message),
  })

  if (answer != null) {
    return (
      <View style={{ paddingVertical: SPACE.sm }}>
        <Body style={{ fontWeight: '600', fontSize: 14 }}>{question}</Body>
        <Small muted style={{ marginTop: 3 }}>{answer}</Small>
      </View>
    )
  }

  return (
    <View style={{ paddingVertical: SPACE.sm, gap: SPACE.sm }}>
      <Body style={{ fontWeight: '600', fontSize: 14 }}>{question}</Body>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={S.answerPlaceholder}
        placeholderTextColor={c.textMute}
        multiline
        style={{
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: theme.radii.control,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          color: c.text,
          backgroundColor: c.paper,
          minHeight: 44,
        }}
      />
      <Button
        title={S.sendAnswer}
        variant="secondary"
        size="md"
        loading={mut.isPending}
        onPress={() => {
          if (draft.trim()) mut.mutate()
        }}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AreaRankScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const { theme } = useTheme()
  const c = theme.colors
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const S = PROFILER_STR.en

  const { area, pid, key, tab: tabParam } = useLocalSearchParams<{
    area: string
    pid: string
    key: string
    tab?: string
  }>()

  const areaLabel = String(key ?? 'Area').replace(/_/g, ' ')
  // Deep-link support: ?tab=notes opens straight to AI Notes (used by the
  // DPHub "Questions for you" card). Any other/absent value is ignored —
  // falls back to the default Inspiration tab.
  const initialTab = tabParam === 'notes' ? 'AI Notes' : 'Inspiration'
  const [tab, setTab] = useState(initialTab)

  const refsQ = useQuery({
    queryKey: ['design', 'profiler', 'refs', pid, area],
    queryFn: () => design.references(pid as string, area as string),
    enabled: !!pid && !!area,
  })

  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'detail', pid],
    queryFn: () => design.profile(pid as string),
    enabled: !!pid,
  })

  // Themes for the area (for AI Notes / Brief tab)
  const themesQ = useQuery({
    queryKey: ['design', 'profiler', 'themes', pid, area],
    queryFn: () => design.themes(pid as string, area as string),
    enabled: !!pid && !!area,
  })

  // Clarifications — this area's slice of the profile's "questions for you".
  const clarsQ = useQuery({
    queryKey: ['design', 'profiler', 'clarifications', pid],
    queryFn: () => design.clarifications(pid as string),
    enabled: !!pid,
  })
  const areaClars = (clarsQ.data ?? []).filter((cl) => cl.area_id === area)
  const openClars = openClarifications(areaClars)
  const answeredClars = areaClars.filter((cl) => cl.answer != null)

  // Conflicts — this area's slice of "your styles differ", settled in the
  // "Settle this together" sheet below.
  const conflictsQ = useQuery({
    queryKey: ['design', 'profiler', 'conflicts', pid],
    queryFn: () => design.conflicts(pid as string),
    enabled: !!pid,
  })
  const areaConflicts = (conflictsQ.data ?? []).filter((cf) => cf.area_id === area)
  const pendingConflicts = areaConflicts.filter((cf) => cf.resolution_status === 'pending')
  const settledConflicts = areaConflicts.filter((cf) => cf.resolution_status !== 'pending')

  const capQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })
  const canApprove = capQ.data?.can_approve ?? true

  // Caller's own user id — for "Decided by you" attribution on theme cards.
  const meQ = useQuery({
    queryKey: ['homeowner', 'me'],
    queryFn: () => homeowner.me(),
  })
  const myUserId = meQ.data?.id ?? null

  const refs = refsQ.data ?? []
  const myContributorId = profileQ.data?.my_contributor_id ?? null
  const canRank = !!myContributorId
  const contributorArg = myContributorId ?? undefined

  // Per-area meta from profile
  const areaDetail = profileQ.data?.areas?.find((a) => a.id === area)
  const confidence = areaDetail?.confidence ?? 0
  const ranked = areaDetail?.my_ranked_count ?? 0
  const recommended = areaDetail?.recommended_count ?? 6
  const progressPct =
    recommended > 0 ? Math.min(100, Math.round((ranked / recommended) * 100)) : 0
  const isLowInput = refs.length === 0

  const refresh = () => qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
  const handleSaved = () => {
    void refresh()
  }

  // ── Add inspiration: upload / Pinterest link / preset ─────────────────────
  // Upload reuses the proven chat presign→PUT→multipart fallback.
  const addByUpload = useMutation({
    mutationFn: async (localUri: string) => {
      const presign = await design.presignMedia(pid as string)
      let imageKey: string
      if (presign.upload_mode === 'presigned' && presign.put_url) {
        const blob = await (await fetch(localUri)).blob()
        const put = await fetch(presign.put_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        })
        if (!put.ok) throw new Error('Upload failed — please try again.')
        imageKey = presign.key
      } else {
        const up = await design.uploadMedia(pid as string, {
          uri: localUri,
          name: 'inspiration.jpg',
          type: 'image/jpeg',
        })
        imageKey = up.key
      }
      return design.addReference({
        area_id: area as string,
        contributor_id: contributorArg,
        source_type: 'upload',
        image_r2_key: imageKey,
      })
    },
    onSuccess: () => {
      toast('Added to your inspiration', 'check')
      void refresh()
    },
    onError: (e: Error) => toast(e.message),
  })

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      toast('Photo access is needed to add inspiration.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.length) return
    addByUpload.mutate(result.assets[0].uri)
  }

  // Pinterest — paste one or many pin links (server re-hosts each image to our R2).
  const PS = PIN_PASTE_STR.en
  const [pinOpen, setPinOpen] = useState(false)
  const [pinUrl, setPinUrl] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinResults, setPinResults] = useState<{ ok: number; fails: string[] } | null>(null)
  const [pinSubmitting, setPinSubmitting] = useState(false)

  function shortReason(e: unknown): string {
    if (e instanceof ApiError) return e.message
    if (e instanceof Error) return e.message
    return 'Could not be added.'
  }

  // Explicit-tap clipboard read only (never on mount/focus — that triggers
  // the iOS "Paste" permission banner as a surprise).
  async function pasteFromPinterest() {
    const text = await Clipboard.getStringAsync()
    const urls = extractPinterestUrls(text)
    if (urls.length === 0) {
      toast(PS.noPinsToast)
      return
    }
    if (urls.length === 1) {
      setPinUrl(urls[0])
      return
    }
    setPinUrl(urls.join('\n'))
  }

  async function submitPins() {
    const urls = extractPinterestUrls(pinUrl)
    if (urls.length === 0) {
      setPinError('Paste a Pinterest pin link.')
      return
    }
    setPinError(null)
    setPinSubmitting(true)
    let ok = 0
    const fails: string[] = []
    for (const url of urls) {
      try {
        await design.referenceFromLink({
          area_id: area as string,
          contributor_id: contributorArg,
          url,
        })
        ok += 1
      } catch (e) {
        fails.push(shortReason(e))
      }
    }
    setPinSubmitting(false)
    setPinResults({ ok, fails })
    if (ok > 0) void refresh()
  }

  function closePinSheet() {
    setPinOpen(false)
    setPinUrl('')
    setPinError(null)
    setPinResults(null)
  }

  // Presets — curated designer packs for this area kind.
  const [presetOpen, setPresetOpen] = useState(false)
  const presetsQ = useQuery({
    queryKey: ['design', 'presets', areaDetail?.area_kind, key],
    queryFn: () =>
      design.presets(areaDetail?.area_kind ?? 'interior', key ? String(key) : undefined),
    enabled: presetOpen && !!areaDetail,
  })
  const addByPreset = useMutation({
    mutationFn: (presetId: string) =>
      design.referenceFromPreset({
        area_id: area as string,
        contributor_id: contributorArg,
        preset_id: presetId,
      }),
    onSuccess: () => {
      toast('Added to your inspiration', 'check')
      void refresh()
    },
    onError: (e: Error) => toast(e.message),
  })

  // Theme decisions — owners/co-owners commit approve/adjust/reject per theme.
  // "adjust" opens a small note-sheet (note optional); approve/reject fire
  // straight away. A single mutation + a ref to the theme being decided so
  // per-card loading state stays isolated without extra component splitting.
  const [adjustSheet, setAdjustSheet] = useState<ProfilerTheme | null>(null)
  const [adjustNote, setAdjustNote] = useState('')
  const decideThemeMut = useMutation({
    mutationFn: ({ themeId, action, note }: { themeId: string; action: ThemeDecisionAction; note?: string }) =>
      design.decideTheme(themeId, action, note),
    onSuccess: () => {
      toast(THEME_DECISION_STR.en.decidedToast, 'check')
      setAdjustSheet(null)
      setAdjustNote('')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler', 'themes', pid, area] })
      void qc.invalidateQueries({ queryKey: ['design', 'profiler', 'detail', pid] })
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'approve_forbidden') {
        toast(e.message)
      } else {
        toast((e as Error).message)
      }
    },
  })
  const decidingThemeId =
    decideThemeMut.isPending ? decideThemeMut.variables?.themeId : undefined

  // "Settle this together" sheet — one conflict at a time.
  const [conflictSheet, setConflictSheet] = useState<ProfilerConflict | null>(null)
  const [conflictNote, setConflictNote] = useState('')
  const [conflictReadOnly, setConflictReadOnly] = useState(false)
  const contributors = profileQ.data?.contributors ?? []

  const resolveConflictMut = useMutation({
    mutationFn: (body: { resolution: string; note?: string }) =>
      design.resolveConflict((conflictSheet as ProfilerConflict).id, body),
    onSuccess: (_result, variables) => {
      toast(
        variables.resolution === 'defer_to_architect'
          ? CONFLICT_STR.en.deferredToast
          : CONFLICT_STR.en.resolvedToast,
        'check',
      )
      setConflictSheet(null)
      setConflictNote('')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler', 'conflicts', pid] })
      void qc.invalidateQueries({ queryKey: ['design', 'profiler', 'detail', pid] })
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'approve_forbidden') {
        setConflictReadOnly(true)
      } else {
        toast((e as Error).message)
      }
    },
  })

  const adding = addByUpload.isPending
  const progLabel = areaProgressLabel(ranked, recommended)

  return (
    <Screen floatingNav style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }} padded={false}>
      {/* SubHeader with confidence pill on right */}
      <SubHeader
        title={areaLabel}
        subtitle={progLabel}
        onBack={() => router.back()}
        right={<ConfPill confidence={confidence} size="sm" />}
      />

      {/* Progress bar */}
      <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}>
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
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: theme.radii.pill,
              backgroundColor: progressPct >= 100 ? c.ok : c.warn,
            }}
          />
        </View>
      </View>

      {/* SubTabs */}
      <SegmentedTabs
        tabs={[
          { key: 'Inspiration', label: 'Inspiration' },
          { key: 'Ranking', label: 'Ranking' },
          { key: 'AI Notes', label: 'AI Notes' },
          { key: 'Brief', label: 'Brief' },
        ]}
        active={tab}
        onChange={setTab}
        style={{ paddingHorizontal: SPACE.lg }}
      />

      {/* Low-input encouragement (if no refs + not on Brief tab) */}
      {isLowInput && tab !== 'Brief' ? (
        <View style={{ paddingHorizontal: SPACE.lg }}>
          <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
            <Eyebrow style={{ color: c.warn }}>
              {areaLabel} needs more input
            </Eyebrow>
            <Body style={{ marginTop: 5, color: c.text }}>
              Rank at least {recommended} images so the AI can suggest a reliable
              direction. Nothing's wrong — it just needs more to go on.
            </Body>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md, flexWrap: 'wrap' }}>
              <Button
                title={adding ? 'Uploading…' : 'Add inspiration'}
                variant="primary"
                size="md"
                loading={adding}
                leading={<Feather name="plus" size={16} color={c.onAccent} />}
                onPress={() => void pickAndUpload()}
              />
              <Button
                title="Use presets"
                variant="secondary"
                size="md"
                leading={<Feather name="layers" size={16} color={c.accentDeep} />}
                onPress={() => setPresetOpen(true)}
              />
            </View>
          </Card>
        </View>
      ) : null}

      {/* ── Tab: Inspiration ──────────────────────────────────────────── */}
      {tab === 'Inspiration' ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.md }}>
          {/* Add buttons row */}
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              title="Upload"
              variant="secondary"
              size="md"
              loading={adding}
              leading={<Feather name="camera" size={16} color={c.accentDeep} />}
              onPress={() => void pickAndUpload()}
              style={{ flex: 1 }}
            />
            <Button
              title="Pinterest"
              variant="secondary"
              size="md"
              leading={<Feather name="image" size={16} color={c.accentDeep} />}
              onPress={() => {
                setPinError(null)
                setPinResults(null)
                setPinOpen(true)
              }}
              style={{ flex: 1 }}
            />
            <Button
              title="Presets"
              variant="secondary"
              size="md"
              leading={<Feather name="layers" size={16} color={c.accentDeep} />}
              onPress={() => setPresetOpen(true)}
              style={{ flex: 1 }}
            />
          </View>

          {refsQ.isLoading ? (
            <Small muted>Loading references…</Small>
          ) : refs.length > 0 ? (
            /* 2-column grid */
            <View style={{ gap: SPACE.sm }}>
              {Array.from({ length: Math.ceil(refs.length / 2) }).map((_, row) => (
                <View key={row} style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  {refs.slice(row * 2, row * 2 + 2).map((r, i) => (
                    <RefGridTile
                      key={r.id}
                      reference={r}
                      index={row * 2 + i}
                      onPress={() => setTab('Ranking')}
                    />
                  ))}
                  {/* Fill empty cell if odd total */}
                  {row * 2 + 2 > refs.length ? <View style={{ flex: 1 }} /> : null}
                </View>
              ))}
            </View>
          ) : (
            /* No references yet — invite the 1-minute quick-start deck instead
               of a bare empty grid. */
            <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.secondary }}>
              <Eyebrow style={{ color: c.secondary }}>{QUICKSTART_STR.en.entryTitle}</Eyebrow>
              <Body style={{ marginTop: 5, color: c.text }}>{QUICKSTART_STR.en.entryBody}</Body>
              <Button
                title={QUICKSTART_STR.en.entryCta}
                variant="primary"
                size="md"
                leading={<Feather name="zap" size={16} color={c.onAccent} />}
                onPress={() =>
                  router.push({
                    pathname: '/(homeowner)/design/profiler/quickstart',
                    params: { pid: pid as string, area: area as string, key: key as string },
                  })
                }
                style={{ marginTop: SPACE.md }}
              />
            </Card>
          )}
        </View>
      ) : null}

      {/* ── Tab: Ranking ─────────────────────────────────────────────── */}
      {tab === 'Ranking' ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.md }}>
          {!canRank ? (
            <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
              <Small muted>Only members of this home can rank references.</Small>
            </Card>
          ) : null}

          {refsQ.isLoading ? (
            <Small muted>Loading references…</Small>
          ) : refsQ.isError ? (
            <Card padded>
              <Small muted>Couldn't load references.</Small>
            </Card>
          ) : refs.length === 0 ? (
            <Card padded>
              <BodyStrong>No references yet</BodyStrong>
              <Small muted style={{ marginTop: 4 }}>
                Add references in the Inspiration tab to start ranking.
              </Small>
            </Card>
          ) : (
            refs.map((r, i) => (
              <RefRankRow
                key={r.id}
                reference={r}
                contributorId={myContributorId ?? ''}
                canRank={canRank}
                index={i}
                onSaved={handleSaved}
              />
            ))
          )}

          {refs.length > 0 ? (
            <Button
              title="Add more references"
              variant="secondary"
              size="md"
              leading={<Feather name="plus" size={16} color={c.accentDeep} />}
              onPress={() => {
                setTab('Inspiration')
              }}
            />
          ) : null}
        </View>
      ) : null}

      {/* ── Tab: AI Notes ────────────────────────────────────────────── */}
      {tab === 'AI Notes' ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.md }}>
          {refs.length === 0 ? (
            <Small muted>Not enough yet to read a direction.</Small>
          ) : (
            <>
              <Small muted>
                So far the AI reads {areaLabel.toLowerCase()} as:
              </Small>
              {themesQ.isLoading ? (
                <Small muted>Analysing your references…</Small>
              ) : themesQ.data && themesQ.data.length > 0 ? (
                <Card padded>
                  {themesQ.data.map((t, i, arr) => {
                    const isSuggested = t.status === 'suggested'
                    const attribution = decidedAttribution(t.decided_by, myUserId)
                    const isDecidingThis = decidingThemeId === t.id
                    return (
                      <View
                        key={t.id}
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                          borderBottomColor: theme.colors.line,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm }}>
                          <View style={{ flex: 1 }}>
                            <Eyebrow style={{ color: c.textMute }}>Theme</Eyebrow>
                            <Body style={{ marginTop: 3 }}>{t.name}</Body>
                          </View>
                          {!isSuggested ? (
                            <StatusPill status={themeDecisionTone(t.status)} size="sm" label={t.status} />
                          ) : null}
                        </View>
                        {t.materials.length > 0 ? (
                          <Small muted>Materials: {t.materials.join(', ')}</Small>
                        ) : null}
                        {/* Confidence inline */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Feather
                            name={t.confidence > 0.65 ? 'check-circle' : 'clock'}
                            size={13}
                            color={t.confidence > 0.65 ? c.ok : c.warn}
                          />
                          <Micro
                            style={{
                              color: t.confidence > 0.65 ? c.ok : c.warn,
                              fontWeight: '600',
                            }}
                          >
                            {t.confidence > 0.65 ? 'High' : 'Building'}
                          </Micro>
                        </View>

                        {!isSuggested && attribution ? (
                          <Small muted>{attribution}</Small>
                        ) : null}

                        {isSuggested && canApprove ? (
                          <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap', marginTop: 4 }}>
                            <Button
                              title={THEME_DECISION_STR.en.approve}
                              variant="primary"
                              size="md"
                              loading={isDecidingThis && decideThemeMut.variables?.action === 'approve'}
                              onPress={() =>
                                decideThemeMut.mutate({ themeId: t.id, action: 'approve' })
                              }
                            />
                            <Button
                              title={THEME_DECISION_STR.en.adjust}
                              variant="secondary"
                              size="md"
                              onPress={() => {
                                setAdjustNote('')
                                setAdjustSheet(t)
                              }}
                            />
                            <Button
                              title={THEME_DECISION_STR.en.reject}
                              variant="ghost"
                              size="md"
                              loading={isDecidingThis && decideThemeMut.variables?.action === 'reject'}
                              onPress={() =>
                                decideThemeMut.mutate({ themeId: t.id, action: 'reject' })
                              }
                            />
                          </View>
                        ) : null}
                      </View>
                    )
                  })}
                </Card>
              ) : (
                <Card padded>
                  <Small muted>
                    AI is still building your theme — add more references to help it.
                  </Small>
                </Card>
              )}

              {pendingConflicts.length > 0 ? (
                <View style={{ gap: SPACE.sm }}>
                  {pendingConflicts.map((cf) => {
                    const sides = conflictSides(cf, contributors, myContributorId)
                    return (
                      <Card key={cf.id} padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
                        <Eyebrow style={{ color: c.warn, marginBottom: 6 }}>
                          Your styles differ
                        </Eyebrow>
                        <Small style={{ color: c.text }}>
                          {sides.label}: {sides.a.name} leans {sides.a.value.toLowerCase()}, {sides.b.name}{' '}
                          leans {sides.b.value.toLowerCase()}.
                        </Small>
                        <Button
                          title={CONFLICT_STR.en.cardButton}
                          variant="ghost"
                          size="md"
                          leading={<Feather name="message-circle" size={16} color={c.warn} />}
                          onPress={() => {
                            setConflictReadOnly(!canApprove)
                            setConflictNote('')
                            setConflictSheet(cf)
                          }}
                          style={{ marginTop: SPACE.sm }}
                        />
                      </Card>
                    )
                  })}
                </View>
              ) : null}

              {settledConflicts.length > 0 ? (
                <View style={{ gap: 4 }}>
                  {settledConflicts.map((cf) => (
                    <Small key={cf.id} muted>
                      {resolvedSummary(cf.decision_note, null)}
                    </Small>
                  ))}
                </View>
              ) : null}
            </>
          )}

          {/* Clarifications — questions the AI needs answered for this area */}
          {openClars.length > 0 || answeredClars.length > 0 ? (
            <View style={{ gap: SPACE.sm }}>
              <Eyebrow style={{ color: c.textMute }}>{CLAR_STR.en.cardEyebrow}</Eyebrow>
              {openClars.length > 0 ? (
                <Card padded>
                  {openClars.map((cl, i, arr) => (
                    <View
                      key={cl.id}
                      style={{
                        borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                        borderBottomColor: theme.colors.line,
                      }}
                    >
                      <ClarificationRow
                        id={cl.id}
                        question={cl.question}
                        answer={cl.answer}
                        onAnswered={() =>
                          void qc.invalidateQueries({
                            queryKey: ['design', 'profiler', 'clarifications', pid],
                          })
                        }
                      />
                    </View>
                  ))}
                </Card>
              ) : null}
              {answeredClars.length > 0 ? (
                <View>
                  {answeredClars.map((cl) => (
                    <ClarificationRow
                      key={cl.id}
                      id={cl.id}
                      question={cl.question}
                      answer={cl.answer}
                      onAnswered={() => {}}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Tab: Brief ───────────────────────────────────────────────── */}
      {tab === 'Brief' ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm }}>
          <Card padded style={{ backgroundColor: AP.chip + '40', borderColor: c.ok + '30' }}>
            <Eyebrow style={{ color: c.secondary }}>Suggested theme</Eyebrow>
            {themesQ.data && themesQ.data.length > 0 ? (
              <>
                <BodyStrong style={{ marginTop: 4, fontSize: 18 }}>
                  {themesQ.data[0].name}
                </BodyStrong>
                {themesQ.data[0].materials.length > 0 ? (
                  <Small muted style={{ marginTop: 6 }}>
                    {themesQ.data[0].materials.join(' · ')}
                  </Small>
                ) : null}
              </>
            ) : refs.length === 0 ? (
              <Small muted style={{ marginTop: 4 }}>
                Add and rank a few references to generate this brief.
              </Small>
            ) : (
              <Small muted style={{ marginTop: 4 }}>
                Brief is being prepared from your references.
              </Small>
            )}
            <Button
              title={`Open full ${areaLabel.toLowerCase()} brief`}
              variant="secondary"
              size="md"
              onPress={() => router.push('/(homeowner)/design/brief')}
              style={{ marginTop: SPACE.md }}
            />
          </Card>
        </View>
      ) : null}

      {/* ── Pinterest paste-a-link sheet (one-tap + multi-link) ─────────── */}
      <Modal
        visible={pinOpen}
        transparent
        animationType="slide"
        onRequestClose={closePinSheet}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
          onPress={closePinSheet}
        >
          <Pressable
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.card,
              borderTopRightRadius: theme.radii.card,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.lg,
              gap: SPACE.sm,
            }}
            onPress={() => {}}
          >
            <Eyebrow style={{ color: c.textMute }}>Add from Pinterest</Eyebrow>
            <BodyStrong>Paste a pin link</BodyStrong>

            {pinResults ? (
              <>
                <Small style={{ marginTop: SPACE.xs, fontWeight: '600', color: c.text }}>
                  {PS.resultLine(pinResults.ok, pinResults.fails.length)}
                </Small>
                {pinResults.fails.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    {pinResults.fails.map((reason, i) => (
                      <Small key={i} muted>
                        {reason}
                      </Small>
                    ))}
                  </View>
                ) : null}
                <Button
                  title={PS.done}
                  variant="primary"
                  size="md"
                  onPress={closePinSheet}
                  style={{ marginTop: SPACE.sm }}
                />
              </>
            ) : (
              <>
                <Small muted>
                  Open a pin in Pinterest, tap Share → Copy link, and paste it here — or paste
                  several links at once. We'll save each image to your inspiration.
                </Small>
                <Button
                  title={PS.pasteButton}
                  variant="secondary"
                  size="md"
                  leading={<Feather name="clipboard" size={16} color={c.accentDeep} />}
                  onPress={() => void pasteFromPinterest()}
                  style={{ marginTop: SPACE.xs }}
                />
                <TextInput
                  value={pinUrl}
                  onChangeText={(t) => {
                    setPinUrl(t)
                    if (pinError) setPinError(null)
                  }}
                  placeholder="https://pin.it/… (one or more, one per line)"
                  placeholderTextColor={c.textMute}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  keyboardType="url"
                  style={{
                    borderWidth: 1,
                    borderColor: pinError ? c.warn : c.line,
                    borderRadius: theme.radii.control,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm,
                    color: c.text,
                    backgroundColor: c.paper,
                    marginTop: SPACE.xs,
                    minHeight: 44,
                  }}
                />
                {pinError ? (
                  <Small style={{ color: c.warn }}>{pinError}</Small>
                ) : null}
                <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
                  <Button
                    title="Cancel"
                    variant="ghost"
                    size="md"
                    onPress={closePinSheet}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={pinSubmitting ? 'Adding…' : 'Add'}
                    variant="primary"
                    size="md"
                    loading={pinSubmitting}
                    onPress={() => {
                      if (pinUrl.trim()) void submitPins()
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Presets picker sheet ──────────────────────────────────────── */}
      <Modal
        visible={presetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPresetOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
          onPress={() => setPresetOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.card,
              borderTopRightRadius: theme.radii.card,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.lg,
              gap: SPACE.md,
              maxHeight: '72%',
            }}
            onPress={() => {}}
          >
            <Eyebrow style={{ color: c.textMute }}>Preset packs</Eyebrow>
            <BodyStrong>Designer starters for {areaLabel}</BodyStrong>
            {presetsQ.isLoading ? (
              <Small muted>Loading packs…</Small>
            ) : (presetsQ.data?.length ?? 0) === 0 ? (
              <Small muted>No preset packs yet for this area.</Small>
            ) : (
              <ScrollView contentContainerStyle={{ gap: SPACE.md }}>
                {(presetsQ.data ?? []).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => addByPreset.mutate(p.id)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      gap: SPACE.md,
                      alignItems: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    {p.image_url ? (
                      <BlurUpImage
                        uri={p.image_url}
                        style={{ width: 64, height: 64, borderRadius: theme.radii.chip }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: theme.radii.chip,
                          backgroundColor: AP.surfaceContainer,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Feather name="image" size={20} color={c.textMute} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Body>{p.title}</Body>
                      <Micro muted>{p.pack}</Micro>
                    </View>
                    <Feather name="plus-circle" size={20} color={c.accentDeep} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Button
              title="Done"
              variant="secondary"
              size="md"
              onPress={() => setPresetOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── "Settle this together" conflict sheet ───────────────────────── */}
      <Modal
        visible={!!conflictSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setConflictSheet(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
            onPress={() => setConflictSheet(null)}
          >
            <Pressable
              style={{
                backgroundColor: c.card,
                borderTopLeftRadius: theme.radii.card,
                borderTopRightRadius: theme.radii.card,
                padding: SPACE.lg,
                paddingBottom: insets.bottom + SPACE.lg,
                gap: SPACE.md,
                maxHeight: '85%',
              }}
              onPress={() => {}}
            >
              {conflictSheet ? (
                <ScrollView contentContainerStyle={{ gap: SPACE.md }}>
                  <Eyebrow style={{ color: c.textMute }}>{CONFLICT_STR.en.sheetEyebrow}</Eyebrow>
                  <BodyStrong>{CONFLICT_STR.en.sheetTitle}</BodyStrong>

                  {(() => {
                    const sides = conflictSides(conflictSheet, contributors, myContributorId)
                    return (
                      <>
                        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                          <Card padded style={{ flex: 1 }}>
                            <Micro muted>{sides.a.name}</Micro>
                            <Body style={{ marginTop: 4, fontWeight: '600' }}>{sides.a.value}</Body>
                          </Card>
                          <Card padded style={{ flex: 1 }}>
                            <Micro muted>{sides.b.name}</Micro>
                            <Body style={{ marginTop: 4, fontWeight: '600' }}>{sides.b.value}</Body>
                          </Card>
                        </View>

                        {conflictReadOnly ? (
                          <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
                            <Small muted>{CONFLICT_STR.en.readOnlyNotice}</Small>
                          </Card>
                        ) : (
                          <>
                            <Button
                              title={CONFLICT_STR.en.keepA(sides.a.name)}
                              variant="primary"
                              size="md"
                              loading={
                                resolveConflictMut.isPending &&
                                resolveConflictMut.variables?.resolution === 'keep_a'
                              }
                              onPress={() => resolveConflictMut.mutate({ resolution: 'keep_a' })}
                            />
                            <Button
                              title={CONFLICT_STR.en.keepB(sides.b.name)}
                              variant="primary"
                              size="md"
                              loading={
                                resolveConflictMut.isPending &&
                                resolveConflictMut.variables?.resolution === 'keep_b'
                              }
                              onPress={() => resolveConflictMut.mutate({ resolution: 'keep_b' })}
                            />

                            <View style={{ gap: SPACE.sm }}>
                              <Small muted>{CONFLICT_STR.en.compromiseLabel}</Small>
                              <TextInput
                                value={conflictNote}
                                onChangeText={setConflictNote}
                                placeholder={CONFLICT_STR.en.compromisePlaceholder}
                                placeholderTextColor={c.textMute}
                                multiline
                                style={{
                                  borderWidth: 1,
                                  borderColor: c.line,
                                  borderRadius: theme.radii.control,
                                  paddingHorizontal: SPACE.md,
                                  paddingVertical: SPACE.sm,
                                  color: c.text,
                                  backgroundColor: c.paper,
                                  minHeight: 44,
                                }}
                              />
                              <Button
                                title={CONFLICT_STR.en.compromiseCta}
                                variant="secondary"
                                size="md"
                                loading={
                                  resolveConflictMut.isPending &&
                                  resolveConflictMut.variables?.resolution === 'compromise'
                                }
                                onPress={() => {
                                  if (conflictNote.trim().length >= 3) {
                                    resolveConflictMut.mutate({
                                      resolution: 'compromise',
                                      note: conflictNote.trim(),
                                    })
                                  }
                                }}
                              />
                            </View>

                            <Button
                              title={CONFLICT_STR.en.deferLabel}
                              variant="ghost"
                              size="md"
                              loading={
                                resolveConflictMut.isPending &&
                                resolveConflictMut.variables?.resolution === 'defer_to_architect'
                              }
                              onPress={() =>
                                resolveConflictMut.mutate({ resolution: 'defer_to_architect' })
                              }
                            />
                          </>
                        )}

                        <Button
                          title={CONFLICT_STR.en.cancel}
                          variant="ghost"
                          size="md"
                          onPress={() => setConflictSheet(null)}
                        />
                      </>
                    )
                  })()}
                </ScrollView>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── "Close, adjust" note sheet — optional note on an adjust decision ── */}
      <Modal
        visible={!!adjustSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setAdjustSheet(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
            onPress={() => setAdjustSheet(null)}
          >
            <Pressable
              style={{
                backgroundColor: c.card,
                borderTopLeftRadius: theme.radii.card,
                borderTopRightRadius: theme.radii.card,
                padding: SPACE.lg,
                paddingBottom: insets.bottom + SPACE.lg,
                gap: SPACE.sm,
              }}
              onPress={() => {}}
            >
              <Eyebrow style={{ color: c.textMute }}>{THEME_DECISION_STR.en.adjustSheetEyebrow}</Eyebrow>
              <BodyStrong>{THEME_DECISION_STR.en.adjustSheetTitle}</BodyStrong>
              <TextInput
                value={adjustNote}
                onChangeText={setAdjustNote}
                placeholder={THEME_DECISION_STR.en.adjustPlaceholder}
                placeholderTextColor={c.textMute}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: c.line,
                  borderRadius: theme.radii.control,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                  color: c.text,
                  backgroundColor: c.paper,
                  minHeight: 44,
                }}
              />
              <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
                <Button
                  title={THEME_DECISION_STR.en.cancel}
                  variant="ghost"
                  size="md"
                  onPress={() => setAdjustSheet(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  title={
                    adjustNote.trim()
                      ? THEME_DECISION_STR.en.adjustSubmit
                      : THEME_DECISION_STR.en.adjustSkip
                  }
                  variant="primary"
                  size="md"
                  loading={decideThemeMut.isPending}
                  onPress={() =>
                    adjustSheet &&
                    decideThemeMut.mutate({
                      themeId: adjustSheet.id,
                      action: 'adjust',
                      note: adjustNote.trim() || undefined,
                    })
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}
