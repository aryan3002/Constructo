/**
 * Design Profiler — brief review + approval screen. Resolves the homeowner's
 * property, fetches the design profile and the audience-filtered brief.
 * Owner-only approval actions gated on capabilities. Calm Cockpit kit,
 * href:null route.
 */
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError, design, homeowner } from '../../../src/api/client'
import {
  Screen,
  SubHeader,
  SegmentedTabs,
  CalmCard,
  Body,
  BodyStrong,
  Small,
  Chip,
  useToast,
} from '../../../src/ui'
import {
  briefAudienceTabs,
  PROFILER_STR,
} from '../../../src/homeowner/design_profiler.util'

type Aud = 'homeowner' | 'architect' | 'contractor'

export default function BriefScreen() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const S = PROFILER_STR.en
  const [aud, setAud] = useState<Aud>('homeowner')

  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'brief-profile', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })
  const pid = profileQ.data?.id

  const capQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })

  const briefQ = useQuery({
    queryKey: ['design', 'profiler', 'brief', pid, aud],
    queryFn: () => design.brief(pid as string, aud),
    enabled: !!pid,
    retry: false,
  })
  const briefId = briefQ.data?.brief_id

  const actMut = useMutation({
    mutationFn: (action: string) =>
      design.actOnBrief(briefId as string, { action }),
    onSuccess: () => {
      toast('Done', 'check')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'approve_forbidden') {
        toast(S.onlyOwnerCanApprove)
      } else {
        toast((e as Error).message)
      }
    },
  })

  // Upstream failures — property or profile fetch failed
  if (propQ.isError || profileQ.isError) {
    return (
      <Screen scroll padded floatingNav>
        <SubHeader title={S.briefTitle} onBack={() => router.back()} />
        <CalmCard status="quiet" title={S.noBriefYet} />
      </Screen>
    )
  }

  // Honest error states for the brief
  if (briefQ.isError) {
    const err = briefQ.error
    const code = err instanceof ApiError ? err.code : undefined
    const msg =
      code === 'brief_not_shared' || code === 'audience_forbidden'
        ? S.notSharedYet
        : S.noBriefYet
    return (
      <Screen scroll padded floatingNav>
        <SubHeader title={S.briefTitle} onBack={() => router.back()} />
        <CalmCard status="quiet" title={msg} />
      </Screen>
    )
  }

  const content = briefQ.data?.content_json as
    | {
        narrative?: { headline?: string; summary?: string }
        areas?: {
          area_key: string
          material_families: string[]
          themes: { name: string }[]
        }[]
      }
    | undefined

  return (
    <Screen scroll padded floatingNav>
      <SubHeader title={S.briefTitle} onBack={() => router.back()} />

      <SegmentedTabs
        tabs={briefAudienceTabs('en')}
        active={aud}
        onChange={(k) => setAud(k as Aud)}
      />

      {(propQ.isLoading || profileQ.isLoading || briefQ.isLoading) && (
        <Body>Loading…</Body>
      )}

      {content?.narrative?.headline ? (
        <BodyStrong>{content.narrative.headline}</BodyStrong>
      ) : null}

      {content?.narrative?.summary ? (
        <Body>{content.narrative.summary}</Body>
      ) : null}

      {(content?.areas ?? []).map((a) => (
        <CalmCard
          key={a.area_key}
          status="info"
          eyebrow={a.area_key.replace(/_/g, ' ').toUpperCase()}
          title={a.themes[0]?.name ?? 'Direction'}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {a.material_families.map((m) => (
              <Chip key={m} label={m} active={false} />
            ))}
          </View>
        </CalmCard>
      ))}

      {capQ.data?.can_approve ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            label={S.sendToArchitect}
            active
            onPress={() => briefId && actMut.mutate('send_to_architect')}
          />
          <Chip
            label={S.requestChanges}
            active={false}
            onPress={() => briefId && actMut.mutate('request_changes')}
          />
        </View>
      ) : (
        <Small>{S.onlyOwnerCanApprove}</Small>
      )}
    </Screen>
  )
}
