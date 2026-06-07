/**
 * Owner Chat inbox (doc 18 Phase 1) — every accessible crew thread, most-recent
 * first, each as a ConversationRow. Tapping opens the conversation detail. The
 * unread badge clears once the thread is read (the detail advances the cursor +
 * invalidates this query). Reuses the site-keyed chat API — no schema change.
 *
 * Blueprint theme: warm paper canvas, ScrollView + RefreshControl, exceptions-
 * calm empty state (a single bilingual line, not a dump).
 */
import { RefreshControl, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../../../src/i18n/I18nProvider'
import { useTheme } from '../../../../src/theme/ThemeProvider'
import { SPACE } from '../../../../src/theme/tokens'
import { Body, H1, Small } from '../../../../src/ui'
import { chatApi, type ConversationSummary } from '../../../../src/api/chat'
import { ErrorBlock, LoadingBlock } from '../_components'
import { ConversationRow } from '../_chat_components'

const STR = {
  en: {
    title: 'Chat',
    subtitle: 'Your site crew threads',
    empty: 'No conversations yet. Your site crew threads will appear here.',
    err: 'We could not load your chats just now.',
    retry: 'Try again',
  },
  hi: {
    title: 'चैट',
    subtitle: 'आपकी साइट टीम चैट',
    empty: 'अभी कोई बातचीत नहीं। आपकी साइट टीम चैट यहाँ दिखेंगी।',
    err: 'अभी चैट लोड नहीं हो सकीं।',
    retry: 'फिर कोशिश करें',
  },
} as const

export default function OwnerChatInbox() {
  const { lang } = useT()
  const { theme } = useTheme()
  const router = useRouter()
  const t = STR[lang]

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
      <View style={{ gap: SPACE.xs }}>
        <H1>{t.title}</H1>
        <Body muted>{t.subtitle}</Body>
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
