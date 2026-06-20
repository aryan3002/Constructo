/**
 * Site-change detail — the designer reviews a condition reported from site. Shows
 * the report + the design impact, then links it to a revision or resolves it.
 * Wired to /api/v1/site-changes (PATCH status).
 */
import { Alert, Image, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { siteChangesApi, type SiteChangeStatus } from '../../../../src/api/siteChanges'
import { supervisorApi } from '../../../../src/api/supervisor'
import { uploadDrawing } from '../../../../src/api/drawings'
import { Body, Button, Card, Eyebrow, Small, StatusPill, Title } from '../../../../src/ui'
import { CHANGE_META, ErrorBlock, isHttpUrl, LoadingBlock, SubHeader, timeAgo } from '../_components'

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
        router.replace('/(contractor)/architect/changes')
      } else {
        Alert.alert('✓', 'Linked to a drawing revision.')
      }
    },
    onError: () => Alert.alert('•', 'Could not update this change. Please try again.'),
  })

  // "Upload revision" — the designer answers a site change by publishing a
  // revised sheet: pick a file → upload to R2 → create the drawing → link it to
  // this change (which flips its status to "linked"). Makes the old hollow
  // "link to revision" action real.
  const uploadRevision = useMutation({
    mutationFn: async () => {
      const change = q.data?.change
      if (!change) throw new Error('not_ready')
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) throw new Error('perm')
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
      if (result.canceled || !result.assets[0]) throw new Error('canceled')
      const a = result.assets[0]
      const name = a.fileName ?? a.uri.split('/').pop() ?? 'revision.jpg'
      const drawing = await uploadDrawing({
        siteId: change.site_id,
        file: { uri: a.uri, name, contentType: a.mimeType ?? 'image/jpeg' },
        title: change.title,
        version: 'Rev 1',
        kind: 'plan',
        changeNote: change.note,
      })
      return siteChangesApi.update(id, { linked_drawing_id: drawing.id })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['architect', 'change', id] })
      void qc.invalidateQueries({ queryKey: ['architect', 'changes'] })
      Alert.alert('✓', 'Revised drawing uploaded and linked.')
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'canceled') return
      const msg =
        e instanceof Error && e.message === 'uploads_unavailable'
          ? 'Drawing upload needs cloud storage — it’s not available on this server.'
          : e instanceof Error && e.message === 'perm'
            ? 'Photo access is needed to attach a revision.'
            : 'Could not upload the revision. Please try again.'
      Alert.alert('•', msg)
    },
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
        onBack={() => router.replace('/(contractor)/architect/changes')}
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
        {isHttpUrl(change.photo_url) ? (
          <Image
            source={{ uri: change.photo_url }}
            style={{ width: '100%', height: 200, borderRadius: theme.radii.chip, backgroundColor: theme.colors.paper }}
            resizeMode="cover"
          />
        ) : null}
        {change.reported_by_name ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="person-circle-outline" size={16} color={theme.colors.textMute} />
            <Small muted>Flagged by {change.reported_by_name}</Small>
          </View>
        ) : null}
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
            title={uploadRevision.isPending ? 'Uploading…' : 'Upload revision'}
            variant="secondary"
            size="lg"
            disabled={act.isPending || uploadRevision.isPending}
            onPress={() => uploadRevision.mutate()}
            style={{ flex: 1 }}
          />
          <Button
            title="Resolve"
            variant="accent"
            size="lg"
            disabled={act.isPending || uploadRevision.isPending}
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
