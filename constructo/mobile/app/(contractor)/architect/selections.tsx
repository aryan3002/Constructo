/**
 * Selections — the designer's material/finish spec schedule. Aggregates
 * /api/v1/specs across the architect's sites with a status filter; tapping a line
 * opens its detail to route (approve / put on hold). Pending = "needs your
 * decision" (amber), approved = cleared (sage), rejected = on hold (red).
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { specsApi, type Spec, type SpecApprovalStatus } from '../../../src/api/specs'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, Chip, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader } from './_components'

const STATUS_META: Record<SpecApprovalStatus, { status: Status; label: string }> = {
  pending: { status: 'warn', label: 'Needs decision' },
  approved: { status: 'ok', label: 'Approved' },
  rejected: { status: 'risk', label: 'On hold' },
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

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
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0 }
    for (const r of rows) c[r.spec.approval_status] += 1
    return c
  }, [rows])
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.spec.approval_status === filter)

  const TABS: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'pending', label: 'Needs decision', n: counts.pending },
    { id: 'approved', label: 'Approved', n: counts.approved },
    { id: 'rejected', label: 'On hold', n: counts.rejected },
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
  const meta = STATUS_META[spec.approval_status]
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
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
