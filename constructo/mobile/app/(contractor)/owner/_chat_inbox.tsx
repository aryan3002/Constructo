/**
 * Shared contractor Chat inbox (doc 18 Phase 1) — every accessible crew thread,
 * most-recent first, each as a ConversationRow. Reused by the owner, PM, and
 * architect chat tabs; each passes its OWN `detailHref` so tapping a row opens
 * the conversation detail WITHIN that role's tab group (a PM never lands in the
 * owner tab bar). The conversation list is access-scoped server-side; the unread
 * badge clears once a thread is read (the detail advances the cursor +
 * invalidates this query). Reuses the site-keyed chat API — no schema change.
 *
 * Neev theme: warm paper canvas, ScrollView + RefreshControl, exceptions-calm
 * empty state (a single bilingual line, not a dump).
 */
import { useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE } from '../../../src/theme/tokens'
import { Body, Button, EmptyState, H1 } from '../../../src/ui'
import { useAuth } from '../../../src/auth/AuthContext'
import { chatApi, type ConversationSummary } from '../../../src/api/chat'
import { ErrorBlock, LoadingBlock } from './_components'
import { ConversationRow } from './_chat_components'
import { NewGroupSheet } from './_group_sheets'

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

/**
 * @param detailHref the dynamic conversation-detail route for the CURRENT role's
 *   tab group, e.g. '/(contractor)/pm/chat/[id]'. Keeps each role in its own
 *   navigator instead of leaking into the owner tab bar.
 */
export function ChatInbox({ detailHref }: { detailHref: string }) {
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
      pathname: detailHref,
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
          <Button
            title={t.newGroup}
            variant="accent"
            size="md"
            onPress={() => setNewGroupOpen(true)}
          />
        ) : null}
      </View>

      {items.length === 0 ? (
        <EmptyState variant="empty" body={t.empty} />
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
