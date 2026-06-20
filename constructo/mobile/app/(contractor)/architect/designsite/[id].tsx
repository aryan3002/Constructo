/**
 * DesignSite — one site's design profile (designer view). Areas + open conflicts
 * the architect settles (keep one side / compromise), and a link to the full
 * brief. Wired to /api/v1/design; the architect is a full edit-role.
 */
import { Alert, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import { design, profileStatusLabel, type Conflict, type ConflictResolution } from '../../../../src/api/ownerDesign'
import { chatApi } from '../../../../src/api/chat'
import { supervisorApi } from '../../../../src/api/supervisor'
import { Body, Button, Card, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, SubHeader } from '../_components'
import { statusTone } from '../brief'

const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export default function DesignerSite() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['architect', 'design', 'site', id],
    queryFn: async () => {
      const [profile, conflicts, sites] = await Promise.all([
        design.profile(id),
        design.conflicts(id),
        supervisorApi.sites(),
      ])
      const siteName = sites.items.find((s) => s.id === profile.site_id)?.name ?? 'Design brief'
      return { profile, conflicts, siteName }
    },
    enabled: !!id,
  })

  const resolve = useMutation({
    mutationFn: ({ cid, resolution }: { cid: string; resolution: ConflictResolution }) =>
      design.resolveConflict(cid, resolution),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['architect', 'design', 'site', id] }),
  })

  // "Add inspiration" — the designer uploads a reference image to an area; it's
  // stored via the media path, then attached to the area where the vision
  // pipeline folds it into the taste model. Reuses chat media + /design/references.
  const addRef = useMutation({
    mutationFn: async (areaId: string) => {
      const siteId = q.data?.profile.site_id
      if (!siteId) throw new Error('not_ready')
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) throw new Error('perm')
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
      if (result.canceled || !result.assets[0]) throw new Error('canceled')
      const a = result.assets[0]
      const name = a.fileName ?? a.uri.split('/').pop() ?? 'reference.jpg'
      const up = await chatApi.uploadMedia(
        { siteId },
        { uri: a.uri, name, type: a.mimeType ?? 'image/jpeg' },
        'image',
      )
      return design.addReference({ area_id: areaId, image_r2_key: up.key })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['architect', 'design', 'site', id] })
      Alert.alert('✓', 'Inspiration added — it’ll shape this area’s design direction.')
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'canceled') return
      const msg =
        e instanceof Error && e.message === 'perm'
          ? 'Photo access is needed to add inspiration.'
          : 'Could not add the reference. Please try again.'
      Alert.alert('•', msg)
    },
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
        onBack={() => router.replace('/(contractor)/architect/brief')}
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
                <Pressable
                  onPress={() => addRef.mutate(a.id)}
                  disabled={addRef.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Add inspiration to ${cap(a.area_key)}`}
                  hitSlop={8}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.paper }}
                >
                  <Ionicons name="image-outline" size={17} color={theme.colors.accentDeep} />
                </Pressable>
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

      <Button title="Open full design brief" variant="secondary" block onPress={() => router.push(`/(contractor)/architect/dp/${id}`)} />
    </Pad>
  )
}

function ConflictCard({ c, pending, onResolve }: { c: Conflict; pending: boolean; onResolve: (r: ConflictResolution) => void }) {
  return (
    <Card flag="warn">
      <StatusPill status="warn" size="sm" label={cap(c.dimension)} uppercase />
      <Body style={{ marginTop: SPACE.sm }}>{c.value}</Body>
      <Small muted style={{ marginTop: 2 }}>Two contributors disagree — your design call settles it.</Small>
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
        <Button title="Keep A" variant="secondary" size="md" disabled={pending} onPress={() => onResolve('keep_a')} style={{ flex: 1 }} />
        <Button title="Keep B" variant="secondary" size="md" disabled={pending} onPress={() => onResolve('keep_b')} style={{ flex: 1 }} />
        <Button title="Compromise" size="md" disabled={pending} onPress={() => onResolve('compromise')} style={{ flex: 1 }} />
      </View>
    </Card>
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
