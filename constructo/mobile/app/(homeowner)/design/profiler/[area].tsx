/**
 * Design Profiler — per-area ranking screen. Fetches references for the area
 * and the profile detail for the caller's contributor id. Allows 1–5 star
 * rating + quick-tag chips per reference. Calm Cockpit kit, href:null route.
 *
 * Each reference renders in its own <RefRankRow> so stars/tags state is
 * isolated — picking stars on ref A cannot bleed into a save on ref B.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { design } from '../../../../src/api/client'
import type { ProfilerReference } from '../../../../src/api/client'
import {
  Screen,
  SubHeader,
  Chip,
  Body,
  CalmCard,
  useToast,
} from '../../../../src/ui'
import {
  RANKING_TAGS,
  PROFILER_STR,
} from '../../../../src/homeowner/design_profiler.util'

// ---------------------------------------------------------------------------
// Per-reference row — owns its own stars/tags state and mutation
// ---------------------------------------------------------------------------

interface RefRankRowProps {
  reference: ProfilerReference
  contributorId: string
  canRank: boolean
  onSaved: () => void
}

function RefRankRow({ reference, contributorId, canRank, onSaved }: RefRankRowProps) {
  const toast = useToast()
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
      toast('Saved', 'check')
      setStars(0)
      setTags([])
      onSaved()
    },
    onError: (e: Error) => toast(e.message),
  })

  return (
    <View style={{ gap: 8 }}>
      <Body>{reference.source_type}</Body>

      {/* Star picker — ≥48px touch target via hitSlop */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setStars(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${n} stars`}
          >
            <Body>{n <= stars ? '★' : '☆'}</Body>
          </Pressable>
        ))}
      </View>

      {/* Quick tags */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {RANKING_TAGS.map((tg) => (
          <Chip
            key={tg}
            label={tg}
            active={tags.includes(tg)}
            onPress={() =>
              setTags((cur) =>
                cur.includes(tg) ? cur.filter((x) => x !== tg) : [...cur, tg],
              )
            }
          />
        ))}
      </View>

      {/* Save — disabled unless canRank and at least 1 star chosen */}
      <Chip
        label="Save ranking"
        active={canRank && stars > 0}
        onPress={() => {
          if (canRank && stars > 0) mut.mutate()
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
  const { area, pid, key } = useLocalSearchParams<{
    area: string
    pid: string
    key: string
  }>()
  const S = PROFILER_STR.en

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

  const myContributorId = profileQ.data?.my_contributor_id ?? null
  const canRank = !!myContributorId

  const handleSaved = () => {
    void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
  }

  return (
    <Screen scroll padded floatingNav>
      <SubHeader
        title={String(key ?? 'Area').replace(/_/g, ' ')}
        subtitle={S.rankPrompt}
        onBack={() => router.back()}
      />

      {!canRank && (
        <CalmCard status="quiet" title="Only members of this home can rank." />
      )}

      {refsQ.isLoading && <Body>Loading…</Body>}

      {refsQ.isError && (
        <CalmCard status="quiet" title="Couldn't load references." />
      )}

      {refsQ.data?.length === 0 && (
        <CalmCard status="quiet" title="No references yet" />
      )}

      {refsQ.data?.map((r) => (
        <RefRankRow
          key={r.id}
          reference={r}
          contributorId={myContributorId ?? ''}
          canRank={canRank}
          onSaved={handleSaved}
        />
      ))}
    </Screen>
  )
}
