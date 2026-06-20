/**
 * Site Survey — the SiteSync first-visit intake report (Calm Cockpit).
 *   - Risk hero (deterministic risk score + data-filled / photos / area tiles).
 *   - Project & location, Plot & approvals, Site conditions key-value cards.
 *   - AI site analysis (drafted prose) + "Onboard site" CTA.
 */
import { Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import { audit, type Survey } from '../../../../src/api/ownerAudit'
import { Body, Button, Card, Eyebrow, Mono, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel } from '../_components'
import { ScoreDial, SubHeader, riskStatus } from '../_audit.components'

export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery({ queryKey: ['owner', 'survey', id], queryFn: () => audit.survey(id), enabled: !!id })
  const onboard = useMutation({
    mutationFn: () => audit.onboardSurvey(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['owner', 'survey', id] })
      void qc.invalidateQueries({ queryKey: ['owner', 'surveys'] })
      void qc.invalidateQueries({ queryKey: ['owner', 'sites'] })
    },
  })

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return (
      <Pad>
        <ErrorBlock message="We could not load this survey." retryLabel="Try again" onRetry={() => void q.refetch()} />
      </Pad>
    )
  }

  const s = q.data
  const tone = riskStatus(s.risk_score)
  const riskWord = tone === 'ok' ? 'Low risk' : tone === 'warn' ? 'Moderate risk' : tone === 'risk' ? 'High risk' : 'Unscored'

  return (
    <Pad>
      <SubHeader title="Site survey" sub={[s.name, s.code].filter(Boolean).join(' · ')} onBack={() => router.replace('/(contractor)/owner/audit')} />

      {/* Risk hero */}
      <View style={{ backgroundColor: theme.colors.secondaryContainer, borderRadius: theme.radii.hero, padding: SPACE.lg, gap: SPACE.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
          <ScoreDial value={s.risk_score} size={84} tone={tone} label="risk" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Eyebrow>SITESYNC AI · RISK SCORE</Eyebrow>
            <Title>{riskWord}</Title>
            {s.client_name ? <Small muted>First visit · client {s.client_name}</Small> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <StatTile label="Data filled" value={`${s.filled_pct}%`} />
          <StatTile label="Photos" value={String(s.photo_count)} />
          <StatTile label="Est. area" value={s.area ?? '—'} />
        </View>
      </View>

      {s.status === 'onboarded' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.ok} />
          <Small style={{ color: theme.colors.ok }}>Onboarded — this survey is now a live site.</Small>
        </View>
      ) : null}

      {/* Project & location */}
      <Card>
        <Title style={{ fontSize: 16, marginBottom: SPACE.sm }}>Project & location</Title>
        <KV k="Client" v={s.client_name} />
        <KV k="Type" v={s.project_type} />
        <KV k="Architect" v={s.architect_name} />
        <KV k="Address" v={s.address} />
        <KV k="GPS" v={s.gps} mono last />
      </Card>

      {/* Plot & approvals */}
      {(Object.keys(s.plot ?? {}).length > 0 || (s.approvals ?? []).length > 0) ? (
        <Card>
          <Title style={{ fontSize: 16, marginBottom: SPACE.sm }}>Plot & approvals</Title>
          <KV k="Plot no." v={s.plot?.no} />
          <KV k="Facing" v={s.plot?.facing} />
          <KV k="Corner plot" v={s.plot?.corner} />
          <KV k="Actual area" v={s.plot?.actual} />
          <KV k="FAR" v={s.plot?.far} />
          <KV k="Ground coverage" v={s.plot?.coverage} last={(s.approvals ?? []).length === 0} />
          {(s.approvals ?? []).length > 0 ? (
            <>
              <Eyebrow style={{ marginTop: SPACE.md, marginBottom: SPACE.sm }}>
                APPROVALS NEEDED{s.approval_status ? ` · ${s.approval_status}` : ''}
              </Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                {s.approvals.map((a) => (
                  <Pill key={a} label={a} />
                ))}
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      {/* Site conditions */}
      {((s.conditions ?? []).length > 0 || (s.risks ?? []).length > 0) ? (
        <Card>
          <Title style={{ fontSize: 16, marginBottom: SPACE.sm }}>Site conditions</Title>
          {(s.conditions ?? []).map((c, i) => (
            <KV key={i} k={String(c[0])} v={String(c[1])} last={i === (s.conditions.length - 1) && (s.risks ?? []).length === 0} />
          ))}
          {(s.risks ?? []).length > 0 ? (
            <>
              <Eyebrow style={{ marginTop: SPACE.md, marginBottom: SPACE.sm }}>ENVIRONMENT RISKS</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                {s.risks.map((r, i) => {
                  const lvl = String(r.level ?? '').toLowerCase()
                  const st = lvl === 'high' ? 'risk' : lvl === 'medium' ? 'warn' : 'ok'
                  return <StatusPill key={i} status={st} size="sm" label={`${r.name}: ${r.level}`} />
                })}
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      {/* AI analysis */}
      {s.ai_analysis ? (
        <View style={{ backgroundColor: AP.chip, borderRadius: theme.radii.card, padding: SPACE.lg, gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={16} color={theme.colors.accentDeep} />
            <Title style={{ fontSize: 15, color: theme.colors.accentDeep }}>AI site analysis</Title>
          </View>
          <Body style={{ color: theme.colors.text }}>{s.ai_analysis}</Body>
          {s.requirement ? <Small muted>Client wants: {s.requirement}</Small> : null}
        </View>
      ) : null}

      {/* Onboard */}
      {s.status !== 'onboarded' ? (
        <Button
          title={onboard.isPending ? 'Onboarding…' : 'Onboard site'}
          block
          disabled={onboard.isPending}
          onPress={() => onboard.mutate()}
        />
      ) : null}
      {onboard.error ? (
        <Small style={{ color: theme.colors.risk, textAlign: 'center' }}>
          Could not onboard. Only owners and PMs can onboard a site.
        </Small>
      ) : null}
    </Pad>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: theme.radii.chip, padding: SPACE.md, gap: 2 }}>
      <Mono style={{ fontSize: 16 }}>{value}</Mono>
      <Small muted style={{ fontSize: 11 }}>{label}</Small>
    </View>
  )
}

function KV({ k, v, mono, last }: { k: string; v?: string | null; mono?: boolean; last?: boolean }) {
  const { theme } = useTheme()
  if (!v) return null
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.colors.line, gap: SPACE.md,
      }}
    >
      <Small muted style={{ width: 120 }}>{k}</Small>
      {mono ? <Mono style={{ flex: 1, fontSize: 13 }}>{v}</Mono> : <Small style={{ flex: 1 }}>{v}</Small>}
    </View>
  )
}

function Pill({ label }: { label: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: theme.colors.paper, borderWidth: 1, borderColor: theme.colors.line }}>
      <Ionicons name="information-circle-outline" size={13} color={theme.colors.textMute} />
      <Small style={{ fontSize: 12 }}>{label}</Small>
    </View>
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
