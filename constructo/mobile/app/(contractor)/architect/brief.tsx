/**
 * Brief — the designer's working brief: the homeowner design profiler. Lists the
 * company's design profiles (one per site) with status + area count + a conflict
 * flag, wired to the role-agnostic `/api/v1/design` engine. The architect is a
 * full edit-role on the profiler, so tapping in opens the site's areas/conflicts
 * and the AI-drafted theme directions to commit.
 */
import { useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../../src/theme/tokens'
import { design as designEngine } from '../../../src/api/client'
import { design, profileStatusLabel, type ProfileDetail, type ProfileStatus } from '../../../src/api/ownerDesign'
import { supervisorApi } from '../../../src/api/supervisor'
import { Body, Card, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, SubHeader } from './_components'

export function statusTone(s: ProfileStatus): Status {
  if (s === 'approved' || s === 'locked' || s === 'materialized') return 'ok'
  if (s === 'needs_clarification') return 'warn'
  return 'info'
}

export default function DesignerBrief() {
  const { theme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const q = useQuery({
    queryKey: ['architect', 'design', 'hub'],
    queryFn: async () => {
      const [profiles, sites] = await Promise.all([design.profiles(), supervisorApi.sites()])
      const names = new Map(sites.items.map((s) => [s.id, s.name]))
      const details = await Promise.all(profiles.map((p) => design.profile(p.id).catch(() => null)))
      return profiles.map((p, i) => ({
        profile: p,
        siteName: names.get(p.site_id) ?? 'Site',
        detail: details[i] as ProfileDetail | null,
      }))
    },
  })

  // Inbox badge — what waits on the designer right now. Best-effort: an error
  // (or a backend without the endpoint yet → 404) simply renders nothing.
  const inboxQ = useQuery({
    queryKey: ['design', 'inbox'],
    queryFn: () => designEngine.inboxSummary(),
    retry: false,
  })
  const inboxLabel = useMemo(() => {
    const s = inboxQ.data
    if (!s) return null
    const parts = [
      s.briefs_awaiting_signoff > 0 ? `${s.briefs_awaiting_signoff} waiting for sign-off` : null,
      s.answered_clarifications > 0 ? `${s.answered_clarifications} new answers` : null,
      s.deferred_conflicts > 0 ? `${s.deferred_conflicts} deferred to you` : null,
    ].filter((p): p is string => p !== null)
    return parts.length > 0 ? parts.join(' · ') : null
  }, [inboxQ.data])

  const rows = q.data ?? []
  const hasConflict = useMemo(() => (d: ProfileDetail | null) => !!d?.areas?.some((a) => a.has_conflict), [])

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Homeowner briefs" sub="Taste → themes → room directions" />

      {inboxLabel ? (
        <View style={{ flexDirection: 'row' }}>
          <StatusPill status="info" size="sm" label={inboxLabel} />
        </View>
      ) : null}

      <View style={{ backgroundColor: theme.colors.secondaryContainer, borderRadius: theme.radii.hero, padding: SPACE.lg, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="sparkles" size={20} color={theme.colors.secondary} />
          <Title style={{ color: theme.colors.secondary }}>Your working brief</Title>
        </View>
        <Body muted>
          The homeowner’s inspiration, rankings and AI interview — your full design brief to build
          selections from. The AI drafts palettes &amp; materials; you commit the call.
        </Body>
      </View>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock message="We could not load design briefs." retryLabel="Try again" onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Card variant="quiet">
          <Small muted>No design briefs yet. They appear here once a site starts its design intake.</Small>
        </Card>
      ) : (
        <>
          <SectionLabel>Active briefs</SectionLabel>
          <View style={{ gap: SPACE.md }}>
            {rows.map(({ profile, siteName, detail }) => {
              const tone = statusTone(profile.status)
              const rooms = detail?.areas?.length ?? 0
              const conflict = hasConflict(detail)
              return (
                <Pressable key={profile.id} accessibilityRole="button" onPress={() => router.push(`/(contractor)/architect/designsite/${profile.id}`)}>
                  <Card flag={conflict ? 'warn' : undefined}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <Title style={{ fontSize: 16, flex: 1 }} numberOfLines={1}>{siteName}</Title>
                      <StatusPill status={tone} size="sm" label={profileStatusLabel(profile.status)} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.sm }}>
                      <Meta icon="grid-outline" text={`${rooms} area${rooms === 1 ? '' : 's'}`} />
                      <Meta icon="albums-outline" text={profile.scope_type.replace('_', ' ')} />
                      {conflict ? <Meta icon="alert-circle" text="conflict" color={theme.colors.warn} /> : null}
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMute} style={{ marginLeft: 'auto' }} />
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>
        </>
      )}
    </ScrollView>
  )
}

function Meta({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  const { theme } = useTheme()
  const c = color ?? theme.colors.textMute
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icon} size={14} color={c} />
      <Small style={{ color: c, fontSize: 13, textTransform: 'capitalize' }}>{text}</Small>
    </View>
  )
}
