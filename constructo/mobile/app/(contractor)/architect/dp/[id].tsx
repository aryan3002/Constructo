/**
 * dp — the full design brief (designer view). Action bar drives the brief's
 * lifecycle (sign off / request changes / regenerate / materialize) via the
 * designerActions state map; below it, per-area AI-drafted theme directions
 * (palette + materials + rationale) with the architect's commit actions
 * (approve / adjust / reject); at the bottom, the approval timeline. Wired to
 * /api/v1/design theme decisions + brief/approval endpoints.
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../../src/theme/tokens'
import { design, type Area, type Theme, type ThemeAction } from '../../../../src/api/ownerDesign'
import { design as briefApi, type MaterializeOut, type ProfilerBriefApproval, type ProfilerClarification } from '../../../../src/api/client'
import { designerActions, actionLabel, type DesignerActionType } from '../../../../src/architect/brief_actions.util'
import { splitClarifications } from '../../../../src/architect/clarifications.util'
import { Body, BodyStrong, Button, Card, Eyebrow, ListRow, Mono, Small, StatusPill, Title } from '../../../../src/ui'
import { ErrorBlock, LoadingBlock, SectionLabel, SubHeader, timeAgo } from '../_components'

const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const THEME_TONE: Record<string, Status> = {
  suggested: 'info', approved: 'ok', adjusted: 'warn', rejected: 'risk',
}

export default function DesignerBriefDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  const [acting, setActing] = useState<DesignerActionType | null>(null)
  const [noteSheet, setNoteSheet] = useState<DesignerActionType | null>(null)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [matResult, setMatResult] = useState<MaterializeOut | null>(null)

  const q = useQuery({
    queryKey: ['architect', 'design', 'brief', id],
    queryFn: async () => {
      const profile = await design.profile(id)
      const themesByArea = await Promise.all(
        profile.areas.map((a) => design.themes(id, a.id).catch(() => [] as Theme[])),
      )
      return profile.areas.map((area, i) => ({ area, themes: themesByArea[i] }))
    },
    enabled: !!id,
  })

  // The brief rendering carries the owning brief's lifecycle `state` + `brief_id`
  // directly (client.ts ProfilerBriefRendering) — no separate lookup needed.
  // A 404 (no brief drafted yet) resolves to `null`, not an error state.
  const briefQ = useQuery({
    queryKey: ['dp', 'brief', id],
    queryFn: () => briefApi.brief(id, 'architect'),
    enabled: !!id,
    retry: false,
  })
  const brief = briefQ.data ?? null

  const approvalsQ = useQuery({
    queryKey: ['dp', 'approvals', brief?.brief_id],
    queryFn: () => briefApi.approvals(brief!.brief_id),
    enabled: !!brief?.brief_id,
  })

  const clarQ = useQuery({
    queryKey: ['dp', 'clar', id],
    queryFn: () => briefApi.clarifications(id),
    enabled: !!id,
  })

  const decide = useMutation({
    mutationFn: ({ themeId, action }: { themeId: string; action: ThemeAction }) =>
      design.decideTheme(themeId, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['architect', 'design', 'brief', id] }),
  })

  async function runAction(action: DesignerActionType, noteText?: string) {
    setActing(action)
    setActionError(null)
    try {
      if (action === 'regenerate') {
        await briefApi.generateBrief(id)
      } else if (action === 'materialize') {
        if (!brief?.brief_id) throw new Error('No brief to materialize yet.')
        const r = await briefApi.materialize(brief.brief_id)
        setMatResult(r)
      } else {
        if (!brief?.brief_id) throw new Error('No brief to act on yet.')
        await briefApi.actOnBrief(brief.brief_id, { action, note: noteText })
      }
      void qc.invalidateQueries({ queryKey: ['dp', 'brief', id] })
      void qc.invalidateQueries({ queryKey: ['dp', 'approvals'] })
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setActing(null)
      setNoteSheet(null)
      setNote('')
    }
  }

  if (q.isLoading) return <Pad><LoadingBlock /></Pad>
  if (q.error || !q.data) {
    return <Pad><ErrorBlock message="We could not load the design brief." retryLabel="Try again" onRetry={() => void q.refetch()} /></Pad>
  }

  const groups = q.data
  const totalThemes = groups.reduce((n, g) => n + g.themes.length, 0)
  const actions = brief ? designerActions(brief.state ?? '') : []
  const approvals = approvalsQ.data ?? []
  const { answered, waiting } = splitClarifications(clarQ.data ?? [])
  const showClarSection = answered.length > 0 || waiting.length > 0
  const showRegenerateNudge = answered.length > 0 && brief?.state === 'revision_requested'

  return (
    <Pad>
      <SubHeader title="Design brief" sub="AI-drafted directions · you commit" onBack={() => router.replace({ pathname: '/(contractor)/architect/designsite/[id]', params: { id } })} />

      {!briefQ.isLoading && !brief ? (
        <Card variant="quiet">
          <Small muted>No brief yet — the homeowner is still building it.</Small>
        </Card>
      ) : null}

      {brief && actions.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {actions.map((a) => (
              <Button
                key={a.action}
                title={a.label}
                variant={a.variant}
                size="md"
                loading={acting === a.action}
                disabled={acting !== null && acting !== a.action}
                onPress={() => (a.needsNote ? setNoteSheet(a.action) : void runAction(a.action))}
                style={{ flex: 1, minWidth: 150 }}
              />
            ))}
          </View>
          {actionError ? <Small style={{ color: theme.colors.risk }}>{actionError}</Small> : null}
        </View>
      ) : null}

      {matResult ? (
        <Card>
          <Eyebrow>Materialized</Eyebrow>
          <BodyStrong style={{ marginTop: 4 }}>
            {matResult.specs_created} spec{matResult.specs_created === 1 ? '' : 's'} · {matResult.materials_created} material{matResult.materials_created === 1 ? '' : 's'} created
          </BodyStrong>
          {matResult.skipped_areas.length > 0 ? (
            <Small muted style={{ marginTop: 4 }}>Skipped: {matResult.skipped_areas.join(', ')}</Small>
          ) : null}
          <Button
            title="Open selections"
            variant="secondary"
            size="md"
            onPress={() => router.push('/(contractor)/architect/selections')}
            style={{ marginTop: SPACE.md }}
          />
        </Card>
      ) : null}

      {showClarSection ? (
        <View style={{ gap: SPACE.sm }}>
          <SectionLabel>Homeowner Q&A</SectionLabel>
          {showRegenerateNudge ? (
            <Card>
              <BodyStrong>New answers came in — regenerate the brief to fold them in</BodyStrong>
              <Button
                title="Regenerate brief"
                variant="primary"
                size="md"
                loading={acting === 'regenerate'}
                disabled={acting !== null && acting !== 'regenerate'}
                onPress={() => void runAction('regenerate')}
                style={{ marginTop: SPACE.md }}
              />
            </Card>
          ) : null}
          <Card padded={false}>
            {[...answered, ...waiting].map((row, i, arr) => (
              <ClarificationRow key={row.id} row={row} last={i === arr.length - 1} />
            ))}
          </Card>
        </View>
      ) : null}

      {totalThemes === 0 ? (
        <Card variant="quiet">
          <Small muted>No theme directions drafted yet. They appear once enough inspiration is ranked.</Small>
        </Card>
      ) : (
        groups.map(({ area, themes }) => (
          <AreaBlock key={area.id} area={area} themes={themes} pending={decide.isPending} onDecide={(themeId, action) => decide.mutate({ themeId, action })} />
        ))
      )}

      {brief && approvals.length > 0 ? (
        <View style={{ gap: SPACE.sm }}>
          <SectionLabel>Approval timeline</SectionLabel>
          <Card padded={false}>
            {approvals.map((row, i) => (
              <ApprovalRow key={row.id} row={row} last={i === approvals.length - 1} />
            ))}
          </Card>
        </View>
      ) : null}

      <NoteSheet
        visible={noteSheet !== null}
        note={note}
        onChangeNote={setNote}
        pending={acting !== null}
        onCancel={() => { setNoteSheet(null); setNote('') }}
        onConfirm={() => { if (noteSheet) void runAction(noteSheet, note.trim()) }}
        insetsBottom={insets.bottom}
      />
    </Pad>
  )
}

function ApprovalRow({ row, last }: { row: ProfilerBriefApproval; last: boolean }) {
  return (
    <ListRow
      icon="check-circle"
      title={actionLabel(row.action)}
      subtitle={`${cap(row.actor_role)} · ${timeAgo(row.created_at)}`}
      last={last}
    />
  )
}

function ClarificationRow({ row, last }: { row: ProfilerClarification; last: boolean }) {
  const { theme } = useTheme()
  const answered = row.answer != null
  return (
    <View
      style={{
        paddingVertical: SPACE.md,
        paddingHorizontal: SPACE.lg,
        gap: 4,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.line,
      }}
    >
      <Body muted>{row.question}</Body>
      {answered ? (
        <>
          <BodyStrong>{row.answer}</BodyStrong>
          <Small muted>{timeAgo(row.answered_at)}</Small>
        </>
      ) : (
        <Small muted>Waiting for homeowner</Small>
      )}
    </View>
  )
}

function NoteSheet({
  visible,
  note,
  onChangeNote,
  pending,
  onCancel,
  onConfirm,
  insetsBottom,
}: {
  visible: boolean
  note: string
  onChangeNote: (v: string) => void
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
  insetsBottom: number
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const canConfirm = note.trim().length >= 3 && !pending
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}
          onPress={onCancel}
        >
          <Pressable
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.card,
              borderTopRightRadius: theme.radii.card,
              padding: SPACE.lg,
              paddingBottom: insetsBottom + SPACE.lg,
              gap: SPACE.sm,
            }}
            onPress={() => {}}
          >
            <Eyebrow style={{ color: c.textMute }}>Request changes</Eyebrow>
            <BodyStrong>What should change?</BodyStrong>
            <Small muted>Tell the homeowner what needs revising before you sign off.</Small>
            <TextInput
              value={note}
              onChangeText={onChangeNote}
              placeholder="e.g. Kitchen palette clashes with the living room theme…"
              placeholderTextColor={c.textMute}
              multiline
              numberOfLines={4}
              style={{
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: theme.radii.control,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                color: c.text,
                backgroundColor: c.paper,
                marginTop: SPACE.xs,
                minHeight: 96,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
              <Button title="Cancel" variant="ghost" size="md" onPress={onCancel} style={{ flex: 1 }} />
              <Button
                title={pending ? 'Sending…' : 'Send'}
                variant="primary"
                size="md"
                loading={pending}
                disabled={!canConfirm}
                onPress={onConfirm}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function AreaBlock({ area, themes, pending, onDecide }: { area: Area; themes: Theme[]; pending: boolean; onDecide: (themeId: string, action: ThemeAction) => void }) {
  if (themes.length === 0) return null
  return (
    <View style={{ gap: SPACE.md }}>
      <SectionLabel>{cap(area.area_key)}</SectionLabel>
      {themes.map((t) => (
        <ThemeCard key={t.id} t={t} pending={pending} onDecide={onDecide} />
      ))}
    </View>
  )
}

function ThemeCard({ t, pending, onDecide }: { t: Theme; pending: boolean; onDecide: (themeId: string, action: ThemeAction) => void }) {
  const { theme } = useTheme()
  const tone = THEME_TONE[t.status] ?? 'info'
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Title style={{ fontSize: 16, flex: 1 }}>{t.name}</Title>
        <StatusPill status={tone} size="sm" label={cap(t.status)} />
      </View>
      {typeof t.confidence === 'number' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Ionicons name="sparkles" size={12} color={theme.colors.accentDeep} />
          <Mono style={{ fontSize: 12, color: theme.colors.textMute }}>{Math.round(t.confidence * 100)}% confidence</Mono>
        </View>
      ) : null}

      {t.palette?.length ? (
        <>
          <Eyebrow style={{ marginTop: SPACE.md }}>PALETTE</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 6 }}>
            {t.palette.map((p, i) => <PaletteChip key={i} label={p} />)}
          </View>
        </>
      ) : null}

      {t.materials?.length ? (
        <>
          <Eyebrow style={{ marginTop: SPACE.md }}>MATERIALS</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 6 }}>
            {t.materials.map((m, i) => <PaletteChip key={i} label={m} />)}
          </View>
        </>
      ) : null}

      {t.rationale ? <Body muted style={{ marginTop: SPACE.md }}>{t.rationale}</Body> : null}

      {t.status === 'suggested' ? (
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
          <Button title="Approve" size="md" disabled={pending} onPress={() => onDecide(t.id, 'approve')} style={{ flex: 1 }} />
          <Button title="Adjust" variant="secondary" size="md" disabled={pending} onPress={() => onDecide(t.id, 'adjust')} style={{ flex: 1 }} />
          <Button title="Reject" variant="ghost" size="md" disabled={pending} onPress={() => onDecide(t.id, 'reject')} style={{ flex: 1 }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.md }}>
          <Ionicons name="checkmark-circle" size={15} color={theme.colors[tone]} />
          <Small style={{ color: theme.colors[tone] }}>{cap(t.status)}</Small>
        </View>
      )}
    </Card>
  )
}

function PaletteChip({ label }: { label: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: theme.colors.paper, borderWidth: 1, borderColor: theme.colors.line }}>
      <Small style={{ fontSize: 12, textTransform: 'capitalize' }}>{label}</Small>
    </View>
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
