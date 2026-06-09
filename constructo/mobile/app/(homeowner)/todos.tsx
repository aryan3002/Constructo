/**
 * Her To-dos (Slice C) — the homeowner's own action items for her site. She can
 * add one here or make one from a message in her builder chat (long-press →
 * "Make a to-do"). She sees ONLY her own to-dos, never the crew's internal list
 * (the backend scopes her to items she created or is assigned). Daylight theme.
 */
import { useState } from 'react'
import { Alert, Pressable, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { actionItemsApi, type ActionItem } from '../../src/api/actionItems'
import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../src/theme/tokens'
import { Body, Button, Display, QuietState, Screen, Small, useInputStyle } from '../../src/ui'

const STR = {
  en: {
    title: 'To-dos',
    subtitle: 'Things you want done — yours to track.',
    add: 'Add a to-do',
    placeholder: 'What needs doing?',
    loading: 'Loading your to-dos…',
    emptyTitle: 'Nothing on your list',
    empty: 'Add a to-do, or make one from a message in your builder chat.',
    err: 'We couldn’t load your to-dos just now.',
    retry: 'Try again',
    addErr: 'We couldn’t add that just now.',
    back: 'Back',
    done: 'Done',
  },
  hi: {
    title: 'काम',
    subtitle: 'जो आप करवाना चाहते हैं — आपके हाथ में।',
    add: 'एक काम जोड़ें',
    placeholder: 'क्या करना है?',
    loading: 'आपके काम लोड हो रहे हैं…',
    emptyTitle: 'सूची खाली है',
    empty: 'एक काम जोड़ें, या अपने बिल्डर चैट के किसी संदेश से बनाएं।',
    err: 'अभी आपके काम लोड नहीं हो सके।',
    retry: 'फिर से कोशिश करें',
    addErr: 'अभी जोड़ नहीं सके।',
    back: 'वापस',
    done: 'पूरा',
  },
} as const

export default function HomeownerTodos() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const router = useRouter()
  const qc = useQueryClient()
  const { siteId } = useAuth()
  const inputStyle = useInputStyle()
  const [draft, setDraft] = useState('')

  const key = ['homeowner', 'todos', siteId]
  const q = useQuery({
    queryKey: key,
    queryFn: () => actionItemsApi.list(siteId!),
    enabled: !!siteId,
  })
  const items = q.data ?? []
  const openItems = items.filter((i) => i.status === 'open')
  const doneItems = items.filter((i) => i.status === 'done')

  const toggle = useMutation({
    mutationFn: (it: ActionItem) =>
      actionItemsApi.update(it.id, { status: it.status === 'done' ? 'open' : 'done' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  })
  const add = useMutation({
    mutationFn: (title: string) => actionItemsApi.create({ site_id: siteId!, title }),
    onSuccess: () => {
      setDraft('')
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: () => Alert.alert(t.add, t.addErr),
  })

  const row = (it: ActionItem) => (
    <Pressable
      key={it.id}
      onPress={() => toggle.mutate(it)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: it.status === 'done' }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TAP }}
    >
      <Feather
        name={it.status === 'done' ? 'check-circle' : 'circle'}
        size={22}
        color={it.status === 'done' ? c.ok : c.textMute}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Body
          style={{
            color: it.status === 'done' ? c.textMute : c.text,
            textDecorationLine: it.status === 'done' ? 'line-through' : 'none',
          }}
        >
          {it.title}
        </Body>
        {it.created_by_ai ? (
          <Small style={{ color: c.accentDeep }}>⚡ Nivaan</Small>
        ) : null}
      </View>
    </Pressable>
  )

  return (
    <Screen floatingNav>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t.back}
        hitSlop={10}
        style={{ width: 40, height: 40, justifyContent: 'center', marginBottom: SPACE.xs }}
      >
        <Feather name="chevron-left" size={26} color={c.text} />
      </Pressable>

      <View style={{ gap: 2 }}>
        <Display>{t.title}</Display>
        <Small muted>{t.subtitle}</Small>
      </View>

      {/* Add */}
      <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t.placeholder}
          placeholderTextColor={c.textMute}
          style={inputStyle}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (draft.trim()) add.mutate(draft.trim())
          }}
        />
        <Button
          title={t.add}
          loading={add.isPending}
          disabled={!draft.trim()}
          onPress={() => add.mutate(draft.trim())}
        />
      </View>

      {q.isLoading ? (
        <Small muted style={{ paddingVertical: SPACE.lg }}>
          {t.loading}
        </Small>
      ) : q.isError ? (
        <View style={{ gap: SPACE.sm, paddingVertical: SPACE.lg }}>
          <Small muted>{t.err}</Small>
          <Button title={t.retry} variant="secondary" onPress={() => void q.refetch()} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ paddingTop: SPACE.xl }}>
          <QuietState icon="check-circle" title={t.emptyTitle} message={t.empty} />
        </View>
      ) : (
        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          {openItems.map(row)}
          {doneItems.length ? (
            <View style={{ marginTop: SPACE.lg, gap: SPACE.sm }}>
              <Small muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.done}
              </Small>
              {doneItems.map(row)}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  )
}
