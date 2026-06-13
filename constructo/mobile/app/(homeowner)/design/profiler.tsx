/**
 * Design Profiler — intake hub. Resolves the homeowner's property, fetches
 * the design profile, and lists all areas grouped by kind. Each row pushes
 * to the per-area ranking screen. Calm Cockpit kit, href:null route.
 */
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { View } from 'react-native'

import { design, homeowner } from '../../../src/api/client'
import {
  Screen,
  SubHeader,
  CalmCard,
  ListRow,
  StatusPill,
  Body,
  Eyebrow,
} from '../../../src/ui'
import {
  areaProgressLabel,
  confidenceBand,
  groupAreasByKind,
  PROFILER_STR,
} from '../../../src/homeowner/design_profiler.util'

export default function ProfilerHubScreen() {
  const router = useRouter()
  const S = PROFILER_STR.en

  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  const q = useQuery({
    queryKey: ['design', 'profiler', 'by-site', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })

  return (
    <Screen scroll padded floatingNav>
      <SubHeader
        title={S.intakeTitle}
        subtitle={S.intakeSub}
        onBack={() => router.back()}
      />
      {(propQ.isLoading || q.isLoading) && <Body>Loading…</Body>}
      {(q.isError || propQ.isError) && (
        <CalmCard status="quiet" title={S.noBriefYet} />
      )}
      {q.data && groupAreasByKind(q.data.areas).map((group) => (
        <View key={group.kind} style={{ gap: 8 }}>
          <Eyebrow>{group.label.toUpperCase()}</Eyebrow>
          {group.areas.map((a, i) => {
            const band = confidenceBand(a.confidence)
            return (
              <ListRow
                key={a.id}
                title={a.area_key.replace(/_/g, ' ')}
                subtitle={areaProgressLabel(0, a.recommended_count)}
                right={
                  <StatusPill
                    status={band.tone}
                    label={band.label}
                    size="sm"
                  />
                }
                onPress={() =>
                  router.push({
                    pathname: '/(homeowner)/design/profiler/[area]',
                    params: { area: a.id, pid: q.data!.id, key: a.area_key },
                  })
                }
                last={i === group.areas.length - 1}
              />
            )
          })}
        </View>
      ))}
    </Screen>
  )
}
