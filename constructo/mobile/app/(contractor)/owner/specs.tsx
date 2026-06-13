/**
 * Specs (Tab 4) — the cross-site material spec schedule (Calm Cockpit).
 * Aggregates /api/v1/specs across the owner's sites with a status filter.
 * Pending = "needs your decision" (amber), approved = cleared (sage),
 * rejected = on hold (red).
 */
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { request } from '../../../src/api/client'
import { owner } from '../../../src/api/owner'
import { Body, Card, H1, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock } from './_components'

type SpecApprovalStatus = 'pending' | 'approved' | 'rejected'

interface Spec {
  id: string
  site_id: string
  label: string
  qty: string | null
  unit: string | null
  approval_status: SpecApprovalStatus
  client_final_code: string | null
  notes: string | null
}

const STATUS_META: Record<SpecApprovalStatus, { status: Status; label: string }> = {
  pending: { status: 'warn', label: 'Needs decision' },
  approved: { status: 'ok', label: 'Approved' },
  rejected: { status: 'risk', label: 'On hold' },
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

export default function Specs() {
  const { theme } = useTheme()
  const [filter, setFilter] = useState<Filter>('all')

  // NB: distinct from the Brief's ['owner','specs','summary'] key — this query
  // returns {spec, siteName}[] whereas the Brief caches a raw Spec[]; sharing a
  // key would cross-feed the wrong shape and crash on r.spec.
  const q = useQuery({
    queryKey: ['owner', 'specs', 'schedule'],
    queryFn: async () => {
      const sites = (await owner.sites()).items
      const perSite = await Promise.all(
        sites.map(async (s) => {
          const specs = await request<Spec[]>(`/api/v1/specs?site_id=${s.id}`)
          return specs.map((sp) => ({ spec: sp, siteName: s.name }))
        }),
      )
      return perSite.flat()
    },
  })

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
      <View style={{ gap: 2 }}>
        <H1 style={{ fontSize: 24 }}>Material spec schedule</H1>
        <Small muted>{counts.all} line{counts.all === 1 ? '' : 's'} across your sites</Small>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
        {TABS.map((t) => {
          const on = filter === t.id
          return (
            <Small
              key={t.id}
              onPress={() => setFilter(t.id)}
              style={{
                overflow: 'hidden',
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: on ? theme.colors.accent : theme.colors.card,
                color: on ? theme.colors.onAccent : theme.colors.text,
                borderWidth: 1,
                borderColor: on ? theme.colors.accent : theme.colors.line,
              }}
            >
              {t.label}{t.n > 0 ? ` ${t.n}` : ''}
            </Small>
          )
        })}
      </ScrollView>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message="We could not load specs just now." retryLabel="Try again" onRetry={() => void q.refetch()} />
      ) : filtered.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No spec lines match this filter.</Small>
        </Card>
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {filtered.map(({ spec, siteName }) => {
            const meta = STATUS_META[spec.approval_status]
            return (
              <Card key={spec.id}>
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
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}
