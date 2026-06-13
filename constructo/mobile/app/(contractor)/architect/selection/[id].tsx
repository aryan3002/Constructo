/**
 * Selection detail — one material/finish spec line. The architect routes it:
 * Approve (→ approved) or Put on hold (→ rejected), via POST /specs/{id}/approve
 * (architect is an approve-role). Determinism: a named human commits the status,
 * never the AI.
 */
import { Alert, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import { specsApi, type SpecApprovalStatus } from '../../../../src/api/specs'
import { supervisorApi } from '../../../../src/api/supervisor'
import { Body, Button, Card, Mono, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SubHeader } from '../_components'

const META: Record<SpecApprovalStatus, { status: Status; label: string }> = {
  pending: { status: 'warn', label: 'Needs decision' },
  approved: { status: 'ok', label: 'Approved' },
  rejected: { status: 'risk', label: 'On hold' },
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

  const decide = useMutation({
    mutationFn: (status: SpecApprovalStatus) => specsApi.approve(id, { status }),
    onSuccess: (_data, status) => {
      void qc.invalidateQueries({ queryKey: ['architect', 'spec', id] })
      void qc.invalidateQueries({ queryKey: ['architect', 'specs'] })
      Alert.alert('✓', status === 'approved' ? 'Selection approved.' : 'Selection put on hold.')
    },
    onError: () => Alert.alert('•', 'Could not update this selection. Please try again.'),
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="We could not load this selection." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const { spec, siteName } = q.data
  const meta = META[spec.approval_status]
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
        onBack={() => router.back()}
        right={<StatusPill status={meta.status} size="sm" label={meta.label} />}
      />

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

      {spec.notes ? (
        <Card style={{ gap: SPACE.xs }}>
          <Small muted style={{ letterSpacing: 1 }}>NOTES</Small>
          <Body>{spec.notes}</Body>
        </Card>
      ) : null}

      {spec.approval_status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Button title="Put on hold" variant="secondary" size="lg" disabled={decide.isPending} onPress={() => decide.mutate('rejected')} style={{ flex: 1 }} />
          <Button title="Approve" variant="accent" size="lg" disabled={decide.isPending} onPress={() => decide.mutate('approved')} style={{ flex: 1 }} />
        </View>
      ) : (
        <Card flag={meta.status} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name={spec.approval_status === 'approved' ? 'checkmark-circle' : 'pause-circle'} size={20} color={theme.colors[meta.status]} />
          <Body style={{ flex: 1 }}>
            {spec.approval_status === 'approved' ? 'Approved — ready to release to site.' : 'On hold — revise and re-route.'}
          </Body>
          <Button
            title="Reopen"
            variant="ghost"
            size="md"
            disabled={decide.isPending}
            onPress={() => decide.mutate('pending')}
          />
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
