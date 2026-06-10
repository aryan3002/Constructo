/**
 * Action Items dashboard (Phase 1.6 manual + 2.7 AI-detected) — the site's
 * to-dos so nothing falls through. Blueprint theme. Open items first (status
 * spine + due date + "Nivaan" badge for AI-detected ones), then completed.
 * Tap the circle to complete/reopen; "+" adds one. Distinct from approvals
 * (Tasks/Asks) — this is do-a-task, not approve-an-act.
 *
 * Reached as a pushed screen (href:null) with a `site_id` param — from the crew
 * chat header "To-dos" chip.
 */
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { Body, BodyStrong, Button, EmptyState, EvidenceChip, Eyebrow, Mono, Small, StatusPill } from '../../../src/ui'
import { actionItemsApi, type ActionItem } from '../../../src/api/actionItems'
import { SPACE } from './_components'

const STR = {
  en: {
    title: 'To-dos',
    sub: 'Nothing falls through',
    empty: 'No to-dos yet. Add one, or Nivaan will spot tasks in the chat.',
    open: 'Open',
    done: 'Done',
    nivaan: 'Nivaan',
    add: 'Add a to-do',
    placeholder: 'What needs doing?',
    save: 'Add',
    cancel: 'Cancel',
    err: 'Could not load to-dos.',
    due: 'Due',
    back: 'Back',
  },
  hi: {
    title: 'काम',
    sub: 'कुछ छूटे नहीं',
    empty: 'अभी कोई काम नहीं। एक जोड़ें, या निवान चैट में काम पहचान लेगा।',
    open: 'बाकी',
    done: 'पूरा',
    nivaan: 'निवान',
    add: 'काम जोड़ें',
    placeholder: 'क्या करना है?',
    save: 'जोड़ें',
    cancel: 'रद्द',
    err: 'काम लोड नहीं हुए।',
    due: 'तक',
    back: 'वापस',
  },
} as const

function dueLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export default function ActionItems() {
  const { lang } = useT()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { site_id } = useLocalSearchParams<{ site_id: string }>()

  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  const key = ['action-items', site_id]
  const q = useQuery({
    queryKey: key,
    queryFn: () => actionItemsApi.list(site_id!),
    enabled: !!site_id,
  })

  const toggle = useMutation({
    mutationFn: (it: ActionItem) =>
      actionItemsApi.update(it.id, { status: it.status === 'done' ? 'open' : 'done' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  })
  const create = useMutation({
    mutationFn: (title: string) => actionItemsApi.create({ site_id: site_id!, title }),
    onSuccess: () => {
      setText('')
      setAdding(false)
      void qc.invalidateQueries({ queryKey: key })
    },
  })

  const items = q.data ?? []
  const open = items.filter((i) => i.status === 'open')
  const done = items.filter((i) => i.status === 'done')

  const row = (it: ActionItem) => {
    const isDone = it.status === 'done'
    return (
      <View
        key={it.id}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: SPACE.md,
          paddingVertical: SPACE.md,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone }}
          onPress={() => toggle.mutate(it)}
          hitSlop={8}
          style={{ paddingTop: 1 }}
        >
          <Feather
            name={isDone ? 'check-circle' : 'circle'}
            size={24}
            color={isDone ? c.ok : c.textMute}
          />
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <Body style={{ color: isDone ? c.textMute : c.text, textDecorationLine: isDone ? 'line-through' : 'none' }}>
            {it.title}
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            {/* AI-detected to-do: an EvidenceChip-style marker ("Nivaan"). */}
            {it.created_by_ai ? (
              <EvidenceChip kind="message" label={t.nivaan} />
            ) : null}
            {it.due_on ? (
              <Mono style={{ fontSize: 12, color: c.textMute }}>
                {t.due} {dueLabel(it.due_on)}
              </Mono>
            ) : null}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + SPACE.sm,
          paddingBottom: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          backgroundColor: c.card,
          borderBottomColor: c.line,
          borderBottomWidth: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
        }}
      >
        <Pressable onPress={() => router.back()} accessibilityLabel={t.back} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <BodyStrong>{t.title}</BodyStrong>
          <Small style={{ color: c.textMute }}>{t.sub}</Small>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.add}
          onPress={() => setAdding(true)}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 9999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.accentDeep : c.accent,
          })}
        >
          <Feather name="plus" size={22} color={c.onAccent} />
        </Pressable>
      </View>

      {q.isLoading ? (
        <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : q.isError ? (
        <View style={{ padding: SPACE.lg }}>
          <StatusPill status="risk" label={t.err} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState variant="empty" title={t.empty} />
      ) : (
        <View style={{ paddingHorizontal: SPACE.lg }}>
          {open.length > 0 ? (
            <>
              <Eyebrow style={{ marginTop: SPACE.md }}>{t.open}</Eyebrow>
              {open.map(row)}
            </>
          ) : null}
          {done.length > 0 ? (
            <>
              <Eyebrow style={{ marginTop: SPACE.lg }}>{t.done}</Eyebrow>
              {done.map(row)}
            </>
          ) : null}
        </View>
      )}

      {/* Add modal */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,23,28,0.45)' }}
        >
          <View
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: theme.radii.sheet,
              borderTopRightRadius: theme.radii.sheet,
              padding: SPACE.lg,
              paddingBottom: insets.bottom + SPACE.lg,
              gap: SPACE.md,
            }}
          >
            <BodyStrong>{t.add}</BodyStrong>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t.placeholder}
              placeholderTextColor={c.textMute}
              autoFocus
              multiline
              style={{
                minHeight: 64,
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: theme.radii.control,
                backgroundColor: c.paper,
                padding: SPACE.md,
                color: c.text,
                fontSize: 16,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Button
                title={t.cancel}
                variant="secondary"
                onPress={() => setAdding(false)}
                style={{ flex: 1 }}
              />
              {/* "Add" = the single affirmative: accent (marigold). */}
              <Button
                title={t.save}
                variant="accent"
                disabled={!text.trim()}
                loading={create.isPending}
                onPress={() => create.mutate(text.trim())}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}
