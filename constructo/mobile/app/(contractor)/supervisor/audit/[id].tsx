/**
 * Run audit — the engineer conducts an inspection on site. For each requested
 * section he marks every check Pass / Observe / Fail, then submits:
 *
 *   1. POST /audits/{id}/sections  per section  → deterministic section score
 *   2. POST /audits/{id}/findings  per FAIL     → a defect the owner will see
 *   3. POST /audits/{id}/score                  → overall score + completed
 *
 * Scores are computed by the backend (determinism doctrine). The check
 * CHECKLISTS are domain templates per section name (like the CivilArch sheets);
 * an unknown section falls back to a generic checklist.
 */
import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { audit, type AuditSectionItem, type ItemStatus } from '../../../../src/api/ownerAudit'
import { Body, Button, Card, Small, Title } from '../../../../src/ui'
import { ErrorBlock, ITEM_META, LoadingBlock, SubHeader } from '../_eng.components'

/** Inspection checklists per section (CivilArch sheets). Unknown → generic. */
const CHECKLISTS: Record<string, string[]> = {
  'Civil work': [
    'Slab cover & spacing',
    'Reinforcement as per drawing',
    'Shuttering rigidity',
    'Cube sample taken',
    'No honeycombing',
  ],
  Flooring: ['Tile lippage within 1mm', 'Skirting line level', 'Slope to drain', 'Grout finish'],
  Painting: ['Putty evenness', 'Primer coverage', 'Final coat finish', 'Edge cutting clean'],
  'Plumbing & sanitary': ['Slope to traps', 'Pipe support spacing', 'Pressure test done', 'No leaks at joints'],
  Electrical: ['Earthing continuity', 'Conduit in slab', 'Load balancing', 'Switch / socket heights'],
}
const GENERIC = ['Workmanship', 'As per drawing', 'Correct materials', 'Site cleanliness']

const MARKS: { v: ItemStatus; label: string }[] = [
  { v: 'ok', label: 'Pass' },
  { v: 'obs', label: 'Observe' },
  { v: 'fail', label: 'Fail' },
]

interface Check {
  section: string
  label: string
  key: string
}

export default function RunAudit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const qc = useQueryClient()
  const [marks, setMarks] = useState<Record<string, ItemStatus>>({})

  const q = useQuery({ queryKey: ['eng', 'audit', id], queryFn: () => audit.get(id), enabled: !!id })

  const checks = useMemo<Check[]>(() => {
    const sections = q.data?.sections ?? []
    return sections.flatMap((s) => {
      const labels = CHECKLISTS[s.name] ?? GENERIC
      return labels.map((label) => ({ section: s.name, label, key: `${s.name}|${label}` }))
    })
  }, [q.data])

  const done = Object.keys(marks).length
  const total = checks.length
  const allDone = total > 0 && done === total

  const submit = useMutation({
    mutationFn: async () => {
      const bySection = new Map<string, AuditSectionItem[]>()
      for (const ch of checks) {
        const status = marks[ch.key]
        if (!status) continue
        const arr = bySection.get(ch.section) ?? []
        arr.push({ label: ch.label, status })
        bySection.set(ch.section, arr)
      }
      // 1. Upsert each section's marked checklist (backend scores it).
      for (const [name, items] of bySection) {
        await audit.upsertSection(id, { name, items })
      }
      // 2. Each FAIL becomes a finding the owner will see.
      for (const ch of checks) {
        if (marks[ch.key] === 'fail') {
          await audit.addFinding(id, {
            title: ch.label,
            severity: 'major',
            location: ch.section,
            note: `Marked fail during the ${ch.section.toLowerCase()} inspection.`,
          })
        }
      }
      // 3. Finalize → overall score + completed.
      return audit.score(id)
    },
    onSuccess: (detail) => {
      void qc.invalidateQueries({ queryKey: ['eng', 'audits'] })
      void qc.invalidateQueries({ queryKey: ['eng', 'audit', id] })
      Alert.alert('✓', `Audit submitted · score ${detail.score ?? '—'} sent to the owner.`)
      router.back()
    },
    onError: () => Alert.alert('•', 'Could not submit the audit. Please try again.'),
  })

  if (q.isLoading) {
    return <Pad><LoadingBlock /></Pad>
  }
  if (q.error || !q.data) {
    return (
      <Pad>
        <ErrorBlock message="Could not load this audit." retryLabel="Try again" onRetry={() => void q.refetch()} />
      </Pad>
    )
  }

  let lastSection: string | null = null
  return (
    <Pad>
      <SubHeader title="Run audit" sub={`${done}/${total} checks`} onBack={() => router.back()} />

      {/* progress */}
      <View style={{ height: 8, borderRadius: 9999, backgroundColor: theme.colors.paper, overflow: 'hidden' }}>
        <View
          style={{
            height: 8,
            width: total ? `${(done / total) * 100}%` : '0%',
            backgroundColor: theme.colors.ok,
            borderRadius: 9999,
          }}
        />
      </View>

      {checks.map((ch) => {
        const head = ch.section !== lastSection
        lastSection = ch.section
        const mark = marks[ch.key]
        return (
          <View key={ch.key}>
            {head ? (
              <Small muted style={{ letterSpacing: 1, marginTop: SPACE.sm, marginBottom: 2 }}>
                {ch.section.toUpperCase()}
              </Small>
            ) : null}
            <Card style={{ gap: SPACE.md }}>
              <Body>{ch.label}</Body>
              <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                {MARKS.map((o) => {
                  const on = mark === o.v
                  const tint = theme.colors[ITEM_META[o.v].status]
                  return (
                    <Pressable
                      key={o.v}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setMarks((m) => ({ ...m, [ch.key]: o.v }))}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: theme.radii.control,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: on ? tint : theme.colors.card,
                        borderWidth: 1,
                        borderColor: on ? tint : theme.colors.line,
                      }}
                    >
                      <Ionicons
                        name={ITEM_META[o.v].icon}
                        size={15}
                        color={on ? theme.colors.onAccent : tint}
                      />
                      <Small style={{ color: on ? theme.colors.onAccent : tint, fontWeight: '600' }}>
                        {o.label}
                      </Small>
                    </Pressable>
                  )
                })}
              </View>
            </Card>
          </View>
        )
      })}

      <Button
        title={allDone ? 'Submit audit' : `Mark all ${total} checks (${done} done)`}
        variant="accent"
        block
        size="lg"
        disabled={!allDone || submit.isPending}
        onPress={() => submit.mutate()}
        style={{ marginTop: SPACE.sm }}
      />
    </Pad>
  )
}

function Pad({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: SPACE.gutter, paddingTop: insets.top + SPACE.sm, paddingBottom: SPACE.xxl, gap: SPACE.md }}
    >
      {children}
    </ScrollView>
  )
}
