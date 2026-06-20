/**
 * Design hub — the owner's per-site design direction (Calm Cockpit).
 * Lists the company's design profiles (one per site/scope) with status + room
 * count + a conflict flag, wired to the role-agnostic /api/v1/design profiler.
 */
import { useMemo } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../../src/theme/tokens'
import { design, profileStatusLabel, type ProfileDetail, type ProfileStatus } from '../../../src/api/ownerDesign'
import { owner } from '../../../src/api/owner'
import { Body, Card, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel } from './_components'
import { SubHeader } from './_audit.components'

export function statusTone(s: ProfileStatus): Status {
  if (s === 'approved' || s === 'locked' || s === 'materialized') return 'ok'
  if (s === 'needs_clarification') return 'warn'
  return 'info'
}

export default function DesignHub() {
  const { theme } = useTheme()
  const router = useRouter()

  const q = useQuery({
    queryKey: ['owner', 'design', 'hub'],
    queryFn: async () => {
      const [profiles, sites] = await Promise.all([design.profiles(), owner.sites()])
      const names = new Map(sites.items.map((s) => [s.id, s.name]))
      const details = await Promise.all(
        profiles.map((p) => design.profile(p.id).catch(() => null)),
      )
      return profiles.map((p, i) => ({
        profile: p,
        siteName: names.get(p.site_id) ?? 'Site',
        detail: details[i] as ProfileDetail | null,
      }))
    },
  })

  const rows = q.data ?? []
  const hasConflict = useMemo(
    () => (d: ProfileDetail | null) => !!d?.areas?.some((a) => a.has_conflict),
    [],
  )

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader title="Design briefs" sub="Per-site design direction" onBack={() => router.replace('/(contractor)/owner/brief')} />

      <View style={{ backgroundColor: AP.chip, borderRadius: theme.radii.hero, padding: SPACE.lg, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="color-palette" size={20} color={theme.colors.accentDeep} />
          <Title style={{ color: theme.colors.accentDeep }}>Design profiler</Title>
        </View>
        <Body muted>
          Each site builds a versioned design direction from the family's inspiration. The AI
          drafts palettes &amp; materials; you and the architect commit the call.
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
                <Pressable key={profile.id} accessibilityRole="button" onPress={() => router.push(`/(contractor)/owner/designsite/${profile.id}`)}>
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
