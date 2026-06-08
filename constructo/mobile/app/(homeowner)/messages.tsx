/**
 * Homeowner Messages inbox (doc 18 Phase 3) — her private builder channel
 * (pinned at top) plus any group threads she's in. Daylight theme: warm paper
 * canvas, soft ChannelRows, a calm loading + a gentle note when she has no
 * groups (the builder channel is always present).
 *
 * Her channel is get-or-created on mount via `chatApi.homeownerChannel(siteId)`
 * so the row is live even before her first message; if `siteId` isn't set, we
 * fall back to the existing `homeowner`-kind row from `conversations()` so the
 * channel still shows. We dedupe it against `conversations()` so it never appears
 * twice. Self-themed by the (homeowner) layout's Daylight ThemeProvider.
 */
import { RefreshControl, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, FLOATING_NAV_CLEARANCE, H1, Small } from '../../src/ui'
import { useAuth } from '../../src/auth/AuthContext'
import { chatApi, type ConversationSummary } from '../../src/api/chat'
import { ChannelRow } from './_messages_components'

const STR = {
  en: {
    title: 'Messages',
    subtitle: 'Talk to your builder and site team',
    builderTitle: 'Your builder',
    noGroups: 'Your builder channel is always here. Group threads appear when your team adds you to one.',
    loading: 'Loading your messages…',
  },
  hi: {
    title: 'संदेश',
    subtitle: 'अपने बिल्डर और साइट टीम से बात करें',
    builderTitle: 'आपका बिल्डर',
    noGroups: 'आपका बिल्डर चैनल हमेशा यहाँ रहता है। ग्रुप चैट तब दिखेंगी जब टीम आपको किसी में जोड़े।',
    loading: 'आपके संदेश लोड हो रहे हैं…',
  },
} as const

export default function HomeownerMessagesInbox() {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { siteId } = useAuth()
  const t = STR[lang as 'en' | 'hi'] ?? STR.en

  // Get-or-create her builder channel so the row is live from first open.
  const channelQ = useQuery({
    queryKey: ['homeowner', 'channel', siteId],
    queryFn: () => chatApi.homeownerChannel(siteId!),
    enabled: !!siteId,
    staleTime: Infinity, // the builder channel is created once; never re-POST on tab revisit
  })

  const convQ = useQuery({
    queryKey: ['homeowner', 'conversations'],
    queryFn: () => chatApi.conversations(),
    refetchInterval: 15000,
  })

  const conversations = convQ.data ?? []
  // Builder channel: prefer the get-or-created channel (when `siteId` is known),
  // otherwise fall back to the existing `homeowner`-kind conversation that
  // `conversations()` already returns — so her channel shows regardless of whether
  // `siteId` is set in auth state (e.g. a non-join-code login path).
  const builder =
    channelQ.data ?? conversations.find((conv) => conv.kind === 'homeowner') ?? null

  // Her groups only (the builder channel is rendered from `builder`, pinned).
  // Dedupe the builder row by id in case it also appears in conversations().
  const groups = conversations.filter((conv) => conv.kind === 'group' && conv.id !== builder?.id)

  const open = (conv: ConversationSummary, title: string) =>
    router.push({
      pathname: '/(homeowner)/messages/[id]',
      params: {
        id: conv.id,
        kind: conv.kind,
        title,
        siteName: conv.site_name ?? '',
      },
    })

  // Only show the spinner when there's nothing to show yet — keep a cached
  // builder row visible during a background conversations refetch.
  const showSpinner = (channelQ.isLoading && !!siteId) || (convQ.isLoading && !builder)
  const refreshing = channelQ.isRefetching || convQ.isRefetching
  const onRefresh = () => {
    void channelQ.refetch()
    void convQ.refetch()
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingHorizontal: SPACE.gutter,
        paddingTop: SPACE.xl,
        paddingBottom: FLOATING_NAV_CLEARANCE,
        gap: SPACE.lg,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
      }
    >
      <View style={{ gap: SPACE.xs }}>
        <H1>{t.title}</H1>
        <Body muted>{t.subtitle}</Body>
      </View>

      {showSpinner ? (
        <Small muted style={{ paddingVertical: SPACE.xl }}>
          {t.loading}
        </Small>
      ) : (
        <View style={{ gap: SPACE.md }}>
          {/* Her builder channel — pinned at top, always present. */}
          {builder ? (
            <ChannelRow
              conversation={builder}
              siteName={builder.site_name}
              onPress={() => open(builder, t.builderTitle)}
            />
          ) : null}

          {/* Group threads, if any. */}
          {groups.map((conv) => (
            <ChannelRow
              key={conv.id}
              conversation={conv}
              onPress={() => open(conv, conv.title ?? '')}
            />
          ))}

          {/* Calm note when she has no groups (builder channel always shows). */}
          {groups.length === 0 ? (
            <Small muted style={{ paddingTop: SPACE.sm }}>
              {t.noGroups}
            </Small>
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}
