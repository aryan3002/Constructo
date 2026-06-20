/**
 * Audit Site — a single site's scored quality report (Calm Cockpit).
 *   - Score hero (deterministic quality score + AI-inspector tag).
 *   - Findings (severity pill, room/location, note, assign action).
 *   - Work sections (expandable checklist: pass / obs / fail per item).
 */
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../../src/theme/tokens'
import { audit, type AuditFinding, type AuditSection } from '../../../../src/api/ownerAudit'
import { Body, Button, Card, Eyebrow, Mono, Small, StatusPill, Title, useToast } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel } from '../_components'
import { ITEM_META, SEVERITY_META, ScoreDial, SubHeader, scoreStatus } from '../_audit.components'

export default function AuditSite() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()

  const q = useQuery({ queryKey: ['owner', 'audit', id], queryFn: () => audit.get(id), enabled: !!id })

  const assign = useMutation({
    mutationFn: (findingId: string) => audit.assignFinding(findingId, { status: 'assigned' }),
    onSuccess: () => {
      toast('Assigned for fix · the site team is notified', 'check-circle')
      void qc.invalidateQueries({ queryKey: ['owner', 'audit', id] })
    },
  })

  if (q.isLoading) {
    return <Pad><LoadingBlock /></Pad>
  }
  if (q.error || !q.data) {
    return (
      <Pad>
        <ErrorBlock message="We could not load this audit." retryLabel="Try again" onRetry={() => void q.refetch()} />
      </Pad>
    )
  }

  const a = q.data
  const tone = scoreStatus(a.score)
  const openFindings = a.findings.filter((f) => f.status !== 'resolved')
  const statusWord = tone === 'ok' ? 'Healthy' : tone === 'warn' ? 'Watch' : tone === 'risk' ? 'At risk' : 'Pending'

  return (
    <Pad>
      <SubHeader
        title="Site audit"
        sub={a.status === 'completed' ? 'Scored quality report' : 'Inspection in progress'}
        onBack={() => router.replace('/(contractor)/owner/audit')}
        right={a.score != null ? <StatusPill status={tone} size="sm" label={`${a.score}/100`} /> : undefined}
      />

      {/* Score hero */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
        <ScoreDial value={a.score} size={84} tone={tone} label="score" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Eyebrow>QUALITY SCORE</Eyebrow>
          <Title style={{ color: theme.colors[tone === 'quiet' ? 'textMute' : tone] }}>{statusWord}</Title>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name="sparkles" size={13} color={theme.colors.accentDeep} />
            <Small muted>AI inspector · CivilArch checklists</Small>
          </View>
        </View>
      </Card>

      {/* Findings */}
      {openFindings.length > 0 ? (
        <>
          <SectionLabel>{`Findings · ${openFindings.length}`}</SectionLabel>
          <View style={{ gap: SPACE.md }}>
            {a.findings.map((f) => (
              <FindingCard
                key={f.id}
                f={f}
                pending={assign.isPending}
                onAssign={() => assign.mutate(f.id)}
              />
            ))}
          </View>
        </>
      ) : a.status === 'completed' ? (
        <Card variant="quiet">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.ok} />
            <Small muted>No open findings — this site passed clean.</Small>
          </View>
        </Card>
      ) : null}

      {/* Work sections */}
      {a.sections.length > 0 ? (
        <>
          <SectionLabel>{`Work sections · ${a.sections.length}`}</SectionLabel>
          <View style={{ gap: SPACE.sm }}>
            {a.sections.map((s) => (
              <SectionAccordion key={s.id} s={s} />
            ))}
          </View>
        </>
      ) : null}
    </Pad>
  )
}

function FindingCard({ f, pending, onAssign }: { f: AuditFinding; pending: boolean; onAssign: () => void }) {
  const { theme } = useTheme()
  const meta = SEVERITY_META[f.severity] ?? SEVERITY_META.minor
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusPill status={meta.status} size="sm" label={meta.label} icon={undefined} />
        {f.room || f.location ? (
          <Small muted style={{ marginLeft: 'auto' }}>
            {[f.room, f.location].filter(Boolean).join(' · ')}
          </Small>
        ) : null}
      </View>
      <Title style={{ fontSize: 16, marginTop: SPACE.sm }}>{f.title}</Title>
      {f.note ? <Body muted style={{ marginTop: 2 }}>{f.note}</Body> : null}
      <View style={{ marginTop: SPACE.md }}>
        {f.status === 'assigned' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="person-circle" size={16} color={theme.colors.accentDeep} />
            <Small style={{ color: theme.colors.accentDeep }}>Assigned for fix</Small>
          </View>
        ) : (
          <Button title="Assign to fix" variant="secondary" size="md" disabled={pending} onPress={onAssign} />
        )}
      </View>
    </Card>
  )
}

function SectionAccordion({ s }: { s: AuditSection }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const tone = scoreStatus(s.score)
  return (
    <Card padded={false}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg }}
      >
        <Mono style={{ fontSize: 16, color: theme.colors[tone === 'quiet' ? 'textMute' : tone], width: 34 }}>
          {s.score == null ? '—' : s.score}
        </Mono>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 15 }} numberOfLines={1}>{s.name}</Title>
          <Small muted>{s.pass_count} pass · {s.obs_count} obs · {s.fail_count} fail</Small>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMute} />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.sm }}>
          {s.items.length === 0 ? (
            <Small muted>No checklist items captured.</Small>
          ) : (
            s.items.map((it, i) => {
              const im = ITEM_META[it.status] ?? ITEM_META.ok
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                  <Ionicons name={im.icon} size={16} color={theme.colors[im.status]} />
                  <Small style={{ flex: 1 }}>{it.label}</Small>
                </View>
              )
            })
          )}
        </View>
      ) : null}
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
