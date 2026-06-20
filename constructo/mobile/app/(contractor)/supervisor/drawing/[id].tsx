/**
 * Drawing detail — one released sheet. If it's been superseded we lead with a
 * loud "don't build from this" warning + a jump to the latest revision, then the
 * sheet preview + details. Pulls the site's drawings (passed `site` param) and
 * resolves latest/superseded from the chain.
 */
import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { drawingsApi, withSupersession, type DrawingKind } from '../../../../src/api/drawings'
import { Body, Button, Card, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader, formatWhen } from '../_eng.components'

const TRADE_LABEL: Record<DrawingKind, string> = {
  plan: 'Plan',
  elevation: 'Elevation',
  section: 'Section',
  structural: 'Structure',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  other: 'Other',
}

export default function DrawingDetail() {
  const { id, site } = useLocalSearchParams<{ id: string; site: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const q = useQuery({
    queryKey: ['eng', 'drawings', site],
    enabled: !!site,
    queryFn: () => drawingsApi.list(site),
  })

  const rows = useMemo(() => withSupersession(q.data ?? []), [q.data])
  const d = rows.find((x) => x.id === id)

  if (q.isLoading) {
    return <Pad><LoadingBlock /></Pad>
  }
  if (q.error || !d) {
    return (
      <Pad>
        <ErrorBlock message="Could not load this drawing." retryLabel="Try again" onRetry={() => void q.refetch()} />
      </Pad>
    )
  }

  const detail: [string, string][] = [
    ['Trade', TRADE_LABEL[d.kind]],
    ['Revision', `Rev ${d.version}`],
    ['Released', formatWhen(d.published_at)],
    ['Status', d.superseded ? `Superseded by Rev ${d.latest.version}` : 'Released to site'],
  ]

  return (
    <Pad>
      <SubHeader
        title={d.title}
        sub={`Rev ${d.version}`}
        onBack={() => router.back()}
        right={<StatusPill status={d.superseded ? 'quiet' : 'ok'} size="sm" label={d.superseded ? 'Superseded' : 'Latest'} />}
      />

      {d.superseded ? (
        <Card flag="warn" style={{ gap: SPACE.md, backgroundColor: theme.colors.accentWarm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Ionicons name="warning" size={20} color={theme.colors.warn} />
            <View style={{ flex: 1 }}>
              <Title style={{ fontSize: 15, color: theme.colors.warn }}>Don’t build from this</Title>
              <Small muted>Rev {d.version} was replaced by Rev {d.latest.version}.</Small>
            </View>
          </View>
          <Button
            title={`Open latest (Rev ${d.latest.version})`}
            variant="secondary"
            size="md"
            onPress={() =>
              router.replace({
                pathname: '/(contractor)/supervisor/drawing/[id]',
                params: { id: d.latest.id, site: d.site_id },
              })
            }
          />
        </Card>
      ) : null}

      {/* Sheet preview placeholder (the file_url opens externally; no inline
          PDF render in the app shell yet). */}
      <Card
        style={{
          height: 200,
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          backgroundColor: theme.colors.paper,
        }}
      >
        <Ionicons name="document-text-outline" size={34} color={theme.colors.textMute} />
        <Small muted>
          {d.title} · Rev {d.version}
        </Small>
      </Card>

      {d.change_note ? (
        <Card style={{ gap: SPACE.xs }}>
          <Small muted style={{ letterSpacing: 1 }}>
            WHAT CHANGED
          </Small>
          <Body>{d.change_note}</Body>
        </Card>
      ) : null}

      <Card padded={false}>
        {detail.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              gap: SPACE.md,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: theme.colors.line,
            }}
          >
            <Small muted style={{ width: 92 }}>
              {k}
            </Small>
            <Body style={{ flex: 1, color: d.superseded && k === 'Status' ? theme.colors.warn : theme.colors.text }}>
              {v}
            </Body>
          </View>
        ))}
      </Card>
    </Pad>
  )
}

function Pad({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      {children}
    </ScrollView>
  )
}
