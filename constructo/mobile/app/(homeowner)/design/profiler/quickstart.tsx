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
    mutationFn: async ({ presetId, stars }: { presetId: string; stars: number }) => {
      const ref = await design.referenceFromPreset({
        area_id: area as string,
        contributor_id: myContributorId ?? undefined,
        preset_id: presetId,
      })
      await design.rankReference(ref.id, {
        contributor_id: myContributorId ?? '',
        stars,
        tags: {},
      })
    },
    onSuccess: () => {
      setRatedCount((n) => n + 1)
      setIndex((i) => i + 1)
    },
    onError: (e: Error) => {
      toast(e.message)
      // Still advance — she can always add it again from Inspiration later.
      setIndex((i) => i + 1)
    },
  })

  function handleStar(stars: number) {
    if (!current || rateMut.isPending) return
    rateMut.mutate({ presetId: current.id, stars })
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
        subtitle={!done ? S.progress(index + 1, total) : undefined}
        onBack={() => router.back()}
      />

      <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.md }}>
        {presetsQ.isLoading || profileQ.isLoading ? (
          <Small muted>Loading designer picks…</Small>
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
