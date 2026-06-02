/**
 * Approvals (Tab 3) — the cross-site decisions inbox. Every pending decision
 * for the owner, each as an ApprovalRow with Approve / Hold (reject) / Assign,
 * plus a batch-approve affordance for the selected rows. Homeowner-routed items
 * carry a 🏠 tag + SLA countdown (Owner.md §6.4).
 */
import { useMemo, useState } from 'react'
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP, type Status } from '../../../src/theme/tokens'
import { owner, type Decision, type Member } from '../../../src/api/owner'
import { Body, BodyStrong, Button, Card, H1, Small } from '../../../src/ui'
import { ApprovalRow, ErrorBlock, LoadingBlock, idsToEvidence } from './_components'

const STR = {
  en: {
    title: 'Approvals',
    subtitle: (n: number) => (n === 0 ? 'Nothing waiting on you.' : `${n} decision${n === 1 ? '' : 's'} waiting on you`),
    empty: 'Nothing waiting on you. All decisions are made.',
    approve: 'Approve', hold: 'Hold', assign: 'Assign',
    batchApprove: (n: number) => `Approve ${n} selected`,
    selectAll: 'Select all',
    clear: 'Clear',
    proof: 'Proof',
    homeowner: '🏠 Homeowner',
    slaBreached: '⚠ SLA breached',
    slaDue: (h: string) => `SLA: ${h}`,
    errorLine: 'We could not load your approvals just now.',
    tryAgain: 'Try again',
    assignTitle: 'Assign to',
    assignSubtitle: 'Pick a team member to hand this decision to.',
    assignEmpty: 'No team members to assign yet.',
    assignLoading: 'Loading team…',
    cancel: 'Cancel',
  },
  hi: {
    title: 'मंज़ूरी',
    subtitle: (n: number) => (n === 0 ? 'आप पर कुछ भी लंबित नहीं।' : `आप पर ${n} निर्णय लंबित`),
    empty: 'आप पर कुछ भी लंबित नहीं। सभी निर्णय हो चुके हैं।',
    approve: 'मंज़ूर', hold: 'रोकें', assign: 'सौंपें',
    batchApprove: (n: number) => `${n} चुने मंज़ूर करें`,
    selectAll: 'सभी चुनें',
    clear: 'साफ़ करें',
    proof: 'प्रमाण',
    homeowner: '🏠 गृहस्वामी',
    slaBreached: '⚠ SLA पार',
    slaDue: (h: string) => `SLA: ${h}`,
    errorLine: 'अभी मंज़ूरियाँ लोड नहीं हो सकीं।',
    tryAgain: 'फिर कोशिश करें',
    assignTitle: 'किसे सौंपें',
    assignSubtitle: 'इस निर्णय को सौंपने के लिए एक टीम सदस्य चुनें।',
    assignEmpty: 'अभी सौंपने के लिए कोई टीम सदस्य नहीं।',
    assignLoading: 'टीम लोड हो रही है…',
    cancel: 'रद्द करें',
  },
} as const

function statusFor(d: Decision): Status {
  if (d.state === 'escalated') return 'risk'
  if (d.kind === 'homeowner_question') return 'info'
  if (d.kind === 'hold_payment') return 'warn'
  return 'warn'
}

/** SLA countdown label, or null when no SLA. */
function slaLabel(
  d: Decision,
  t: { slaBreached: string; slaDue: (h: string) => string },
): string | null {
  if (!d.sla_due_at) return null
  const due = new Date(d.sla_due_at).getTime()
  if (Number.isNaN(due)) return null
  const ms = due - Date.now()
  if (ms <= 0) return t.slaBreached
  const hrs = Math.round(ms / 3.6e6)
  return t.slaDue(hrs >= 1 ? `${hrs}h` : `<1h`)
}

export default function Approvals() {
  const { lang } = useT()
  const { theme } = useTheme()
  const qc = useQueryClient()
  const t = STR[lang]

  const [selected, setSelected] = useState<Set<string>>(new Set())
  // The decision awaiting an assignee (drives the member picker modal). The old
  // hard-coded `owner.assign(id, 'pm')` is gone — the user picks a real member.
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['owner', 'approvals'], queryFn: () => owner.approvals('pending') })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['owner', 'approvals'] })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'hold' }) =>
      action === 'approve' ? owner.approve(id) : owner.reject(id),
    onSuccess: () => void invalidate(),
  })

  const assignMut = useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string }) =>
      owner.assign(id, assignedTo),
    onSuccess: () => {
      setAssigningId(null)
      void invalidate()
    },
  })

  const batch = useMutation({
    mutationFn: (ids: string[]) => owner.batch('approve', ids),
    onSuccess: () => {
      setSelected(new Set())
      void invalidate()
    },
  })

  const items: Decision[] = q.data?.items ?? []

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const selectedIds = useMemo(() => items.filter((d) => selected.has(d.id)).map((d) => d.id), [items, selected])

  if (q.isLoading) return <Wrap><H1>{t.title}</H1><LoadingBlock /></Wrap>
  if (q.error) {
    return (
      <Wrap>
        <H1>{t.title}</H1>
        <ErrorBlock message={t.errorLine} retryLabel={t.tryAgain} onRetry={() => void q.refetch()} />
      </Wrap>
    )
  }

  const pending = act.isPending || batch.isPending || assignMut.isPending

  return (
    <Wrap onRefresh={invalidate} refreshing={q.isRefetching}>
      <View style={{ gap: SPACE.xs }}>
        <H1>{t.title}</H1>
        <Body muted>{t.subtitle(items.length)}</Body>
      </View>

      {items.length === 0 ? (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: theme.colors.ok }}>
          <BodyStrong>{t.empty}</BodyStrong>
        </Card>
      ) : (
        <>
          {/* batch controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <Small
              color={theme.colors.accentDeep}
              onPress={() => setSelected(new Set(items.map((d) => d.id)))}
            >
              {t.selectAll}
            </Small>
            {selected.size > 0 ? (
              <Small color={theme.colors.textMute} onPress={() => setSelected(new Set())}>
                {t.clear}
              </Small>
            ) : null}
            {selectedIds.length > 0 ? (
              <Button
                title={t.batchApprove(selectedIds.length)}
                size="md"
                loading={batch.isPending}
                disabled={pending}
                onPress={() => batch.mutate(selectedIds)}
                style={{ marginLeft: 'auto' }}
              />
            ) : null}
          </View>

          <View style={{ gap: SPACE.md }}>
            {items.map((d) => (
              <ApprovalRow
                key={d.id}
                title={d.title}
                detail={d.detail}
                status={statusFor(d)}
                tag={d.kind === 'homeowner_question' ? t.homeowner : undefined}
                slaLabel={slaLabel(d, t) ?? undefined}
                evidence={idsToEvidence(d.evidence_event_ids, t.proof)}
                pending={pending}
                selected={selected.has(d.id)}
                onToggleSelect={() => toggle(d.id)}
                chips={{ approve: t.approve, hold: t.hold, assign: t.assign }}
                onChip={(action) =>
                  action === 'assign'
                    ? setAssigningId(d.id)
                    : act.mutate({ id: d.id, action })
                }
              />
            ))}
          </View>
        </>
      )}

      <MemberPicker
        visible={assigningId !== null}
        busy={assignMut.isPending}
        t={t}
        onClose={() => setAssigningId(null)}
        onPick={(memberId) =>
          assigningId && assignMut.mutate({ id: assigningId, assignedTo: memberId })
        }
      />
    </Wrap>
  )
}

// Human label per role for the picker rows (en/hi mirror the i18n strings).
const ROLE_LABEL: Record<'en' | 'hi', Partial<Record<Member['role'], string>>> = {
  en: {
    owner: 'Owner',
    pm: 'Project Manager',
    supervisor: 'Supervisor',
    accountant: 'Accountant',
    procurement: 'Procurement',
    labor_contractor: 'Mukadam',
  },
  hi: {
    owner: 'मालिक',
    pm: 'प्रोजेक्ट मैनेजर',
    supervisor: 'सुपरवाइज़र',
    accountant: 'अकाउंटेंट',
    procurement: 'खरीद',
    labor_contractor: 'मुकादम',
  },
}

/**
 * MemberPicker — the Assign member picker (C3). Lists assignable team members
 * (GET /users) and hands the chosen member's REAL UUID back so the decision is
 * assigned to a person, not the old hard-coded 'pm' literal. The list query is
 * lazy: it only fires while the modal is open.
 */
function MemberPicker({
  visible,
  busy,
  t,
  onClose,
  onPick,
}: {
  visible: boolean
  busy: boolean
  t: { assignTitle: string; assignSubtitle: string; assignEmpty: string; assignLoading: string; cancel: string }
  onClose: () => void
  onPick: (memberId: string) => void
}) {
  const { lang } = useT()
  const { theme } = useTheme()
  const labels = ROLE_LABEL[lang]

  const q = useQuery({
    queryKey: ['owner', 'members'],
    queryFn: () => owner.members(),
    enabled: visible,
  })

  // Homeowners are never assignment targets for a contractor decision; every
  // other company role (owner included, for self-assign) is pickable.
  const members = (q.data?.items ?? []).filter((m) => m.role !== 'homeowner')

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            padding: SPACE.lg,
            paddingBottom: SPACE.xxl,
            gap: SPACE.md,
          }}
        >
          <View style={{ gap: SPACE.xs }}>
            <BodyStrong>{t.assignTitle}</BodyStrong>
            <Small color={theme.colors.textMute}>{t.assignSubtitle}</Small>
          </View>

          {q.isLoading ? (
            <Body muted>{t.assignLoading}</Body>
          ) : members.length === 0 ? (
            <Body muted>{t.assignEmpty}</Body>
          ) : (
            <View style={{ gap: SPACE.sm }}>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  disabled={busy}
                  onPress={() => onPick(m.id)}
                  style={{
                    minHeight: TAP,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACE.md,
                    paddingVertical: SPACE.sm,
                    paddingHorizontal: SPACE.md,
                    borderWidth: 1,
                    borderColor: theme.colors.line,
                    borderRadius: theme.radii.card,
                    backgroundColor: theme.colors.card,
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Feather name="user" size={18} color={theme.colors.accentDeep} />
                  <View style={{ flex: 1 }}>
                    <BodyStrong>{m.name}</BodyStrong>
                    <Small color={theme.colors.textMute}>
                      {labels[m.role] ?? m.role}
                    </Small>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.colors.textMute} />
                </Pressable>
              ))}
            </View>
          )}

          <Button title={t.cancel} variant="secondary" size="md" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function Wrap({
  children,
  onRefresh,
  refreshing,
}: {
  children: React.ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { theme } = useTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.lg, paddingTop: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.md }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} /> : undefined
      }
    >
      {children}
    </ScrollView>
  )
}
