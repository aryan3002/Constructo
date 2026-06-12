/**
 * Owner Chat inbox primitives (Neev theme). A `ConversationRow` is one
 * accessible crew thread in the inbox: an initials avatar, the thread title, a
 * "client present" cue when the homeowner is in the thread (shape + --info, never
 * color alone), a compact recency string, and an amber-fill unread badge.
 *
 * For `kind === 'homeowner'` rows the title reads "Homeowner · {site_name}" and a
 * Feather `user` glyph (shape + --info color, never color alone) marks it as the
 * curated homeowner channel so the owner can instantly tell it from the crew thread.
 *
 * Owner-branch-specific (NOT in src/ui) — built on the shared kit + tokens,
 * mirroring the surrounding `owner/_components.tsx` surfaces.
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, TAP } from '../../../src/theme/tokens'
import { BodyStrong, Micro, Mono, Small } from '../../../src/ui'
import type { ConversationSummary } from '../../../src/api/chat'

const STR = {
  en: {
    client: 'Client in this thread',
    site: 'Site',
    now: 'now',
    homeowner: 'Homeowner',
    companyWide: 'Company-wide',
  },
  hi: {
    client: 'इस चैट में ग्राहक',
    site: 'साइट',
    now: 'अभी',
    homeowner: 'गृहस्वामी',
    companyWide: 'कंपनी-व्यापी',
  },
} as const

/** Initials from a thread label — up to two leading letters (uppercased). */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '#'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Compact recency: now / 5m / 3h / 2d (else a short date), from an ISO time. */
function recency(iso: string | null, nowLabel: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const ms = Date.now() - t
  if (ms < 60_000) return nowLabel
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return `${Math.floor(day / 7)}w`
}

export function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary
  onPress: () => void
}) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang]

  const isHomeowner = conversation.kind === 'homeowner'
  // A group is company-wide when it has no site_id (null or absent).
  const isCompanyWideGroup =
    conversation.kind === 'group' && conversation.site_id == null
  const siteName = conversation.site_name ?? t.site
  // Homeowner rows get a distinct bilingual label: "Homeowner · {site_name}".
  // Other kinds fall back to the existing title → site_name → 'Site' logic.
  const label = isHomeowner
    ? `${t.homeowner} · ${siteName}`
    : (conversation.title ?? conversation.site_name ?? t.site)
  const when = recency(conversation.last_message_at, t.now)
  const unread = conversation.unread_count > 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.md,
          minHeight: 64,
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: c.line,
          paddingVertical: SPACE.md,
          paddingHorizontal: SPACE.lg,
          opacity: pressed ? 0.92 : 1,
        },
        theme.shadowCard,
      ]}
    >
      {/* Avatar: homeowner kind gets a person-glyph avatar (shape + --info color,
          never color alone); other kinds get the standard initials avatar. */}
      {isHomeowner ? (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.infoTint,
            borderWidth: 1,
            borderColor: c.info,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="user" size={20} color={c.info} />
        </View>
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.paper,
            borderWidth: 1,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BodyStrong style={{ color: c.accentDeep }}>{initials(label)}</BodyStrong>
        </View>
      )}

      {/* Title + contextual sub-label.
          For homeowner kind: suppress the generic "client present" cue — the
          homeowner IS the counterparty, the label already communicates this.
          For group/site: show the cue as before when has_homeowner is true.
          For company-wide groups: show a "Company-wide" tag (◈ shape + --info
          tint, never color alone) so owners can distinguish them at a glance. */}
      <View style={{ flex: 1, gap: 2 }}>
        <BodyStrong numberOfLines={1}>{label}</BodyStrong>
        {isCompanyWideGroup ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Micro style={{ color: c.info }}>◈</Micro>
            <Small style={{ color: c.info }} numberOfLines={1}>
              {t.companyWide}
            </Small>
          </View>
        ) : !isHomeowner && conversation.has_homeowner ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Micro style={{ color: c.info }}>◆</Micro>
            <Small style={{ color: c.info }} numberOfLines={1}>
              {t.client}
            </Small>
          </View>
        ) : null}
      </View>

      {/* Recency + unread badge */}
      <View style={{ alignItems: 'flex-end', gap: SPACE.xs }}>
        {when ? <Mono style={{ color: c.textMute, fontSize: 12 }}>{when}</Mono> : null}
        {unread ? (
          <View
            accessibilityLabel={`${conversation.unread_count} unread`}
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              paddingHorizontal: 6,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mono style={{ color: c.onAccent, fontSize: 12 }}>
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </Mono>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}
