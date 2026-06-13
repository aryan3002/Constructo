/**
 * Design Profiler — intake hub. Rebuilt to faithfully match screen-profiler.jsx
 * prototype composition (Neev-2_owner / DPHub #05):
 *
 *   1. Progress card (green gradient) — ranked count, %, Add Inspiration + Design Chat
 *   2. Scope + Contributors row (2 mini cards)
 *   3. Category accordions (House Build / Interior / Elements) — area rows with
 *      confidence dot, check-icon, progress label, conflict flag, chevron
 *   4. "From the AI" list — Theme suggestions, conflicts, Brief preview
 *   5. "How this works" ghost button
 *
 * Real data: design.profileBySite → ProfilerProfileDetail (areas, contributors).
 * Membrane: homeowner ranks as my_contributor_id; owner/co_owner approve.
 * Visual-only (no engine yet): Design Chat (noted below).
 */
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { design, homeowner } from '../../../src/api/client'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Eyebrow,
  FadeInUp,
  FLOATING_NAV_CLEARANCE,
  ListRow,
  Micro,
  Screen,
  Small,
  StatusPill,
  SubHeader,
  useToast,
} from '../../../src/ui'
import {
  areaProgressLabel,
  confidenceBand,
  groupAreasByKind,
  PROFILER_STR,
} from '../../../src/homeowner/design_profiler.util'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Confidence pill — high=green, building=amber, low=grey (never red). */
function ConfPill({ confidence, size = 'md' }: { confidence: number; size?: 'sm' | 'md' }) {
  const { theme } = useTheme()
  const c = theme.colors
  const band = confidenceBand(confidence)
  const sm = size === 'sm'

  const bg =
    band.band === 'high'
      ? AP.chip
      : band.band === 'building'
        ? 'rgba(232,163,23,0.15)'
        : AP.surfaceContainer
  const fg =
    band.band === 'high' ? c.ok : band.band === 'building' ? c.warn : c.quiet

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: sm ? 24 : 28,
        paddingHorizontal: sm ? 9 : 11,
        borderRadius: theme.radii.pill,
        backgroundColor: bg,
      }}
    >
      <Feather
        name={band.icon as React.ComponentProps<typeof Feather>['name']}
        size={sm ? 12 : 13}
        color={fg}
      />
      <Micro style={{ color: fg, fontWeight: '600', fontSize: sm ? 11.5 : 12 }}>
        AI: {band.label}
      </Micro>
    </View>
  )
}

/** Segmented progress bar (not a ring, not a percentage). */
function DPProgressBar({ pct, tone }: { pct: number; tone: 'ok' | 'warn' }) {
  const { theme } = useTheme()
  const fill = tone === 'ok' ? theme.colors.ok : theme.colors.warn
  return (
    <View
      style={{
        height: 8,
        borderRadius: theme.radii.pill,
        backgroundColor: AP.surfaceContainer,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.min(100, pct)}%`,
          height: '100%',
          borderRadius: theme.radii.pill,
          backgroundColor: fill,
        }}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfilerHubScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const S = PROFILER_STR.en

  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ interior: true })

  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  const q = useQuery({
    queryKey: ['design', 'profiler', 'by-site', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })

  const areas = q.data?.areas ?? []
  const groups = groupAreasByKind(areas)
  const ranked = areas.reduce(
    (s, a) => s + (a.status === 'ready' ? a.recommended_count : 0),
    0,
  )
  const recTotal = areas.reduce((s, a) => s + a.recommended_count, 0)
  const pct = recTotal > 0 ? Math.round((ranked / recTotal) * 100) : 0

  const catIcon: Record<string, React.ComponentProps<typeof Feather>['name']> = {
    house_build: 'home',
    interior: 'image',
    element: 'layers',
  }

  // Overall confidence across all areas — use average
  const avgConfidence =
    areas.length > 0
      ? areas.reduce((s, a) => s + a.confidence, 0) / areas.length
      : 0

  const contributors = q.data?.contributors ?? []
  const hasConflicts = areas.some((a) => a.has_conflict)

  return (
    <Screen floatingNav style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}>
      <SubHeader
        title={S.intakeTitle}
        subtitle={S.intakeSub}
        onBack={() => router.back()}
      />

      {/* ── Loading / Error ─────────────────────────────────────────────── */}
      {(propQ.isLoading || q.isLoading) && (
        <Card padded>
          <Small muted>Loading design profile…</Small>
        </Card>
      )}
      {(q.isError || propQ.isError) && (
        <FadeInUp>
          <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
            <Eyebrow style={{ color: c.warn }}>Could not load</Eyebrow>
            <Body style={{ marginTop: 4 }}>{S.intakeError}</Body>
            <Button
              title="Try again"
              variant="secondary"
              size="md"
              onPress={() => void q.refetch()}
            />
          </Card>
        </FadeInUp>
      )}

      {/* ── Progress card ────────────────────────────────────────────────── */}
      {q.data && (
        <FadeInUp>
          <Card
            padded
            style={{
              backgroundColor: AP.chip + '40',
              borderColor: c.ok + '30',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm }}>
              <View style={{ flex: 1 }}>
                <Eyebrow style={{ color: c.ok }}>Design profile</Eyebrow>
                <BodyStrong style={{ marginTop: 4, fontSize: 17 }}>Building your brief</BodyStrong>
              </View>
              <ConfPill confidence={avgConfidence} />
            </View>
            <View style={{ marginTop: SPACE.md }}>
              <DPProgressBar pct={pct} tone={pct >= 80 ? 'ok' : 'warn'} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Small muted>{ranked} references ranked</Small>
              <Small style={{ fontWeight: '600', color: c.ok }}>{pct}% complete</Small>
            </View>
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
              <Button
                title="Add inspiration"
                variant="primary"
                size="md"
                leading={<Feather name="plus" size={16} color={c.onAccent} />}
                onPress={() =>
                  areas.length > 0
                    ? router.push({
                        pathname: '/(homeowner)/design/profiler/[area]',
                        params: {
                          area: areas[0].id,
                          pid: q.data!.id,
                          key: areas[0].area_key,
                        },
                      })
                    : toast('Set up your scope first.')
                }
                style={{ flex: 1 }}
              />
              <Button
                title="Design chat"
                variant="secondary"
                size="md"
                leading={<Feather name="message-circle" size={16} color={c.accentDeep} />}
                onPress={() =>
                  toast('Design chat is coming soon — not yet backed by the engine.')
                }
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </FadeInUp>
      )}

      {/* ── Scope + Contributors row ─────────────────────────────────────── */}
      {q.data && (
        <FadeInUp delay={20}>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              onPress={() => toast('Scope covers all the areas listed below.')}
            >
              <Card padded style={{ flex: 1 }}>
                <Small muted>Scope</Small>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Feather name="home" size={16} color={c.textMute} />
                  <Body style={{ fontWeight: '600', fontSize: 14 }}>
                    {q.data.scope_type === 'whole_house' ? 'Whole house' : q.data.scope_type}
                  </Body>
                </View>
              </Card>
            </Pressable>
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              onPress={() => router.push('/(homeowner)/members')}
            >
              <Card padded style={{ flex: 1 }}>
                <Small muted>Contributors</Small>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: 6 }}>
                  <Feather name="users" size={16} color={c.textMute} />
                  <Small muted>
                    {contributors.length > 0 ? `${contributors.length} members` : '+ invite'}
                  </Small>
                </View>
              </Card>
            </Pressable>
          </View>
        </FadeInUp>
      )}

      {/* ── Category accordions ─────────────────────────────────────────── */}
      {q.data && groups.length > 0 && (
        <FadeInUp delay={40}>
          <View style={{ gap: SPACE.sm }}>
            {groups.map((group) => {
              const readyCount = group.areas.filter((a) => a.status === 'ready').length
              const isOpen = !!openCats[group.kind]
              return (
                <Card key={group.kind} padded={false}>
                  {/* Accordion header */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setOpenCats((o) => ({ ...o, [group.kind]: !o[group.kind] }))
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACE.md,
                      padding: SPACE.lg,
                      backgroundColor: pressed ? AP.surfaceLow : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: theme.radii.chip,
                        backgroundColor: AP.surfaceContainer,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Feather
                        name={catIcon[group.kind] ?? 'layers'}
                        size={18}
                        color={c.textMute}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '600', fontSize: 15 }}>{group.label}</Body>
                      <Small muted style={{ marginTop: 1 }}>
                        {readyCount} of {group.areas.length} areas ready
                      </Small>
                    </View>
                    <Feather
                      name={isOpen ? 'chevron-down' : 'chevron-right'}
                      size={18}
                      color={c.textMute}
                    />
                  </Pressable>

                  {/* Area rows — shown when accordion is open */}
                  {isOpen ? (
                    <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm }}>
                      {group.areas.map((a) => {
                        const band = confidenceBand(a.confidence)
                        const dotColor =
                          band.band === 'high'
                            ? c.ok
                            : band.band === 'building'
                              ? c.warn
                              : c.quiet
                        const checkIcon: React.ComponentProps<typeof Feather>['name'] =
                          a.status === 'ready'
                            ? 'check-circle'
                            : a.status === 'in_progress'
                              ? 'circle'
                              : 'circle'
                        const checkColor =
                          a.status === 'ready'
                            ? c.ok
                            : a.status === 'in_progress'
                              ? c.warn
                              : c.quiet

                        return (
                          <Pressable
                            key={a.id}
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({
                                pathname: '/(homeowner)/design/profiler/[area]',
                                params: {
                                  area: a.id,
                                  pid: q.data!.id,
                                  key: a.area_key,
                                },
                              })
                            }
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: SPACE.sm + 2,
                              paddingVertical: 11,
                              borderTopWidth: 1,
                              borderTopColor: c.line,
                              backgroundColor: pressed ? AP.surfaceLow : 'transparent',
                            })}
                          >
                            <Feather name={checkIcon} size={18} color={checkColor} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Body style={{ fontSize: 14, fontWeight: '500' }}>
                                {a.area_key.replace(/_/g, ' ')}
                              </Body>
                              <Small muted style={{ marginTop: 1 }}>
                                {areaProgressLabel(0, a.recommended_count)}
                                {a.has_conflict ? ' · needs a decision' : ''}
                              </Small>
                            </View>
                            {a.has_conflict ? (
                              <Feather name="users" size={15} color={c.secondary} />
                            ) : null}
                            {/* AI confidence dot */}
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: dotColor,
                                flexShrink: 0,
                              }}
                            />
                            <Feather name="chevron-right" size={16} color={c.textMute} />
                          </Pressable>
                        )
                      })}
                    </View>
                  ) : null}
                </Card>
              )
            })}
          </View>
        </FadeInUp>
      )}

      {/* ── From the AI ─────────────────────────────────────────────────── */}
      {q.data && (
        <FadeInUp delay={60}>
          <Eyebrow style={{ color: c.textMute }}>FROM THE AI</Eyebrow>
          <Card padded={false}>
            <View style={{ paddingHorizontal: SPACE.lg }}>
              <ListRow
                icon="star"
                title="Theme suggestions"
                subtitle="Directions, with evidence"
                onPress={() => router.push('/(homeowner)/design/brief')}
                right={<Feather name="chevron-right" size={18} color={c.textMute} />}
              />
              {hasConflicts ? (
                <ListRow
                  icon="users"
                  title="Preferences differ"
                  subtitle="Resolve together"
                  onPress={() => router.push('/(homeowner)/design/brief')}
                  right={<Feather name="chevron-right" size={18} color={c.textMute} />}
                />
              ) : null}
              <ListRow
                icon="clipboard"
                title="Brief preview"
                subtitle="Whole-house design brief"
                onPress={() => router.push('/(homeowner)/design/brief')}
                right={<Feather name="chevron-right" size={18} color={c.textMute} />}
                last
              />
            </View>
          </Card>
        </FadeInUp>
      )}

      {/* ── How this works ──────────────────────────────────────────────── */}
      <FadeInUp delay={80}>
        <Button
          title="How this works & what it creates"
          variant="ghost"
          size="md"
          leading={<Feather name="info" size={16} color={c.accentDeep} />}
          onPress={() =>
            toast(
              'Add inspiration images, rank them 1–5, and the AI builds a structured brief your designer and contractor can work from.',
            )
          }
        />
      </FadeInUp>
    </Screen>
  )
}
