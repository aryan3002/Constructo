/**
 * Selection detail — one material/finish spec, with its approval route. The
 * designer drives the lifecycle:
 *   draft → "Send for approval" (route)
 *   out_for_approval → awaiting (no action)
 *   approved → "Release to site" (release)
 *   returned → "Revise & re-send" (route again)
 * Wired to /api/v1/specs route/release. Determinism: a named human commits.
 */
import { Alert, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { specsApi, type RoutingStatus } from '../../../../src/api/specs'
import { supervisorApi } from '../../../../src/api/supervisor'
import { Body, Button, Card, Eyebrow, Mono, Small, StatusPill, Title } from '../../../../src/ui'
import { ApprovalRoute, ErrorBlock, LoadingBlock, ROUTING_META, SubHeader } from '../_components'

const PRIMARY: Record<RoutingStatus, { label: string; action: 'route' | 'release' | null }> = {
  draft: { label: 'Send for approval', action: 'route' },
  out_for_approval: { label: 'Awaiting approval', action: null },
  approved: { label: 'Release to site', action: 'release' },
  returned: { label: 'Revise & re-send', action: 'route' },
  released: { label: 'Released to site', action: null },
}

export default function SelectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['architect', 'spec', id],
    queryFn: async () => {
      const [spec, sites] = await Promise.all([specsApi.get(id), supervisorApi.sites()])
      const siteName = sites.items.find((s) => s.id === spec.site_id)?.name ?? 'Site'
      return { spec, siteName }
    },
    enabled: !!id,
  })

  const act = useMutation({
    mutationFn: (action: 'route' | 'release') =>
      action === 'route' ? specsApi.route(id) : specsApi.release(id),
    onSuccess: (_d, action) => {
      void qc.invalidateQueries({ queryKey: ['architect', 'spec', id] })
      void qc.invalidateQueries({ queryKey: ['architect', 'specs'] })
      Alert.alert('✓', action === 'release' ? 'Released to site.' : 'Sent for owner approval.')
    },
    onError: () => Alert.alert('•', 'Could not update this selection. Please try again.'),
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="We could not load this selection." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const { spec, siteName } = q.data
  const meta = ROUTING_META[spec.routing_status]
  const primary = PRIMARY[spec.routing_status]
  const rows: [string, string][] = [
    ['Project', siteName],
    ['Material', spec.label],
    ...(spec.client_final_code ? ([['Code', spec.client_final_code]] as [string, string][]) : []),
    ...(spec.qty ? ([['Quantity', `${spec.qty}${spec.unit ? ` ${spec.unit}` : ''}`]] as [string, string][]) : []),
  ]

  return (
    <Pad>
      <SubHeader
        title={spec.label}
        sub={siteName}
        onBack={() => router.replace('/(contractor)/architect/selections')}
        right={<StatusPill status={meta.status} size="sm" label={meta.label} />}
      />

      {/* Approval route */}
      <Card style={{ gap: SPACE.md }}>
        <Eyebrow>APPROVAL ROUTE</Eyebrow>
        <ApprovalRoute step={meta.step} />
      </Card>

      {spec.routing_status === 'returned' ? (
        <Card flag="risk" style={{ gap: SPACE.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Ionicons name="hand-left-outline" size={18} color={theme.colors.risk} />
            <Title style={{ fontSize: 14.5, color: theme.colors.risk }}>Returned by owner</Title>
          </View>
          <Body muted>{spec.notes ?? 'Revise the selection and re-send for approval.'}</Body>
        </Card>
      ) : null}

      {/* Specification */}
      <Card padded={false}>
        {rows.map(([k, v], i) => (
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
            <Small muted style={{ width: 88 }}>{k}</Small>
            {k === 'Code' ? (
              <Mono style={{ flex: 1, fontSize: 13 }}>{v}</Mono>
            ) : (
              <Body style={{ flex: 1 }}>{v}</Body>
            )}
          </View>
        ))}
      </Card>

      {primary.action ? (
        <Button
          title={primary.label}
          variant="accent"
          block
          size="lg"
          disabled={act.isPending}
          onPress={() => act.mutate(primary.action as 'route' | 'release')}
        />
      ) : (
        <Card flag={meta.status} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons
            name={spec.routing_status === 'released' ? 'checkmark-circle' : 'time-outline'}
            size={20}
            color={theme.colors[meta.status]}
          />
          <Body style={{ flex: 1 }}>
            {spec.routing_status === 'released'
              ? 'Released to site — the engineer can build to this.'
              : 'Out for owner approval — you’ll see it back here once decided.'}
          </Body>
        </Card>
      )}
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
