/**
 * Site-change detail — the designer reviews a condition reported from site. Shows
 * the report + the design impact, then links it to a revision or resolves it.
 * Wired to /api/v1/site-changes (PATCH status).
 */
import { Alert, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { siteChangesApi, type SiteChangeStatus } from '../../../../src/api/siteChanges'
import { supervisorApi } from '../../../../src/api/supervisor'
import { Body, Button, Card, Eyebrow, Small, StatusPill, Title } from '../../../../src/ui'
import { CHANGE_META, ErrorBlock, LoadingBlock, SubHeader, timeAgo } from '../_components'

export default function SiteChangeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['architect', 'change', id],
    queryFn: async () => {
      const [change, sites] = await Promise.all([siteChangesApi.get(id), supervisorApi.sites()])
      const siteName = sites.items.find((s) => s.id === change.site_id)?.name ?? 'Site'
      return { change, siteName }
    },
    enabled: !!id,
  })

  const act = useMutation({
    mutationFn: (status: SiteChangeStatus) => siteChangesApi.update(id, { status }),
    onSuccess: (_d, status) => {
      void qc.invalidateQueries({ queryKey: ['architect', 'change', id] })
      void qc.invalidateQueries({ queryKey: ['architect', 'changes'] })
      if (status === 'resolved') {
        Alert.alert('✓', 'Marked resolved and logged.')
        router.back()
      } else {
        Alert.alert('✓', 'Linked to a drawing revision.')
      }
    },
    onError: () => Alert.alert('•', 'Could not update this change. Please try again.'),
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="Could not load this site change." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const { change, siteName } = q.data
  const meta = CHANGE_META[change.status]

  return (
    <Pad>
      <SubHeader
        title="Site change"
        sub={`${siteName}${change.room ? ` · ${change.room}` : ''}`}
        onBack={() => router.back()}
        right={<StatusPill status={meta.status} size="sm" label={meta.label} />}
      />

      <Card style={{ gap: SPACE.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="warning-outline" size={15} color={theme.colors.warn} />
          <Small style={{ color: theme.colors.warn, fontSize: 12, letterSpacing: 0.5 }}>
            REPORTED FROM SITE
          </Small>
          <Small muted style={{ marginLeft: 'auto' }}>{timeAgo(change.created_at)}</Small>
        </View>
        <Title style={{ fontSize: 17 }}>{change.title}</Title>
        <Body muted>{change.note}</Body>
      </Card>

      {change.impact ? (
        <Card flag="warn" style={{ gap: SPACE.xs, backgroundColor: theme.colors.accentWarm }}>
          <Eyebrow style={{ color: theme.colors.warn }}>DESIGN IMPACT</Eyebrow>
          <Body>{change.impact}</Body>
        </Card>
      ) : null}

      {change.status === 'new' ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Button
            title="Link to revision"
            variant="secondary"
            size="lg"
            disabled={act.isPending}
            onPress={() => act.mutate('linked')}
            style={{ flex: 1 }}
          />
          <Button
            title="Resolve"
            variant="accent"
            size="lg"
            disabled={act.isPending}
            onPress={() => act.mutate('resolved')}
            style={{ flex: 1 }}
          />
        </View>
      ) : (
        <Card flag={meta.status} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors[meta.status]} />
          <Body style={{ flex: 1 }}>
            {change.status === 'linked' ? 'Folded into a drawing revision.' : 'Resolved and logged.'}
          </Body>
          {change.status === 'linked' ? (
            <Button title="Resolve" variant="ghost" size="md" disabled={act.isPending} onPress={() => act.mutate('resolved')} />
          ) : null}
        </Card>
      )}
    </Pad>
  )
}

function Pad({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      {children}
    </ScrollView>
  )
}
