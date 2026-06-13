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
import { Pressable, View, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { design } from '../../../../src/api/client'
import type { ProfilerReference } from '../../../../src/api/client'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Eyebrow,
  FadeInUp,
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
        {/* Reference thumbnail placeholder */}
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: theme.radii.chip,
            backgroundColor: AP.surfaceContainer,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Feather name="image" size={24} color={c.textMute} />
          <Micro muted style={{ marginTop: 4 }}>ref {index + 1}</Micro>
        </View>
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
          backgroundColor: AP.surfaceContainer,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.line,
        }}
      >
        <Feather name="image" size={28} color={c.textMute} />
        <Micro muted style={{ marginTop: 4 }}>
          {reference.source_type}
        </Micro>
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
            {reference.source_type === 'upload' ? 'Upload' : reference.source_type}
          </Micro>
        </View>
      </View>
    </Pressable>
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

  const { area, pid, key } = useLocalSearchParams<{
    area: string
    pid: string
    key: string
  }>()

  const areaLabel = String(key ?? 'Area').replace(/_/g, ' ')
  const [tab, setTab] = useState('Inspiration')

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

  const refs = refsQ.data ?? []
  const myContributorId = profileQ.data?.my_contributor_id ?? null
  const canRank = !!myContributorId

  // Per-area meta from profile
  const areaDetail = profileQ.data?.areas?.find((a) => a.id === area)
  const confidence = areaDetail?.confidence ?? 0
  const ranked = 0 // engine doesn't expose ranked count directly; use refs length proxy
  const recommended = areaDetail?.recommended_count ?? 5
  const progressPct = refs.length > 0 ? Math.min(100, Math.round((refs.length / recommended) * 100)) : 0
  const hasConflict = areaDetail?.has_conflict ?? false
  const isLowInput = refs.length === 0

  const handleSaved = () => {
    void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
  }

  const progLabel = areaProgressLabel(refs.length, recommended)

  return (
    <Screen floatingNav style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE, paddingTop: 0 }} padded={false}>
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
                title="Add inspiration"
                variant="primary"
                size="md"
                leading={<Feather name="plus" size={16} color={c.onAccent} />}
                onPress={() => toast('Upload from your photo library — Pinterest connect coming soon.')}
              />
              <Button
                title="Use presets"
                variant="secondary"
                size="md"
                leading={<Feather name="layers" size={16} color={c.accentDeep} />}
                onPress={() => toast('Designer preset packs — visual-only, not yet backed by the engine.')}
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
              leading={<Feather name="camera" size={16} color={c.accentDeep} />}
              onPress={() => toast('Upload from your photo library.')}
              style={{ flex: 1 }}
            />
            <Button
              title="Pinterest"
              variant="secondary"
              size="md"
              leading={<Feather name="image" size={16} color={c.accentDeep} />}
              onPress={() => toast('Pinterest connect — coming soon.')}
              style={{ flex: 1 }}
            />
            <Button
              title="Presets"
              variant="secondary"
              size="md"
              leading={<Feather name="layers" size={16} color={c.accentDeep} />}
              onPress={() => toast('Preset packs — visual-only, not yet backed by the engine.')}
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
          ) : null}
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
                  {themesQ.data.map((t, i, arr) => (
                    <View
                      key={t.id}
                      style={{
                        paddingVertical: 10,
                        borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                        borderBottomColor: theme.colors.line,
                      }}
                    >
                      <Eyebrow style={{ color: c.textMute }}>Theme</Eyebrow>
                      <Body style={{ marginTop: 3 }}>{t.name}</Body>
                      {t.materials.length > 0 ? (
                        <Small muted style={{ marginTop: 2 }}>
                          Materials: {t.materials.join(', ')}
                        </Small>
                      ) : null}
                      {/* Confidence inline */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
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
                    </View>
                  ))}
                </Card>
              ) : (
                <Card padded>
                  <Small muted>
                    AI is still building your theme — add more references to help it.
                  </Small>
                </Card>
              )}

              {hasConflict ? (
                <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
                  <Eyebrow style={{ color: c.warn, marginBottom: 6 }}>Open questions</Eyebrow>
                  <Small style={{ color: c.text }}>
                    Some preferences differ for {areaLabel.toLowerCase()}. Resolve them together.
                  </Small>
                  <Button
                    title="Answer in design chat"
                    variant="ghost"
                    size="md"
                    leading={<Feather name="message-circle" size={16} color={c.warn} />}
                    onPress={() => toast('Design chat — coming soon.')}
                    style={{ marginTop: SPACE.sm }}
                  />
                </Card>
              ) : null}
            </>
          )}
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
    </Screen>
  )
}
