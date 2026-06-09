/**
 * Home Room message primitives — the homeowner Messages tab, re-skinned to the
 * locked "Calm Cockpit" design system (Direction C · "Blend").
 *
 * These DO NOT reuse the Blueprint `MessageBubble` (it hardcodes amber). They
 * are calm, warm, residential bubbles + inbox rows on the Daylight palette:
 *   - the homeowner's OWN message sits on a soft SAGE tint (green-tint as a
 *     calm solid, never the loud sage fill) with ink text;
 *   - the builder / team message sits on the warm SURFACE card (hairline +
 *     soft "lifted paper" shadow);
 *   - bubbles use the chat bubble radius (~19 — the skill's `--radius-bubble`),
 *     with a gentle spoken-bubble tail on the sender's side;
 *   - real-photo attachments render through the kit `PhotoTile` (real photos
 *     only — never an AI/3D render);
 *   - timestamps are muted IBM Plex Mono; status = colour + icon + word;
 *   - bilingual EN/HI via the active language.
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE } from '../../src/theme/tokens'
import { Body, Mono, Small } from '../../src/ui'
import type { ConversationSummary } from '../../src/api/chat'

const STR = {
  en: {
    builder: 'Your builder',
    group: 'Group',
    unread: (n: number) => `${n} new`,
    photoCaption: 'Photo from your site team',
  },
  hi: {
    builder: 'आपका बिल्डर',
    group: 'ग्रुप',
    unread: (n: number) => `${n} नए`,
    photoCaption: 'आपकी साइट टीम से फ़ोटो',
  },
} as const

/** An inbox row — her builder channel (pinned) or a group. ≥48px tap (64
 *  minHeight), warm surface card, Mono recency, an unread pill (sage dot +
 *  count — shape + colour, never colour alone). */
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
          transform: [{ scale: pressed ? 0.99 : 1 }],
          opacity: pressed ? 0.94 : 1,
        },
        theme.shadowCard,
      ]}
    >
      {/* Leading glyph chip — colour + icon (never a bare initial). A house for
          her builder; people for a group thread. */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isBuilder ? AP.chip : c.secondaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather
          name={isBuilder ? 'home' : 'users'}
          size={20}
          color={isBuilder ? AP.onChip : c.secondary}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Body style={{ flex: 0, fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Body>
          {!isBuilder ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: c.secondaryContainer,
              }}
            >
              <Feather name="users" size={11} color={c.secondary} />
              <Small style={{ color: c.secondary, fontWeight: '600' }}>{t.group}</Small>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Small muted numberOfLines={1}>
            {subtitle}
          </Small>
        ) : null}
      </View>

      {/* Trailing: Mono recency + an unread pill (sage dot + count — shape,
          never colour alone). */}
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
              backgroundColor: AP.chip,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
            <Small style={{ color: AP.onChip, fontWeight: '700' }}>{t.unread(unread)}</Small>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
