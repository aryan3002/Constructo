/**
 * Audit Hub — the owner's "Site Audit" home (Calm Cockpit).
 *
 *   - Hero: AI quality inspections, "Start a new audit".
 *   - Active sites: one card per audit (score dial + open-findings count).
 *   - First site visits: SiteSync surveys (risk dial + onboarding state).
 *
 * Wired to the Labs-gated /api/v1/audits + /api/v1/surveys routers. Scores are
 * computed deterministically server-side; this screen only renders them.
 */
import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../../src/theme/tokens'
import { audit, type Audit, type Survey } from '../../../src/api/ownerAudit'
import { owner, type Site } from '../../../src/api/owner'
import { Body, Button, Card, Eyebrow, H1, Micro, Mono, Small, StatusPill, Title } from '../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, formatWhen } from './_components'
import { ScoreDial, SubHeader, riskStatus, scoreStatus } from './_audit.components'

const SECTION_OPTIONS = [
  'Civil work', 'Plumbing & sanitary', 'Electrical', 'ELV', 'Flooring',
  'Ceiling', 'Painting', 'Door & window', 'Exterior elevation', 'Interior',
]

export default function AuditHub() {
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)

  const sitesQ = useQuery({ queryKey: ['owner', 'sites'], queryFn: () => owner.sites() })
  const auditsQ = useQuery({ queryKey: ['owner', 'audits'], queryFn: () => audit.list() })
  const surveysQ = useQuery({ queryKey: ['owner', 'surveys'], queryFn: () => audit.surveys() })

  const siteName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sitesQ.data?.items ?? []) m.set(s.id, s.name)
    return m
  }, [sitesQ.data])

  const loading = sitesQ.isLoading || auditsQ.isLoading || surveysQ.isLoading
  const error = auditsQ.error || surveysQ.error

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['owner', 'audits'] })
    void qc.invalidateQueries({ queryKey: ['owner', 'surveys'] })
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg }}
    >
      <SubHeader
        title="Site audit"
        sub="AI-powered quality inspections"
        onBack={() => router.back()}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New audit"
            onPress={() => setSheetOpen(true)}
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.accent,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={22} color={theme.colors.onAccent} />
          </Pressable>
        }
      />

      {/* Hero */}
      <View
        style={{
          backgroundColor: AP.chip,
          borderRadius: theme.radii.hero,
          padding: SPACE.lg,
          gap: SPACE.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Ionicons name="shield-checkmark" size={22} color={theme.colors.accentDeep} />
          <Title style={{ color: theme.colors.accentDeep }}>Quality audits</Title>
        </View>
        <Body muted>
          Lokesh inspects on site, an AI scores it against the CivilArch checklists, and the
          findings come back here for you to assign.
        </Body>
        <Button title="Start a new audit" block onPress={() => setSheetOpen(true)} />
      </View>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message="We could not load audits just now." retryLabel="Try again" onRetry={refresh} />
      ) : (
        <>
          <SectionLabel>Active sites</SectionLabel>
          {(auditsQ.data?.items ?? []).length === 0 ? (
            <Card variant="quiet">
              <Small muted>No audits yet. Start one to get a scored quality report.</Small>
            </Card>
          ) : (
            <View style={{ gap: SPACE.md }}>
              {(auditsQ.data?.items ?? []).map((a) => (
                <AuditRow key={a.id} a={a} name={siteName.get(a.site_id) ?? 'Site'} onPress={() => router.push(`/(contractor)/owner/audit/${a.id}`)} />
              ))}
            </View>
          )}

          {(surveysQ.data?.items ?? []).length > 0 ? (
            <>
              <SectionLabel>First site visits</SectionLabel>
              <View style={{ gap: SPACE.md }}>
                {(surveysQ.data?.items ?? []).map((s) => (
                  <SurveyRow key={s.id} s={s} onPress={() => router.push(`/(contractor)/owner/survey/${s.id}`)} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      <NewAuditSheet
        open={sheetOpen}
        sites={sitesQ.data?.items ?? []}
        onClose={() => setSheetOpen(false)}
        onCreated={() => {
          setSheetOpen(false)
          refresh()
        }}
      />
    </ScrollView>
  )
}

function AuditRow({ a, name, onPress }: { a: Audit; name: string; onPress: () => void }) {
  const { theme } = useTheme()
  const tone = scoreStatus(a.score)
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <ScoreDial value={a.score} size={56} tone={tone} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 16 }} numberOfLines={1}>{name}</Title>
          <Small muted>
            {a.status === 'completed'
              ? `Audited ${formatWhen(a.conducted_at ?? a.requested_at)}`
              : a.status === 'requested'
                ? `Requested ${formatWhen(a.requested_at)} · ${a.scheduled_for === 'this_week' ? 'this week' : 'today'}`
                : 'In progress'}
          </Small>
        </View>
        <StatusPill status={tone} size="sm" label={a.status === 'completed' ? `${a.score}/100` : a.status === 'requested' ? 'Requested' : 'In progress'} />
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMute} />
      </Card>
    </Pressable>
  )
}

function SurveyRow({ s, onPress }: { s: Survey; onPress: () => void }) {
  const { theme } = useTheme()
  const tone = riskStatus(s.risk_score)
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <ScoreDial value={s.risk_score} size={56} tone={tone} label="risk" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 16 }} numberOfLines={1}>{s.name}</Title>
          <Small muted numberOfLines={1}>
            {s.code ? `${s.code} · ` : ''}
            {s.status === 'onboarded' ? 'Onboarded' : 'New site · awaiting onboarding'}
          </Small>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMute} />
      </Card>
    </Pressable>
  )
}

function NewAuditSheet({
  open, sites, onClose, onCreated,
}: {
  open: boolean
  sites: Site[]
  onClose: () => void
  onCreated: () => void
}) {
  const { theme } = useTheme()
  const [siteId, setSiteId] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [when, setWhen] = useState<'today' | 'this_week'>('today')

  const create = useMutation({
    mutationFn: () => audit.create({ site_id: siteId!, sections: picked, scheduled_for: when }),
    onSuccess: () => {
      setSiteId(null)
      setPicked([])
      setWhen('today')
      onCreated()
    },
  })

  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))

  const canSubmit = !!siteId && picked.length > 0 && !create.isPending

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(42,37,25,0.35)' }}>
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            padding: SPACE.gutter,
            paddingBottom: SPACE.xxl,
            maxHeight: '88%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md }}>
            <H1 style={{ fontSize: 22, flex: 1 }}>New audit</H1>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={theme.colors.textMute} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Eyebrow style={{ marginBottom: SPACE.sm }}>WHICH SITE</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {sites.map((s) => {
                const on = siteId === s.id
                return (
                  <Chip key={s.id} label={s.name} on={on} onPress={() => setSiteId(s.id)} />
                )
              })}
            </View>

            <Eyebrow style={{ marginTop: SPACE.lg, marginBottom: SPACE.sm }}>WORK SECTIONS</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {SECTION_OPTIONS.map((name) => (
                <Chip key={name} label={name} on={picked.includes(name)} onPress={() => toggle(name)} />
              ))}
            </View>

            <Eyebrow style={{ marginTop: SPACE.lg, marginBottom: SPACE.sm }}>WHEN</Eyebrow>
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Chip label="Today" on={when === 'today'} onPress={() => setWhen('today')} />
              <Chip label="This week" on={when === 'this_week'} onPress={() => setWhen('this_week')} />
            </View>

            {create.error ? (
              <Small style={{ color: theme.colors.risk, marginTop: SPACE.md }}>
                Could not request the audit. Please try again.
              </Small>
            ) : null}

            <Button
              title={create.isPending ? 'Requesting…' : `Request audit · ${picked.length} section${picked.length === 1 ? '' : 's'}`}
              block
              disabled={!canSubmit}
              onPress={() => create.mutate()}
              style={{ marginTop: SPACE.lg }}
            />
            <Small muted style={{ marginTop: SPACE.sm, textAlign: 'center' }}>
              Lokesh inspects on site; the AI scores it and the findings come back to you.
            </Small>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 9, paddingHorizontal: 14,
        borderRadius: theme.radii.pill,
        backgroundColor: on ? theme.colors.accentWarm : theme.colors.card,
        borderWidth: 1,
        borderColor: on ? theme.colors.accent : theme.colors.line,
      }}
    >
      {on ? <Ionicons name="checkmark" size={14} color={theme.colors.accentDeep} /> : null}
      <Micro style={{ color: on ? theme.colors.accentDeep : theme.colors.text }}>{label}</Micro>
    </Pressable>
  )
}
