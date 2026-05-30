/**
 * Approvals (Tab 3) — the cross-site decisions inbox. Every pending decision
 * for the owner, each as an ApprovalRow with Approve / Hold (reject) / Assign,
 * plus a batch-approve affordance for the selected rows. Homeowner-routed items
 * carry a 🏠 tag + SLA countdown (Owner.md §6.4).
 */
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, type Status } from '../../../src/theme/tokens'
import { owner, type Decision } from '../../../src/api/owner'
import { Body, BodyStrong, Button, Card, H1, Small } from '../../../src/ui'
import { ApprovalRow, ErrorBlock, LoadingBlock, idsToEvidence } from './_components'

const STR = {
  en: {
    title: 'Approvals',
    subtitle: (n: number) => (n === 0 ? 'Nothing waiting on you.' : `${n} decision${n === 1 ? '' : 's'} waiting on you`),
    empty: 'Nothing waiting on you. All decisions are made.',
    approve: 'Approve', hold: 'Hold', assign: 'Assign → PM',
    batchApprove: (n: number) => `Approve ${n} selected`,
    selectAll: 'Select all',
    clear: 'Clear',
    proof: 'Proof',
    homeowner: '🏠 Homeowner',
    slaBreached: '⚠ SLA breached',
    slaDue: (h: string) => `SLA: ${h}`,
    errorLine: 'We could not load your approvals just now.',
    tryAgain: 'Try again',
  },
  hi: {
    title: 'मंज़ूरी',
    subtitle: (n: number) => (n === 0 ? 'आप पर कुछ भी लंबित नहीं।' : `आप पर ${n} निर्णय लंबित`),
    empty: 'आप पर कुछ भी लंबित नहीं। सभी निर्णय हो चुके हैं।',
    approve: 'मंज़ूर', hold: 'रोकें', assign: 'सौंपें → PM',
    batchApprove: (n: number) => `${n} चुने मंज़ूर करें`,
    selectAll: 'सभी चुनें',
    clear: 'साफ़ करें',
    proof: 'प्रमाण',
    homeowner: '🏠 गृहस्वामी',
    slaBreached: '⚠ SLA पार',
    slaDue: (h: string) => `SLA: ${h}`,
    errorLine: 'अभी मंज़ूरियाँ लोड नहीं हो सकीं।',
    tryAgain: 'फिर कोशिश करें',
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

  const q = useQuery({ queryKey: ['owner', 'approvals'], queryFn: () => owner.approvals('pending') })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['owner', 'approvals'] })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'hold' | 'assign' }) => {
      if (action === 'approve') return owner.approve(id)
      if (action === 'hold') return owner.reject(id)
      // Assign → PM. With no member picker on this surface, route to the owner
      // as approver placeholder; the web/team picker sets the real assignee.
      return owner.assign(id, 'pm')
    },
    onSuccess: () => void invalidate(),
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

  const pending = act.isPending || batch.isPending

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
                onChip={(action) => act.mutate({ id: d.id, action })}
              />
            ))}
          </View>
        </>
      )}
    </Wrap>
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
