/**
 * Home Room inbox — the homeowner Messages tab, re-skinned to the locked
 * "Calm Cockpit" design system (Direction C · "Blend"). Her private builder
 * channel (pinned at top) plus any group threads she's in, on the warm-sand
 * canvas.
 *
 * Calm Cockpit gives the inbox a single, glanceable split (handoff §5 Inbox):
 *   - NEEDS YOU   — threads with unread messages waiting on her, amber kicker.
 *   - GOOD TO KNOW — everything quiet, a calm clay kicker.
 * When nothing is waiting, the whole thing collapses to a designed QuietState
 * ("All caught up") — empty is GOOD NEWS, said out loud, never a blank screen.
 * The builder channel is ALWAYS present (in whichever group its unread state
 * places it), so she is never one tap from her team.
 *
 * Her channel is get-or-created on mount via `chatApi.homeownerChannel(siteId)`
 * so the row is live even before her first message; if `siteId` isn't set, we
 * fall back to the existing `homeowner`-kind row from `conversations()` so the
 * channel still shows. We dedupe it against `conversations()` so it never appears
 * twice. Self-themed by the (homeowner) layout's Daylight ThemeProvider.
 */
import { RefreshControl, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, Display, Eyebrow, FLOATING_NAV_CLEARANCE, QuietState, Small, StatusPill } from '../../src/ui'
import { useAuth } from '../../src/auth/AuthContext'
import { chatApi, type ConversationSummary } from '../../src/api/chat'
import { ChannelRow } from './_messages_components'

const STR = {
  en: {
    title: 'Messages',
    subtitle: 'Talk to your builder and site team',
    builderTitle: 'Your builder',
    needsYou: 'Needs you',
    goodToKnow: 'Good to know',
    waitingPill: (n: number) => `${n} waiting`,
    allCaughtUpTitle: 'All caught up',
    allCaughtUpBody: 'Nothing is waiting on you. Your builder channel is always here.',
    noGroups: 'Group threads appear here when your team adds you to one.',
    loading: 'Loading your messages…',
  },
  hi: {
    title: 'संदेश',
    subtitle: 'अपने बिल्डर और साइट टीम से बात करें',
    builderTitle: 'आपका बिल्डर',
    needsYou: 'आपकी ज़रूरत',
    goodToKnow: 'जानने योग्य',
    waitingPill: (n: number) => `${n} प्रतीक्षित`,
    allCaughtUpTitle: 'सब पढ़ लिया',
    allCaughtUpBody: 'आपकी कोई बात बाकी नहीं। आपका बिल्डर चैनल हमेशा यहाँ है।',
    noGroups: 'ग्रुप चैट तब यहाँ दिखेंगी जब टीम आपको किसी में जोड़े।',
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

  // Every thread she has, with the builder channel pinned first within its split.
  const allThreads: ConversationSummary[] = builder ? [builder, ...groups] : [...groups]

  // Calm Cockpit split (handoff §5): waiting-on-her vs everything quiet. Pinning
  // is preserved by keeping the builder first in `allThreads` before the split.
  const needsYou = allThreads.filter((conv) => conv.unread_count > 0)
  const goodToKnow = allThreads.filter((conv) => conv.unread_count === 0)
  const waitingTotal = needsYou.reduce((sum, conv) => sum + conv.unread_count, 0)

  const open = (conv: ConversationSummary, title: string) =>
    router.push({
      pathname: '/(homeowner)/messages/[id]',
      params: {
        id: conv.id,
        kind: conv.kind,
        title,
        siteName: conv.site_name ?? '',
        // Her builder channel's site → the thread weaves in that site's updates
        // & decisions as inline cards (the Home Room). Empty for a group thread.
        siteId: conv.site_id ?? '',
      },
    })

  const rowTitle = (conv: ConversationSummary) =>
    conv.kind === 'homeowner' ? t.builderTitle : conv.title ?? ''

  const renderRow = (conv: ConversationSummary) => (
    <ChannelRow
      key={conv.id}
      conversation={conv}
      siteName={conv.kind === 'homeowner' ? conv.site_name : undefined}
      onPress={() => open(conv, rowTitle(conv))}
    />
  )

  // Only show the spinner when there's nothing to show yet — keep a cached
  // builder row visible during a background conversations refetch.
  const showSpinner = (channelQ.isLoading && !!siteId) || (convQ.isLoading && !builder)
  const refreshing = channelQ.isRefetching || convQ.isRefetching
  const onRefresh = () => {
    void channelQ.refetch()
    void convQ.refetch()
  }

  // "All caught up" — nothing waiting AND nothing in the quiet list either
  // (i.e. she has only the builder channel and it's read).
  const everythingQuiet = needsYou.length === 0
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingHorizontal: SPACE.gutter,
        paddingTop: insets.top + SPACE.md,
        paddingBottom: insets.bottom + FLOATING_NAV_CLEARANCE,
        gap: SPACE.xl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.accent}
          colors={[c.accent]}
        />
      }
    >
      <View style={{ gap: SPACE.sm }}>
        <Display>{t.title}</Display>
        <Body muted>{t.subtitle}</Body>
        {/* Participant summary bar — a calm warm-tinted strip showing who's
            in the conversation, matching the prototype's header feel.
            Only shown when there's a live builder channel. */}
        {builder ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              backgroundColor: AP.chip,
              borderRadius: theme.radii.chip,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }} />
            <Small style={{ color: AP.onChip, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {lang === 'hi' ? 'साइट टीम · आप · सह-मालिक' : 'Site team · You · Co-owner'}
            </Small>
            <Feather name="chevron-right" size={14} color={AP.onChip} />
          </View>
        ) : null}
      </View>

      {showSpinner ? (
        <Small muted style={{ paddingVertical: SPACE.xl }}>
          {t.loading}
        </Small>
      ) : (
        <>
          {/* ---- NEEDS YOU — threads waiting on her (amber kicker + count). ---- */}
          {needsYou.length > 0 ? (
            <View style={{ gap: SPACE.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Eyebrow style={{ color: theme.colors.warn }}>{t.needsYou}</Eyebrow>
                <StatusPill status="warn" label={t.waitingPill(waitingTotal)} size="sm" />
              </View>
              {needsYou.map(renderRow)}
            </View>
          ) : null}

          {/* ---- GOOD TO KNOW — quiet threads (calm clay kicker). When the only
                  quiet thread is the read builder channel, we still show it so
                  she is one tap from her team. ---- */}
          {everythingQuiet ? (
            // Nothing waiting: lead with the designed "All caught up" reassurance,
            // then keep the (quiet) threads below it so the team is reachable.
            <QuietState
              icon="check-circle"
              title={t.allCaughtUpTitle}
              message={t.allCaughtUpBody}
            />
          ) : null}

          {goodToKnow.length > 0 ? (
            <View style={{ gap: SPACE.md }}>
              <Eyebrow>{t.goodToKnow}</Eyebrow>
              {goodToKnow.map(renderRow)}
            </View>
          ) : null}

          {/* Calm note when she has no groups (builder channel always shows). */}
          {groups.length === 0 && !everythingQuiet ? (
            <Small muted>{t.noGroups}</Small>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}
