/**
 * Design Profiler — brief review + approval screen. Rebuilt to faithfully match
 * screen-profiler-brief.jsx prototype composition (Neev-2_owner):
 *
 *   1. SubHeader "Whole-house design brief" + version subtitle
 *   2. 3-audience SegmentedTabs: You | Designer-ready | Contractor-ready
 *
 *   "You" tab (homeowner view):
 *     - Overall direction card (green gradient)
 *     - Colour palette swatches (if present)
 *     - Material palette (image tiles)
 *     - Rooms list → each with StatusPill + chevron → area brief
 *     - Do / Don't columns
 *     - Submit for designer review button
 *
 *   "Designer-ready" tab:
 *     - Design intent card
 *     - Room-wise priorities
 *     - Open design questions
 *     - AI confidence note
 *
 *   "Contractor-ready" tab:
 *     - Finish expectations
 *     - Material families
 *     - Pending homeowner approvals note
 *
 *   Approval actions: Approve / Request changes (gated: can_approve;
 *     403 approve_forbidden → show "Only an owner can approve. You can comment.")
 *
 * Real data:
 *   - design.profileBySite → pid
 *   - design.brief(pid, audience) → ProfilerBriefRendering
 *   - design.actOnBrief(briefId, { action }) → approval
 *   - design.approvals(briefId) → version history
 *
 * Visual-only (no engine): colour palette swatches built from brief content;
 *   room list built from areas; "Contractor-ready" material families are
 *   engine-driven when content_json supplies them.
 *
 * Membrane: owner/co_owner → can_approve; others see "You can comment."
 */
import { useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ApiError, design, homeowner } from '../../../src/api/client'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../src/theme/tokens'
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Eyebrow,
  FadeInUp,
  FLOATING_NAV_CLEARANCE,
  ListRow,
  Micro,
  Screen,
  SegmentedTabs,
  Small,
  StatusPill,
  SubHeader,
  useToast,
} from '../../../src/ui'
import {
  briefAudienceTabs,
  PROFILER_STR,
} from '../../../src/homeowner/design_profiler.util'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Aud = 'homeowner' | 'architect' | 'contractor'

// ---------------------------------------------------------------------------
// Colour palette swatch
// ---------------------------------------------------------------------------

function PaletteSwatch({ colors }: { colors: string[] }) {
  const { theme } = useTheme()
  if (!colors.length) return null
  return (
    <View
      style={{
        height: 34,
        flexDirection: 'row',
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.line,
      }}
    >
      {colors.map((col, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: col }} />
      ))}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Material tile (image placeholder)
// ---------------------------------------------------------------------------

function MaterialTile({ label }: { label: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View
        style={{
          width: '100%',
          height: 56,
          borderRadius: 10,
          backgroundColor: AP.surfaceContainer,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.line,
        }}
      >
        <Feather name="layers" size={18} color={c.textMute} />
      </View>
      <Micro muted style={{ marginTop: 5, textAlign: 'center', fontSize: 11 }}>
        {label}
      </Micro>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Approval timeline item
// ---------------------------------------------------------------------------

function TimelineItem({
  title,
  date,
  done,
  now,
  last,
}: {
  title: string
  date: string
  done: boolean
  now?: boolean
  last?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const iconName: React.ComponentProps<typeof Feather>['name'] = done
    ? 'check-circle'
    : now
      ? 'circle'
      : 'circle'
  const iconColor = done ? c.ok : now ? c.secondary : c.quiet

  return (
    <View style={{ flexDirection: 'row', gap: SPACE.md }}>
      <View style={{ alignItems: 'center' }}>
        <Feather name={iconName} size={20} color={iconColor} />
        {!last ? (
          <View
            style={{
              width: 2,
              flex: 1,
              minHeight: 18,
              backgroundColor: done ? c.ok : AP.surfaceContainer,
              marginVertical: 2,
            }}
          />
        ) : null}
      </View>
      <View style={{ paddingBottom: 14 }}>
        <Body
          style={{
            fontSize: 14,
            fontWeight: '500',
            color: done || now ? c.text : c.textMute,
          }}
        >
          {title}
        </Body>
        <Small muted style={{ marginTop: 1 }}>
          {date}
        </Small>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const BRIEF_STATE_LABEL: Record<string, string> = {
  homeowner_review: 'your review',
  revision_requested: 'changes requested',
  architect_review: 'with your designer',
  contractor_brief_ready: 'ready to approve',
  approved: 'approved',
  locked: 'locked',
}

export default function BriefScreen() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const S = PROFILER_STR.en
  const [aud, setAud] = useState<Aud>('homeowner')

  const propQ = useQuery({
    queryKey: ['homeowner', 'property'],
    queryFn: () => homeowner.property(),
  })
  const siteId = propQ.data?.site_id

  const profileQ = useQuery({
    queryKey: ['design', 'profiler', 'brief-profile', siteId],
    queryFn: () => design.profileBySite(siteId as string),
    enabled: !!siteId,
    retry: false,
  })
  const pid = profileQ.data?.id

  const capQ = useQuery({
    queryKey: ['homeowner', 'capabilities'],
    queryFn: () => homeowner.capabilities(),
  })

  const briefQ = useQuery({
    queryKey: ['design', 'profiler', 'brief', pid, aud],
    queryFn: () => design.brief(pid as string, aud),
    enabled: !!pid,
    retry: false,
  })
  const briefId = briefQ.data?.brief_id ?? null

  const approvalsQ = useQuery({
    queryKey: ['design', 'profiler', 'approvals', briefId],
    queryFn: () => design.approvals(briefId as string),
    enabled: !!briefId,
  })

  const actMut = useMutation({
    mutationFn: (action: string) =>
      design.actOnBrief(briefId as string, { action }),
    onSuccess: () => {
      toast('Done', 'check')
      void qc.invalidateQueries({ queryKey: ['design', 'profiler'] })
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'approve_forbidden') {
        toast(S.onlyOwnerCanApprove)
      } else if (e instanceof ApiError && e.code === 'invalid_transition') {
        toast("This brief isn't ready for that step yet.")
      } else {
        toast((e as Error).message)
      }
    },
  })

  const canApprove = capQ.data?.can_approve ?? false
  // The homeowner can only "approve" once the brief is contractor-ready (after
  // designer sign-off). In review states their action is send-to-designer /
  // request-changes — showing Approve there always 409s.
  const briefState = briefQ.data?.state ?? null
  const canApproveNow = briefState === 'contractor_brief_ready'

  // Parse content_json from the brief
  const content = briefQ.data?.content_json as
    | {
        narrative?: { headline?: string; summary?: string }
        overall_direction?: string
        palette?: string[]
        materials?: string[]
        areas?: {
          area_key: string
          material_families: string[]
          themes: { name: string; confidence?: number }[]
          status?: string
        }[]
        do?: string[]
        dont?: string[]
        design_intent?: string
        room_priorities?: string[]
        open_questions?: string[]
        finish_expectations?: string[]
        material_families?: string[]
        procurement?: string[]
      }
    | undefined

  const overallDirection =
    content?.narrative?.headline ?? content?.overall_direction ?? null
  const overallSummary = content?.narrative?.summary ?? null
  const palette = content?.palette ?? []
  const materials = content?.materials ?? []
  const areas = content?.areas ?? profileQ.data?.areas?.map((a) => ({
    area_key: a.area_key,
    material_families: [],
    themes: [],
    status: a.status,
  })) ?? []
  const doList = content?.do ?? []
  const dontList = content?.dont ?? []

  // Designer content
  const designIntent = content?.design_intent ?? overallSummary ?? null
  const roomPriorities: string[] = content?.room_priorities ?? []
  const openQuestions: string[] = content?.open_questions ?? []

  // Contractor content
  const finishExpectations: string[] = content?.finish_expectations ?? []
  const materialFamilies: string[] = content?.material_families ?? materials

  // Version history from approvals
  const approvals = approvalsQ.data ?? []

  // Audience tabs (protocol: You | Designer | Contractor)
  const audTabs = briefAudienceTabs('en')

  // Upstream failures
  if (propQ.isError || profileQ.isError) {
    return (
      <Screen floatingNav padded style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}>
        <SubHeader title={S.briefTitle} onBack={() => router.back()} />
        <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
          <Small muted>{S.noBriefYet}</Small>
        </Card>
      </Screen>
    )
  }

  if (briefQ.isError) {
    const err = briefQ.error
    const code = err instanceof ApiError ? err.code : undefined
    const msg =
      code === 'brief_not_shared' || code === 'audience_forbidden'
        ? S.notSharedYet
        : S.noBriefYet
    return (
      <Screen floatingNav padded style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }}>
        <SubHeader title={S.briefTitle} onBack={() => router.back()} />
        <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
          <Small muted>{msg}</Small>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen floatingNav style={{ paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE }} padded={false}>
      {/* SubHeader with version chip */}
      <SubHeader
        title="Whole-house design brief"
        subtitle={
          briefQ.data
            ? `v${briefQ.data.version ?? 1} · ${BRIEF_STATE_LABEL[briefQ.data.state ?? ''] ?? 'in progress'}`
            : 'Loading…'
        }
        onBack={() => router.back()}
        right={
          briefId ? (
            <Button
              title="History"
              variant="ghost"
              size="md"
              leading={<Feather name="clock" size={16} color={c.accentDeep} />}
              onPress={() => toast('Approval history shown below in this screen.')}
            />
          ) : undefined
        }
      />

      <View style={{ padding: SPACE.lg, gap: SPACE.lg }}>
        {/* 3-audience SegmentedTabs */}
        <SegmentedTabs
          tabs={audTabs}
          active={aud}
          onChange={(k) => setAud(k as Aud)}
          style={{ paddingHorizontal: 0 }}
        />

        {/* Loading */}
        {(propQ.isLoading || profileQ.isLoading || briefQ.isLoading) ? (
          <Card padded>
            <Small muted>Loading your brief…</Small>
          </Card>
        ) : null}

        {/* ── Tab: You (homeowner view) ──────────────────────────────── */}
        {aud === 'homeowner' && !briefQ.isLoading ? (
          <FadeInUp>
            <View style={{ gap: SPACE.md }}>
              {/* Overall direction card */}
              <Card
                padded
                style={{
                  backgroundColor: AP.chip + '40',
                  borderColor: c.ok + '30',
                }}
              >
                <Eyebrow style={{ color: c.ok }}>Overall direction</Eyebrow>
                {overallDirection ? (
                  <>
                    <BodyStrong style={{ fontSize: 21, marginTop: 4 }}>
                      {overallDirection}
                    </BodyStrong>
                    {overallSummary ? (
                      <Small muted style={{ marginTop: 8 }}>
                        {overallSummary}
                      </Small>
                    ) : null}
                  </>
                ) : (
                  <Small muted style={{ marginTop: 4 }}>
                    {S.noBriefYet}
                  </Small>
                )}
              </Card>

              {/* Colour palette */}
              {palette.length > 0 ? (
                <View style={{ gap: SPACE.sm }}>
                  <Eyebrow style={{ color: c.textMute }}>COLOUR PALETTE</Eyebrow>
                  <PaletteSwatch colors={palette} />
                </View>
              ) : null}

              {/* Material palette */}
              {materials.length > 0 ? (
                <View style={{ gap: SPACE.sm }}>
                  <Eyebrow style={{ color: c.textMute }}>MATERIAL PALETTE</Eyebrow>
                  <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    {materials.slice(0, 4).map((m) => (
                      <MaterialTile key={m} label={m} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Rooms */}
              {areas.length > 0 ? (
                <View style={{ gap: SPACE.sm }}>
                  <Eyebrow style={{ color: c.textMute }}>ROOMS</Eyebrow>
                  <Card padded={false}>
                    <View style={{ paddingHorizontal: SPACE.lg }}>
                      {areas.map((a, i) => {
                        const status = a.status ?? (a.themes.length > 0 ? 'ready' : 'not_started')
                        const pillStatus =
                          status === 'ready' ? 'ok' : status === 'in_progress' ? 'warn' : 'quiet'
                        const pillLabel =
                          status === 'ready'
                            ? 'Approved'
                            : status === 'in_progress'
                              ? 'Needs input'
                              : 'Not started'
                        return (
                          <ListRow
                            key={a.area_key}
                            title={a.area_key.replace(/_/g, ' ')}
                            onPress={() => {
                              // Navigate to area detail if pid is available
                              const areaDetail = profileQ.data?.areas?.find(
                                (pa) => pa.area_key === a.area_key,
                              )
                              if (areaDetail && pid) {
                                router.push({
                                  pathname: '/(homeowner)/design/profiler/[area]',
                                  params: {
                                    area: areaDetail.id,
                                    pid,
                                    key: areaDetail.area_key,
                                  },
                                })
                              }
                            }}
                            last={i === areas.length - 1}
                            right={
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                                <StatusPill
                                  status={pillStatus}
                                  size="sm"
                                  label={pillLabel}
                                />
                                <Feather name="chevron-right" size={16} color={c.textMute} />
                              </View>
                            }
                          />
                        )
                      })}
                    </View>
                  </Card>
                </View>
              ) : null}

              {/* Do / Don't columns */}
              {(doList.length > 0 || dontList.length > 0) ? (
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  {doList.length > 0 ? (
                    <Card padded style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Feather name="check-circle" size={15} color={c.ok} />
                        <BodyStrong style={{ fontSize: 13, color: c.ok }}>Do</BodyStrong>
                      </View>
                      {doList.map((d) => (
                        <Small key={d} muted style={{ paddingVertical: 2 }}>
                          · {d}
                        </Small>
                      ))}
                    </Card>
                  ) : null}
                  {dontList.length > 0 ? (
                    <Card padded style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Feather name="eye-off" size={15} color={c.risk} />
                        <BodyStrong style={{ fontSize: 13, color: c.risk }}>Don't</BodyStrong>
                      </View>
                      {dontList.map((d) => (
                        <Small key={d} muted style={{ paddingVertical: 2 }}>
                          · {d}
                        </Small>
                      ))}
                    </Card>
                  ) : null}
                </View>
              ) : null}

              {/* Approval actions */}
              {briefId ? (
                canApprove ? (
                  <Button
                    title="Submit for designer review"
                    variant="primary"
                    size="md"
                    loading={actMut.isPending}
                    leading={<Feather name="send" size={16} color={c.onAccent} />}
                    onPress={() => actMut.mutate('send_to_architect')}
                  />
                ) : (
                  <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
                    <Small muted>{S.onlyOwnerCanApprove}</Small>
                  </Card>
                )
              ) : null}
            </View>
          </FadeInUp>
        ) : null}

        {/* ── Tab: Designer-ready ─────────────────────────────────────── */}
        {aud === 'architect' && !briefQ.isLoading ? (
          <FadeInUp>
            <View style={{ gap: SPACE.md }}>
              {/* Design intent */}
              <Card padded>
                <Eyebrow style={{ color: c.textMute, marginBottom: 6 }}>Design intent</Eyebrow>
                {designIntent ? (
                  <Small style={{ color: c.text }}>
                    {designIntent}
                  </Small>
                ) : (
                  <Small muted>
                    {overallDirection ?? S.noBriefYet}
                  </Small>
                )}
              </Card>

              {/* Room-wise priorities */}
              {(roomPriorities.length > 0 || areas.length > 0) ? (
                <Card padded>
                  <Eyebrow style={{ color: c.textMute, marginBottom: 8 }}>
                    Room-wise priorities
                  </Eyebrow>
                  {(roomPriorities.length > 0 ? roomPriorities : areas.map(
                    (a) =>
                      `${a.area_key.replace(/_/g, ' ')}: ${a.themes[0]?.name ?? 'Direction pending'}`,
                  )).map((x, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: c.textMute,
                          marginTop: 8,
                          flexShrink: 0,
                        }}
                      />
                      <Small style={{ color: c.text, flex: 1 }}>{x}</Small>
                    </View>
                  ))}
                </Card>
              ) : null}

              {/* Open design questions */}
              {openQuestions.length > 0 ? (
                <Card padded>
                  <Eyebrow style={{ color: c.textMute, marginBottom: 8 }}>
                    Open design questions
                  </Eyebrow>
                  {openQuestions.map((x, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: c.textMute,
                          marginTop: 8,
                          flexShrink: 0,
                        }}
                      />
                      <Small style={{ color: c.text, flex: 1 }}>{x}</Small>
                    </View>
                  ))}
                </Card>
              ) : null}

              {/* AI confidence note */}
              <Card padded style={{ backgroundColor: AP.chip + '40', borderColor: c.ok + '30' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="star" size={16} color={c.ok} />
                  <Small style={{ color: c.ok, fontWeight: '600', flex: 1 }}>
                    AI confidence: based on your references across all areas — evidence available per room.
                  </Small>
                </View>
              </Card>
            </View>
          </FadeInUp>
        ) : null}

        {/* ── Tab: Contractor-ready ───────────────────────────────────── */}
        {aud === 'contractor' && !briefQ.isLoading ? (
          <FadeInUp>
            <View style={{ gap: SPACE.md }}>
              {/* Cost-impact callout */}
              <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.warn }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="alert-triangle" size={16} color={c.warn} />
                  <Small style={{ color: c.text, fontWeight: '600', flex: 1 }}>
                    Some choices impact cost — flagged for your estimate.
                  </Small>
                </View>
              </Card>

              {/* Finish expectations */}
              <Card padded>
                <Eyebrow style={{ color: c.textMute, marginBottom: 8 }}>
                  Finish expectations
                </Eyebrow>
                {(finishExpectations.length > 0
                  ? finishExpectations
                  : materials.length > 0
                    ? materials
                    : ['No finish notes yet — brief is being prepared.']
                ).map((x, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: c.textMute,
                        marginTop: 8,
                        flexShrink: 0,
                      }}
                    />
                    <Small style={{ color: c.text, flex: 1 }}>{x}</Small>
                  </View>
                ))}
              </Card>

              {/* Material families */}
              {materialFamilies.length > 0 ? (
                <Card padded>
                  <Eyebrow style={{ color: c.textMute, marginBottom: 8 }}>
                    Material families
                  </Eyebrow>
                  {materialFamilies.map((x, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: c.textMute,
                          marginTop: 8,
                          flexShrink: 0,
                        }}
                      />
                      <Small style={{ color: c.text, flex: 1 }}>{x}</Small>
                    </View>
                  ))}
                </Card>
              ) : null}

              {/* Pending approvals note */}
              {areas.some((a) => a.status !== 'ready') ? (
                <Card padded>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="clock" size={15} color={c.warn} />
                    <Small style={{ color: c.text, flex: 1 }}>
                      Pending homeowner approvals:{' '}
                      <BodyStrong>
                        {areas
                          .filter((a) => a.status !== 'ready')
                          .map((a) => a.area_key.replace(/_/g, ' '))
                          .join(', ')}
                      </BodyStrong>
                    </Small>
                  </View>
                </Card>
              ) : null}
            </View>
          </FadeInUp>
        ) : null}

        {/* ── Approval / Version history ──────────────────────────────── */}
        {briefId && approvals.length > 0 ? (
          <FadeInUp delay={30}>
            <Eyebrow style={{ color: c.textMute }}>VERSION HISTORY</Eyebrow>
            <Card padded={false}>
              <View style={{ paddingHorizontal: SPACE.lg }}>
                {approvals.map((a, i) => (
                  <View
                    key={a.id}
                    style={{
                      flexDirection: 'row',
                      gap: SPACE.md,
                      paddingVertical: 12,
                      borderBottomWidth: i === approvals.length - 1 ? 0 : 1,
                      borderBottomColor: theme.colors.line,
                    }}
                  >
                    <View
                      style={{
                        height: 24,
                        paddingHorizontal: 9,
                        borderRadius: theme.radii.pill,
                        backgroundColor: AP.surfaceContainer,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Micro style={{ fontWeight: '700', color: c.text }}>
                        {a.action}
                      </Micro>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Small style={{ color: c.text }}>{a.note ?? a.actor_role}</Small>
                      <Small muted style={{ marginTop: 2 }}>
                        {new Date(a.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Small>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          </FadeInUp>
        ) : null}

        {/* Approve / Request changes — gated on can_approve + briefId */}
        {briefId && aud === 'homeowner' && !briefQ.isLoading ? (
          <FadeInUp delay={50}>
            {canApprove ? (
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                {canApproveNow ? (
                  <Button
                    title="Approve this version"
                    variant="primary"
                    size="md"
                    loading={actMut.isPending}
                    leading={<Feather name="check" size={16} color={c.onAccent} />}
                    onPress={() => actMut.mutate('approve')}
                    style={{ flex: 1 }}
                  />
                ) : null}
                <Button
                  title="Request changes"
                  variant="secondary"
                  size="md"
                  leading={<Feather name="edit-2" size={16} color={c.accentDeep} />}
                  onPress={() => actMut.mutate('request_changes')}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <Card padded style={{ borderLeftWidth: 4, borderLeftColor: c.quiet }}>
                <Small muted>{S.onlyOwnerCanApprove}</Small>
              </Card>
            )}
          </FadeInUp>
        ) : null}
      </View>
    </Screen>
  )
}
