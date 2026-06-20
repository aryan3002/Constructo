/**
 * DesignSite — one site's design profile (Calm Cockpit).
 *   - Status + scope header.
 *   - Rooms & areas (status + conflict flag).
 *   - Open conflicts with owner resolution (compromise / defer to architect).
 *   - Link to the full design brief (dp).
 */
import { Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import { design, profileStatusLabel, type Conflict } from '../../../../src/api/ownerDesign'
import { owner } from '../../../../src/api/owner'
import { Body, Button, Card, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel } from '../_components'
import { SubHeader } from '../_audit.components'
import { statusTone } from '../design'

const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export default function DesignSite() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['owner', 'design', 'site', id],
    queryFn: async () => {
      const [profile, conflicts, sites] = await Promise.all([
        design.profile(id),
        design.conflicts(id),
        owner.sites(),
      ])
      const siteName = sites.items.find((s) => s.id === profile.site_id)?.name ?? 'Design brief'
      return { profile, conflicts, siteName }
    },
    enabled: !!id,
  })

  const resolve = useMutation({
    mutationFn: ({ cid, resolution }: { cid: string; resolution: 'compromise' | 'defer_to_architect' }) =>
      design.resolveConflict(cid, resolution),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['owner', 'design', 'site', id] }),
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="We could not load this design brief." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const { profile, conflicts, siteName } = q.data
  const tone = statusTone(profile.status)
  const openConflicts = conflicts.filter((c) => c.resolution_status === 'open')

  return (
    <Pad>
      <SubHeader
        title={siteName}
        sub={cap(profile.scope_type)}
        onBack={() => router.replace('/(contractor)/owner/design')}
        right={<StatusPill status={tone} size="sm" label={profileStatusLabel(profile.status)} />}
      />

      <SectionLabel>{`Rooms & areas · ${profile.areas.length}`}</SectionLabel>
      <Card padded={false}>
        {profile.areas.length === 0 ? (
          <View style={{ padding: SPACE.lg }}><Small muted>No areas defined yet.</Small></View>
        ) : (
          profile.areas.map((a, i) => {
            const at: Status = a.has_conflict ? 'warn' : a.status === 'approved' ? 'ok' : 'info'
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg, borderTopWidth: i ? 1 : 0, borderTopColor: theme.colors.line }}>
                <Ionicons name={a.area_kind === 'interior' ? 'bed-outline' : a.area_kind === 'element' ? 'cube-outline' : 'home-outline'} size={18} color={theme.colors.textMute} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Title style={{ fontSize: 14.5 }} numberOfLines={1}>{cap(a.area_key)}</Title>
                  <Small muted>{cap(a.status)}</Small>
                </View>
                {a.has_conflict ? <StatusPill status="warn" size="sm" label="Conflict" /> : <StatusPill status={at} size="sm" />}
              </View>
            )
          })
        )}
      </Card>

      {openConflicts.length > 0 ? (
        <>
          <SectionLabel>{`Conflicts · ${openConflicts.length}`}</SectionLabel>
          <View style={{ gap: SPACE.md }}>
            {openConflicts.map((c) => (
              <ConflictCard key={c.id} c={c} pending={resolve.isPending} onResolve={(r) => resolve.mutate({ cid: c.id, resolution: r })} />
            ))}
          </View>
        </>
      ) : null}

      <Button title="View full design brief" variant="secondary" block onPress={() => router.push(`/(contractor)/owner/dp/${id}`)} />
    </Pad>
  )
}

function ConflictCard({ c, pending, onResolve }: { c: Conflict; pending: boolean; onResolve: (r: 'compromise' | 'defer_to_architect') => void }) {
  const { theme } = useTheme()
  return (
    <Card flag="warn">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusPill status="warn" size="sm" label={cap(c.dimension)} uppercase />
      </View>
      <Body style={{ marginTop: SPACE.sm }}>{c.value}</Body>
      <Small muted style={{ marginTop: 2 }}>Two contributors disagree on this — your call settles it.</Small>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
        <Button title="Compromise" size="md" disabled={pending} onPress={() => onResolve('compromise')} style={{ flex: 1 }} />
        <Button title="Defer to architect" variant="secondary" size="md" disabled={pending} onPress={() => onResolve('defer_to_architect')} style={{ flex: 1 }} />
      </View>
    </Card>
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
