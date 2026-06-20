/**
 * Designer Home (the studio). The 3-second answer for the architect: how many
 * selections + site changes need a call, how many are out for approval. Then the
 * NEEDS YOU feed — site changes to fold in, approved selections to release, and
 * returned ones to revise — plus what's out for approval and a brief shortcut.
 *
 * Wired to /api/v1/specs (derived routing_status) + /api/v1/site-changes.
 */
import { useCallback, useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../../src/auth/AuthContext'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { specsApi, type Spec } from '../../../src/api/specs'
import { siteChangesApi } from '../../../src/api/siteChanges'
import { supervisorApi } from '../../../src/api/supervisor'
import { Body, Button, Card, Display, Eyebrow, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, SiteChangeCard, StatTile } from './_components'

export default function DesignerHome() {
  const { me } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const insets = useSafeAreaInsets()

  const sitesQ = useQuery({ queryKey: ['architect', 'sites'], queryFn: () => supervisorApi.sites() })
  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sitesQ.data?.items ?? []) m.set(s.id, s.name)
    return m
  }, [sitesQ.data])

  // Shares the ['architect','specs'] key + shape ({spec, siteName}[]) with the
  // Selections screen — same key MUST mean same shape, or whichever renders
  // second crashes on the other's cached data.
  const specsQ = useQuery({
    queryKey: ['architect', 'specs'],
    enabled: (sitesQ.data?.items.length ?? 0) > 0,
    queryFn: async () => {
      const sites = sitesQ.data?.items ?? []
      const lists = await Promise.all(
        sites.map(async (s) => {
          const specs = await specsApi.list(s.id)
          return specs.map((sp) => ({ spec: sp, siteName: s.name }))
        }),
      )
      return lists.flat()
    },
  })
  const changesQ = useQuery({ queryKey: ['architect', 'changes'], queryFn: () => siteChangesApi.list() })

  useFocusEffect(
    useCallback(() => {
      void specsQ.refetch()
      void changesQ.refetch()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const release = useMutation({
    mutationFn: (id: string) => specsApi.release(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['architect', 'specs'] }),
  })

  const specRows = specsQ.data ?? []
  const returned = specRows.filter((r) => r.spec.routing_status === 'returned')
  const readyToRelease = specRows.filter((r) => r.spec.routing_status === 'approved')
  const outForApproval = specRows.filter((r) => r.spec.routing_status === 'out_for_approval')
  const released = specRows.filter((r) => r.spec.routing_status === 'released')
  const newChanges = (changesQ.data ?? []).filter((c) => c.status === 'new')
  const needsYou = returned.length + readyToRelease.length + newChanges.length

  const loading = sitesQ.isLoading || specsQ.isLoading || changesQ.isLoading
  const error = sitesQ.error || specsQ.error || changesQ.error
  const firstName = me?.name?.split(' ')[0] ?? 'there'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <View style={{ gap: SPACE.xs }}>
        <Eyebrow>STUDIO · {firstName.toUpperCase()}’S DESK</Eyebrow>
        <Display style={{ fontSize: 30, lineHeight: 38 }}>
          {needsYou} need you, {outForApproval.length} out for approval.
        </Display>
        <Body muted>
          {newChanges.length} site change{newChanges.length === 1 ? '' : 's'} to fold in ·{' '}
          {readyToRelease.length} ready to release.
        </Body>
      </View>

      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <StatTile value={needsYou} label="Needs you" tone={needsYou > 0 ? 'warn' : 'quiet'} />
        <StatTile value={outForApproval.length} label="Out for approval" />
        <StatTile value={released.length} label="Released" tone="ok" />
      </View>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock
          message="We could not load your studio."
          retryLabel="Try again"
          onRetry={() => {
            void specsQ.refetch()
            void changesQ.refetch()
          }}
        />
      ) : (
        <>
          {needsYou > 0 ? (
            <>
              <SectionLabel>Needs you</SectionLabel>
              <View style={{ gap: SPACE.md }}>
                {newChanges.map((c) => (
                  <SiteChangeCard
                    key={c.id}
                    change={c}
                    site={siteName.get(c.site_id) ?? 'Site'}
                    onPress={() => router.push(`/(contractor)/architect/change/${c.id}`)}
                  />
                ))}
                {readyToRelease.map((r) => (
                  <ReleaseCard
                    key={r.spec.id}
                    s={r.spec}
                    site={r.siteName}
                    pending={release.isPending}
                    onRelease={() => release.mutate(r.spec.id)}
                    onPress={() => router.push(`/(contractor)/architect/selection/${r.spec.id}`)}
                  />
                ))}
                {returned.map((r) => (
                  <ReturnedCard
                    key={r.spec.id}
                    s={r.spec}
                    site={r.siteName}
                    onPress={() => router.push(`/(contractor)/architect/selection/${r.spec.id}`)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Out for approval */}
          <Card style={{ gap: SPACE.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <Ionicons name="time-outline" size={18} color={theme.colors.textMute} />
              <Title style={{ fontSize: 16, flex: 1 }}>Out for approval</Title>
              <Pressable onPress={() => router.push('/(contractor)/architect/selections')} hitSlop={8}>
                <Small style={{ color: theme.colors.accentDeep }}>All selections</Small>
              </Pressable>
            </View>
            {outForApproval.length === 0 ? (
              <Small muted>Nothing waiting on owners right now.</Small>
            ) : (
              outForApproval.map((r) => (
                <Pressable
                  key={r.spec.id}
                  onPress={() => router.push(`/(contractor)/architect/selection/${r.spec.id}`)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.sm,
                    paddingTop: SPACE.sm,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.line,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>{r.spec.label}</Body>
                    <Small muted numberOfLines={1}>{r.siteName}</Small>
                  </View>
                  <StatusPill status="warn" size="sm" label="Awaiting" />
                </Pressable>
              ))
            )}
          </Card>

          {/* Brief shortcut */}
          <Pressable accessibilityRole="button" onPress={() => router.push('/(contractor)/architect/brief')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: theme.colors.secondaryContainer }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={18} color={theme.colors.secondary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Title style={{ fontSize: 14.5, color: theme.colors.secondary }}>Work from the homeowner brief</Title>
                <Small muted>Taste, themes &amp; room directions</Small>
              </View>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.secondary} />
            </Card>
          </Pressable>
        </>
      )}
    </ScrollView>
  )
}

function ReleaseCard({
  s,
  site,
  pending,
  onRelease,
  onPress,
}: {
  s: Spec
  site: string
  pending: boolean
  onRelease: () => void
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag="ok" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <Ionicons name="checkmark-circle" size={22} color={theme.colors.ok} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 14.5 }} numberOfLines={1}>Release {s.label}</Title>
          <Small muted numberOfLines={1}>{site} · approved</Small>
        </View>
        <Button title="Release" size="md" disabled={pending} onPress={onRelease} />
      </Card>
    </Pressable>
  )
}

function ReturnedCard({ s, site, onPress }: { s: Spec; site: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card flag="risk" style={{ gap: SPACE.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Title style={{ fontSize: 14.5, flex: 1 }} numberOfLines={1}>{s.label}</Title>
          <StatusPill status="risk" size="sm" label="Returned — revise" />
        </View>
        <Small muted numberOfLines={1}>{site}</Small>
      </Card>
    </Pressable>
  )
}
