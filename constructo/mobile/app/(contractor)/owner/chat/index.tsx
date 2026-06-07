/**
 * Owner Chat inbox (doc 18 Phase 1) — every accessible crew thread, most-recent
 * first, each as a ConversationRow. Tapping opens the conversation detail. The
 * unread badge clears once the thread is read (the detail advances the cursor +
 * invalidates this query). Reuses the site-keyed chat API — no schema change.
 *
 * Blueprint theme: warm paper canvas, ScrollView + RefreshControl, exceptions-
 * calm empty state (a single bilingual line, not a dump).
 */
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../../src/theme/tokens'
import { Body, BodyStrong, H1, Small } from '../../../../src/ui'
import { useAuth } from '../../../../src/auth/AuthContext'
import { chatApi, type ConversationSummary } from '../../../../src/api/chat'
import { ErrorBlock, LoadingBlock } from '../_components'
import { ConversationRow } from '../_chat_components'
import { NewGroupSheet } from '../_group_sheets'

const STR = {
  en: {
    title: 'Chat',
    subtitle: 'Your site crew threads',
    empty: 'No conversations yet. Your site crew threads will appear here.',
    err: 'We could not load your chats just now.',
    retry: 'Try again',
    newGroup: 'New group',
  },
  hi: {
    title: 'चैट',
    subtitle: 'आपकी साइट टीम चैट',
    empty: 'अभी कोई बातचीत नहीं। आपकी साइट टीम चैट यहाँ दिखेंगी।',
    err: 'अभी चैट लोड नहीं हो सकीं।',
    retry: 'फिर कोशिश करें',
    newGroup: 'नया ग्रुप',
  },
} as const

export default function OwnerChatInbox() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const { me } = useAuth()
  const t = STR[lang]

  // Only the owner can spin up a new group thread (admin server-side).
  const isOwner = me?.role === 'owner'
  const [newGroupOpen, setNewGroupOpen] = useState(false)

  const q = useQuery({
    queryKey: ['owner', 'conversations'],
    queryFn: () => chatApi.conversations(),
    refetchInterval: 15000,
  })

  const open = (c: ConversationSummary) =>
    router.push({
      pathname: '/(contractor)/owner/chat/[id]',
      params: {
        id: c.id,
        kind: c.kind,
        siteId: c.site_id ?? '',
        title: c.title ?? c.site_name ?? 'Site',
        hasHomeowner: c.has_homeowner ? '1' : '0',
      },
    })

  if (q.isLoading) {
    return (
      <Wrap>
        <H1>{t.title}</H1>
        <LoadingBlock />
      </Wrap>
    )
  }

  if (q.error) {
    return (
      <Wrap>
        <H1>{t.title}</H1>
        <ErrorBlock message={t.err} retryLabel={t.retry} onRetry={() => void q.refetch()} />
      </Wrap>
    )
  }

  const items = q.data ?? []

  return (
    <Wrap onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <H1>{t.title}</H1>
          <Body muted>{t.subtitle}</Body>
        </View>
        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.newGroup}
            onPress={() => setNewGroupOpen(true)}
            style={({ pressed }) => ({
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: SPACE.md,
              borderRadius: theme.radii.control,
              backgroundColor: theme.colors.accent,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Feather name="plus" size={16} color={theme.colors.onAccent} />
            <BodyStrong style={{ color: theme.colors.onAccent }}>{t.newGroup}</BodyStrong>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Small muted style={{ paddingVertical: SPACE.xl }}>{t.empty}</Small>
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {items.map((c) => (
            <ConversationRow key={c.id} conversation={c} onPress={() => open(c)} />
          ))}
        </View>
      )}

      <NewGroupSheet visible={newGroupOpen} onClose={() => setNewGroupOpen(false)} />
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
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  )
}
