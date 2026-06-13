/**
 * Selections — the designer's material/finish schedule. Aggregates /api/v1/specs
 * across the architect's projects with a ROUTING filter (Needs you / Out for
 * approval / Released); tapping a line opens its approval route to act on.
 */
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { specsApi, type RoutingStatus, type Spec } from '../../../src/api/specs'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, Chip, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, ROUTING_META, SubHeader } from './_components'

type Filter = 'all' | 'needs' | 'out' | 'released'

const NEEDS: RoutingStatus[] = ['returned', 'approved', 'draft']

function inFilter(f: Filter, r: RoutingStatus): boolean {
  if (f === 'all') return true
  if (f === 'needs') return NEEDS.includes(r)
  if (f === 'out') return r === 'out_for_approval'
  return r === 'released'
}

export default function Selections() {
  const { theme } = useTheme()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')

  const q = useQuery({
    queryKey: ['architect', 'specs'],
    queryFn: async () => {
      const sites = (await supervisorApi.sites()).items
      const perSite = await Promise.all(
        sites.map(async (s) => {
          const specs = await specsApi.list(s.id)
          return specs.map((sp) => ({ spec: sp, siteName: s.name }))
        }),
      )
      return perSite.flat()
    },
  })

  useFocusEffect(
    useCallback(() => {
      void q.refetch()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const rows = q.data ?? []
  const counts = useMemo(() => {
    const c = { all: rows.length, needs: 0, out: 0, released: 0 }
    for (const r of rows) {
      if (NEEDS.includes(r.spec.routing_status)) c.needs += 1
      if (r.spec.routing_status === 'out_for_approval') c.out += 1
      if (r.spec.routing_status === 'released') c.released += 1
    }
    return c
  }, [rows])
  const ORDER: Record<RoutingStatus, number> = {
    returned: 0, approved: 1, draft: 2, out_for_approval: 3, released: 4,
  }
  const filtered = rows
    .filter((r) => inFilter(filter, r.spec.routing_status))
    .sort((a, b) => ORDER[a.spec.routing_status] - ORDER[b.spec.routing_status])

  const TABS: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'needs', label: 'Needs you', n: counts.needs },
    { id: 'out', label: 'Out for approval', n: counts.out },
    { id: 'released', label: 'Released', n: counts.released },
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.md }}
    >
      <SubHeader title="Selections" sub={`${counts.all} material${counts.all === 1 ? '' : 's'} across your projects`} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
        {TABS.map((t) => (
          <Chip
            key={t.id}
            label={t.n > 0 ? `${t.label} ${t.n}` : t.label}
            active={filter === t.id}
            onPress={() => setFilter(t.id)}
          />
        ))}
      </ScrollView>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message="We could not load selections." retryLabel="Try again" onRetry={() => void q.refetch()} />
      ) : filtered.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No selections match this filter.</Small>
        </Card>
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {filtered.map(({ spec, siteName }) => (
            <SpecRow
              key={spec.id}
              spec={spec}
              siteName={siteName}
              onPress={() => router.push(`/(contractor)/architect/selection/${spec.id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function SpecRow({ spec, siteName, onPress }: { spec: Spec; siteName: string; onPress: () => void }) {
  const meta = ROUTING_META[spec.routing_status]
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag={spec.routing_status === 'returned' ? 'risk' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Title style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>{spec.label}</Title>
          <StatusPill status={meta.status} size="sm" label={meta.label} />
        </View>
        <Small muted style={{ marginTop: 4 }}>{siteName}</Small>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: 6 }}>
          {spec.client_final_code ? <Mono style={{ fontSize: 12 }}>{spec.client_final_code}</Mono> : null}
          {spec.qty ? <Small muted>{spec.qty}{spec.unit ? ` ${spec.unit}` : ''}</Small> : null}
        </View>
      </Card>
    </Pressable>
  )
}
