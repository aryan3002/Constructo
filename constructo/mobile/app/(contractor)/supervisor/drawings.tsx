/**
 * Drawings — the latest released revisions for the engineer's assigned sites.
 * Always surface the current revision; a superseded sheet is shown last with a
 * "Superseded" pill (the detail screen warns "don't build from this").
 *
 * Backed by GET /api/v1/publish/drawings?site_id. The backend has no status
 * column — latest/superseded is derived client-side from the supersedes chain
 * ({@link withSupersession}).
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { drawingsApi, withSupersession, type DrawingKind, type DrawingView } from '../../../src/api/drawings'
import { supervisorApi } from '../../../src/api/supervisor'
import { Card, Chip, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader, formatWhen } from './_eng.components'

const TRADE_LABEL: Record<DrawingKind, string> = {
  plan: 'Plan',
  elevation: 'Elevation',
  section: 'Section',
  structural: 'Structure',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  other: 'Other',
}

export default function EngDrawings() {
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [siteId, setSiteId] = useState<string | null>(null)
  const [trade, setTrade] = useState<DrawingKind | 'all'>('all')

  const sitesQ = useQuery({ queryKey: ['eng', 'sites'], queryFn: () => supervisorApi.sites() })
  const sites = sitesQ.data?.items ?? []
  const active = siteId ?? sites[0]?.id ?? null

  const drawingsQ = useQuery({
    queryKey: ['eng', 'drawings', active],
    enabled: !!active,
    queryFn: () => drawingsApi.list(active as string),
  })

  const rows = useMemo(() => withSupersession(drawingsQ.data ?? []), [drawingsQ.data])
  const trades = useMemo<(DrawingKind | 'all')[]>(
    () => ['all', ...Array.from(new Set(rows.map((d) => d.kind)))],
    [rows],
  )
  const visible = (trade === 'all' ? rows : rows.filter((d) => d.kind === trade))
    .slice()
    .sort((a, b) => (a.superseded ? 1 : 0) - (b.superseded ? 1 : 0))

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.md }}
    >
      <SubHeader title="Drawings" sub="Latest released for your sites" onBack={() => router.replace('/(contractor)/supervisor/more')} />

      {/* site chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
        {sites.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            icon="home"
            active={active === s.id}
            onPress={() => {
              setSiteId(s.id)
              setTrade('all')
            }}
          />
        ))}
      </ScrollView>

      {/* trade chips */}
      {trades.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
          {trades.map((t) => (
            <Chip
              key={t}
              label={t === 'all' ? 'All trades' : TRADE_LABEL[t]}
              active={trade === t}
              onPress={() => setTrade(t)}
            />
          ))}
        </ScrollView>
      ) : null}

      {drawingsQ.isLoading ? (
        <LoadingBlock />
      ) : drawingsQ.error ? (
        <ErrorBlock message="Could not load drawings." retryLabel="Try again" onRetry={() => void drawingsQ.refetch()} />
      ) : visible.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No released drawings for this site yet.</Small>
        </Card>
      ) : (
        visible.map((d) => (
          <DrawingRow
            key={d.id}
            d={d}
            onPress={() =>
              router.push({
                pathname: '/(contractor)/supervisor/drawing/[id]',
                params: { id: d.id, site: d.site_id },
              })
            }
          />
        ))
      )}
    </ScrollView>
  )
}

function DrawingRow({ d, onPress }: { d: DrawingView; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, opacity: d.superseded ? 0.74 : 1 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            backgroundColor: theme.colors.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="document-text-outline" size={19} color={d.superseded ? theme.colors.textMute : theme.colors.info} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Title style={{ fontSize: 15 }} numberOfLines={1}>{d.title}</Title>
            <Mono style={{ fontSize: 12, color: theme.colors.textMute }}>Rev {d.version}</Mono>
          </View>
          <Small muted numberOfLines={1}>
            {TRADE_LABEL[d.kind]} · {formatWhen(d.published_at)}
          </Small>
        </View>
        <StatusPill
          status={d.superseded ? 'quiet' : 'ok'}
          size="sm"
          label={d.superseded ? 'Superseded' : 'Latest'}
        />
      </Card>
    </Pressable>
  )
}
