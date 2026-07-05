/**
 * "Rate 10 designer picks" quick-start deck — a fast, one-card-at-a-time
 * taste-profile builder for a homeowner who doesn't know where to start in
 * an area's Inspiration tab (empty-state entry in [area].tsx).
 *
 * Flow: pick up to 10 presets from the area's curated pack catalog
 * (pack-interleaved + deterministic, see quickstart.util.ts) → show one
 * full-width card at a time → a star tap adds the preset as a reference
 * (design.referenceFromPreset) then ranks it (design.rankReference) and
 * advances. "Skip" just advances without writing anything. Both writes are
 * idempotent server-side (preset dedupe), so leaving mid-deck and coming
 * back later loses nothing and never double-counts.
 *
 * Membrane: ranking requires a contributor identity (RankingIn.contributor_id
 * is a required UUID server-side). Same gate as [area].tsx's `canRank` — a
 * viewer without my_contributor_id gets a calm read-only notice, never an
 * interactive deck that would 422 on every tap. On a rank failure the card
 * STAYS (retry or Skip explicitly) — "N rated" counts successful ranks only.
 *
 * Finishing (or skipping through all 10) shows a closing card — no further
 * network calls, just a summary + a way back to the area.
 */
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'

import { design } from '../../../../src/api/client'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import {
  BlurUpImage,
  Body,
  BodyStrong,
  Button,
  Card,
  Eyebrow,
  Micro,
  Screen,
  Small,
  SubHeader,
  useToast,
} from '../../../../src/ui'
import { pickQuickstartPresets, QUICKSTART_STR } from '../../../../src/homeowner/quickstart.util'

// ---------------------------------------------------------------------------
// Star picker — mirrors the `Stars` idiom in [area].tsx (unfilled row; a tap
// commits that count immediately, no local "current value" to track since
// each card only ever gets rated once).
// ---------------------------------------------------------------------------

function QuickstartStars({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (n: number) => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const size = 28
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} stars`}
          disabled={disabled}
          onPress={() => onPick(n)}
          hitSlop={8}
          style={{
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: AP.surfaceContainer,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Feather name="star" size={size - 8} color={c.quiet} />
        </Pressable>
      ))}
    </View>
  )
}

export default function QuickstartScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const toast = useToast()
  const S = QUICKSTART_STR.en

  const { area, pid, key } = useLocalSearchParams<{
    area: string
    pid: string
    key: string
  }>()

  const areaLabel = String(key ?? 'Area').replace(/_/g, ' ')

  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'detail', pid],
    queryFn: () => design.profile(pid as string),
    enabled: !!pid,
  })
  const myContributorId = profileQ.data?.my_contributor_id ?? null
  // Same membrane gate as [area].tsx — without a contributor identity the
  // server rejects every ranking, so the deck must not render at all.
  const canRank = !!myContributorId
  const areaDetail = profileQ.data?.areas?.find((a) => a.id === area)
  const areaKind = areaDetail?.area_kind ?? 'interior'

  const presetsQ = useQuery({
    queryKey: ['design', 'presets', areaKind, key],
    queryFn: () => design.presets(areaKind, key ? String(key) : undefined),
    enabled: !!areaKind,
  })

  const deck = pickQuickstartPresets(presetsQ.data ?? [], 10)
  const total = deck.length

  const [index, setIndex] = useState(0)
  const [ratedCount, setRatedCount] = useState(0)
  const current = deck[index]
  const done = total === 0 || index >= total

  const rateMut = useMutation({
    // contributorId is threaded through the variables (narrowed non-null at the
    // call site by the `canRank` gate) — never a `?? ''` fallback the server
    // would 422 on.
    mutationFn: async ({
      presetId,
      stars,
      contributorId,
    }: {
      presetId: string
      stars: number
      contributorId: string
    }) => {
      const ref = await design.referenceFromPreset({
        area_id: area as string,
        contributor_id: contributorId,
        preset_id: presetId,
      })
      await design.rankReference(ref.id, {
        contributor_id: contributorId,
        stars,
        tags: {},
      })
    },
    onSuccess: () => {
      setRatedCount((n) => n + 1)
      setIndex((i) => i + 1)
    },
    onError: (e: Error) => {
      // Honest failure: keep the card so she can retry (tap a star again) or
      // Skip explicitly — never advance-and-count a rating that didn't land.
      toast(e.message)
    },
  })

  function handleStar(stars: number) {
    if (!current || !myContributorId || rateMut.isPending) return
    rateMut.mutate({ presetId: current.id, stars, contributorId: myContributorId })
  }

  function handleSkip() {
    if (rateMut.isPending) return
    setIndex((i) => i + 1)
  }

  function goToArea() {
    router.back()
  }

  return (
    <Screen floatingNav padded={false}>
      <SubHeader
        title={`Quick start — ${areaLabel}`}
        subtitle={canRank && !done ? S.progress(index + 1, total) : undefined}
        onBack={() => router.back()}
      />

      <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md }}>
        {presetsQ.isLoading || profileQ.isLoading ? (
          <Small muted>Loading designer picks…</Small>
        ) : !canRank ? (
          /* No contributor identity — ranking is impossible (server requires
             it), so no interactive deck. Same calm notice as [area].tsx. */
          <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
            <Small muted>{S.readOnlyNotice}</Small>
            <Button
              title={S.seeArea}
              variant="secondary"
              size="md"
              onPress={goToArea}
              style={{ marginTop: SPACE.md }}
            />
          </Card>
        ) : total === 0 ? (
          <Card padded>
            <BodyStrong>No preset packs yet</BodyStrong>
            <Small muted style={{ marginTop: 4 }}>
              There's nothing to quick-rate for this area yet — try adding your own
              inspiration instead.
            </Small>
            <Button
              title={S.seeArea}
              variant="secondary"
              size="md"
              onPress={goToArea}
              style={{ marginTop: SPACE.md }}
            />
          </Card>
        ) : done ? (
          <Card padded style={{ backgroundColor: AP.chip + '40', borderColor: c.ok + '30' }}>
            <Eyebrow style={{ color: c.secondary }}>Nice work</Eyebrow>
            <BodyStrong style={{ marginTop: 4, fontSize: 18 }}>
              {S.finishedTitle(ratedCount)}
            </BodyStrong>
            <Small muted style={{ marginTop: 6 }}>
              {S.finishedBody}
            </Small>
            <Button
              title={S.seeArea}
              variant="primary"
              size="md"
              onPress={goToArea}
              style={{ marginTop: SPACE.md }}
            />
          </Card>
        ) : (
          <>
            {/* Progress dots */}
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
              {deck.map((p, i) => (
                <View
                  key={p.id}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i <= index ? c.secondary : AP.surfaceContainer,
                  }}
                />
              ))}
            </View>

            <Card padded={false} style={{ overflow: 'hidden' }}>
              {current?.image_url ? (
                <BlurUpImage
                  uri={current.image_url}
                  style={{ width: '100%', height: 260 }}
                />
              ) : (
                <View
                  style={{
                    width: '100%',
                    height: 260,
                    backgroundColor: AP.surfaceContainer,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="image" size={28} color={c.textMute} />
                </View>
              )}

              <View style={{ padding: SPACE.lg, gap: SPACE.sm }}>
                <Micro muted>{current?.pack}</Micro>
                <Body style={{ fontWeight: '600', fontSize: 16 }}>{current?.title}</Body>
                <Small muted>{S.starHint}</Small>
                <QuickstartStars disabled={rateMut.isPending} onPick={handleStar} />
                <Button
                  title={S.skip}
                  variant="ghost"
                  size="md"
                  disabled={rateMut.isPending}
                  onPress={handleSkip}
                  style={{ marginTop: SPACE.sm }}
                />
              </View>
            </Card>
          </>
        )}
      </View>
    </Screen>
  )
}
