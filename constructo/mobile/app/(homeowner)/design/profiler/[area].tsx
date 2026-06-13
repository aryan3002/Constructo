/**
 * Design Profiler — per-area ranking screen. Fetches references for the area
 * and the profile detail for the caller's contributor id. Allows 1–5 star
 * rating + quick-tag chips per reference. Calm Cockpit kit, href:null route.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { design } from '../../../../src/api/client'
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

export default function AreaRankScreen() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { area, pid, key } = useLocalSearchParams<{
    area: string
    pid: string
    key: string
  }>()
  const S = PROFILER_STR.en

  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])

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

  const rankMut = useMutation({
    mutationFn: (refId: string) =>
      design.rankReference(refId, {
        contributor_id: myContributorId as string,
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
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: Error) => toast(e.message),
  })

  return (
    <Screen scroll padded floatingNav>
      <SubHeader
        title={String(key ?? 'Area').replace(/_/g, ' ')}
        subtitle={S.rankPrompt}
        onBack={() => router.back()}
      />

      {!myContributorId && (
        <CalmCard status="quiet" title="Only members of this home can rank." />
      )}

      {refsQ.isLoading && <Body>Loading…</Body>}

      {refsQ.data?.length === 0 && (
        <CalmCard status="quiet" title="No references yet" />
      )}

      {refsQ.data?.map((r) => (
        <View key={r.id} style={{ gap: 8 }}>
          <Body>{r.source_type}</Body>

          {/* Star picker */}
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
                    cur.includes(tg)
                      ? cur.filter((x) => x !== tg)
                      : [...cur, tg],
                  )
                }
              />
            ))}
          </View>

          {/* Save */}
          <Chip
            label="Save ranking"
            active
            onPress={() => {
              if (myContributorId && stars > 0) rankMut.mutate(r.id)
            }}
          />
        </View>
      ))}
    </Screen>
  )
}
