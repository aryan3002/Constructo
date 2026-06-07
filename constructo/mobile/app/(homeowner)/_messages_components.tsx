/**
 * Daylight message primitives (doc 18 Phase 3) — the homeowner Messages tab.
 *
 * These DO NOT reuse the Blueprint `MessageBubble` (it hardcodes amber). They
 * are calm, warm, residential bubbles + inbox rows on the Daylight palette:
 * Calm Pine for her own messages, soft white cards (hairline + diffuse shadow)
 * for the builder's, 16px radius, Mono muted timestamps, bilingual EN/HI.
 */
import { Image, Pressable, View } from 'react-native'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { SPACE } from '../../src/theme/tokens'
import { Body, Mono, Small } from '../../src/ui'
import type { ConversationSummary } from '../../src/api/chat'

const STR = {
  en: {
    builder: 'Your builder',
    group: 'Group',
    unread: (n: number) => `${n} new`,
  },
  hi: {
    builder: 'आपका बिल्डर',
    group: 'ग्रुप',
    unread: (n: number) => `${n} नए`,
  },
} as const

/** A single Daylight chat bubble. `mine` (the homeowner) right-aligns on Calm
 *  Pine with white text; the builder's left-aligns on a soft white card. */
export function DaylightBubble({
  body,
  mine,
  timestamp,
  attachmentUrl,
}: {
  body: string | null
  mine: boolean
  timestamp: string
  attachmentUrl?: string | null
}) {
  const { theme } = useTheme()
  const c = theme.colors

  return (
    <View
      style={{
        alignItems: mine ? 'flex-end' : 'flex-start',
        marginBottom: SPACE.md,
        paddingHorizontal: SPACE.gutter,
      }}
    >
      <View
        style={[
          {
            maxWidth: '86%',
            backgroundColor: mine ? c.accent : c.card,
            borderRadius: theme.radii.card,
            // A spoken-bubble tail on the sender's side.
            borderBottomRightRadius: mine ? 6 : theme.radii.card,
            borderBottomLeftRadius: mine ? theme.radii.card : 6,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
            gap: attachmentUrl ? SPACE.sm : 0,
          },
          mine
            ? null
            : { borderWidth: 1, borderColor: c.line, ...theme.shadowCard },
        ]}
      >
        {attachmentUrl ? (
          <Image
            source={{ uri: attachmentUrl }}
            accessibilityIgnoresInvertColors
            style={{
              width: 220,
              height: 160,
              borderRadius: theme.radii.chip,
              backgroundColor: c.paper,
            }}
            resizeMode="cover"
          />
        ) : null}
        {body ? <Body color={mine ? c.onAccent : c.text}>{body}</Body> : null}
      </View>
      <Mono
        muted
        style={{
          marginTop: 4,
          marginHorizontal: 4,
          color: c.textMute,
        }}
      >
        {timestamp}
      </Mono>
    </View>
  )
}

/** An inbox row — her builder channel (pinned) or a group. ≥48px tap (64
 *  minHeight), Daylight card, Mono recency, an unread dot + count (shape +
 *  color, never color alone). */
export function ChannelRow({
  conversation,
  siteName,
  onPress,
}: {
  conversation: ConversationSummary
  /** Override subtitle (the builder channel shows her site as subtitle). */
  siteName?: string | null
  onPress: () => void
}) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as 'en' | 'hi'] ?? STR.en

  const isBuilder = conversation.kind === 'homeowner'
  const title = isBuilder ? t.builder : conversation.title ?? t.group
  const subtitle = isBuilder ? siteName ?? conversation.site_name ?? '' : null
  const unread = conversation.unread_count

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: 64,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: c.line,
          opacity: pressed ? 0.92 : 1,
        },
        theme.shadowCard,
      ]}
    >
      {/* Leading glyph chip — Calm Pine for the builder, soft tint for groups */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isBuilder ? c.accent : c.accentWarm,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Body color={isBuilder ? c.onAccent : c.accentDeep} style={{ fontWeight: '700' }}>
          {(title || '?').trim().charAt(0).toUpperCase()}
        </Body>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Body style={{ flex: 0, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Body>
          {!isBuilder ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: theme.radii.chip,
                backgroundColor: c.accentWarm,
              }}
            >
              <Small style={{ color: c.accentDeep, fontWeight: '600' }}>{t.group}</Small>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Small muted numberOfLines={1}>
            {subtitle}
          </Small>
        ) : null}
      </View>

      {/* Trailing: Mono recency + an unread pill (dot + count — shape, not color) */}
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {conversation.last_message_at ? (
          <Mono muted style={{ color: c.textMute }}>
            {new Date(conversation.last_message_at).toLocaleDateString([], {
              day: 'numeric',
              month: 'short',
            })}
          </Mono>
        ) : null}
        {unread > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: theme.radii.pill,
              backgroundColor: c.accentWarm,
            }}
          >
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }}
            />
            <Small style={{ color: c.accentDeep, fontWeight: '700' }}>{t.unread(unread)}</Small>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
