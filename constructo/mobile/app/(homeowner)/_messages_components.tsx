/**
 * Home Room message primitives — the homeowner Messages tab, re-skinned to the
 * locked "Calm Cockpit" design system (Direction C · "Blend").
 *
 * These DO NOT reuse the Neev `MessageBubble` (it hardcodes amber). They
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
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, type Status } from '../../src/theme/tokens'
import {
  Body,
  Button,
  Card,
  Mono,
  Small,
  StatusPill,
  Title,
  useInputStyle,
} from '../../src/ui'
import type { ConversationSummary } from '../../src/api/chat'
import type { HomeownerDecision, Update } from '../../src/api/types'
import { delayStory, formatDayDelta, formatRupeeDelta, shortDate, updateMeta } from './_updates.util'
import type { DecisionAction, HomeRoomStrings } from './_home_room.util'

/** Amber-tint surface shared with the kit `DecisionCard` (a choice, never red). */
const AMBER_TINT = 'rgba(169,122,30,0.14)'
const AMBER_LINE = 'rgba(169,122,30,0.30)'

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

/**
 * A published Update, woven into her builder thread as a calm "letter" card
 * (Home Room). Status = colour + icon + word via `StatusPill`; a delay earns the
 * red treatment ONLY when it carries the full structured story (revised date +
 * reason + a measured impact) — a story-less delay degrades to a neutral tint
 * rather than fabricate alarm.
 */
export function HomeRoomUpdateCard({ update }: { update: Update }) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const story = delayStory(update)
  const meta = updateMeta(update.type, lang)
  // Honest tint: a delay without the full story is not red; 'mute' → calm quiet.
  const pillStatus: Status =
    update.type === 'delay' && !story ? 'info' : meta.status === 'mute' ? 'quiet' : meta.status
  const when = shortDate(update.published_at, lang)
  const impact = story
    ? [formatDayDelta(story.impactDays, lang), formatRupeeDelta(story.impactCost)]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
      <Card variant="letter">
        <View style={{ gap: SPACE.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACE.sm,
            }}
          >
            <StatusPill status={pillStatus} size="sm" label={meta.label} />
            {when ? <Mono muted>{when}</Mono> : null}
          </View>
          <Title>{update.title}</Title>
          {update.body ? <Body color={c.text}>{update.body}</Body> : null}
          {/* The structured delay story — the only place a date/impact appears. */}
          {story ? (
            <View
              style={{
                gap: 2,
                backgroundColor: c.paper,
                borderRadius: theme.radii.control,
                padding: SPACE.md,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                <Feather name="calendar" size={14} color={c.risk} />
                <Small color={c.risk}>{shortDate(story.revisedDate, lang)}</Small>
                {impact ? <Mono muted>{impact}</Mono> : null}
              </View>
              <Small muted>{story.reason}</Small>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  )
}

/**
 * A pending Decision, woven into her builder thread as the signature calm-amber
 * choice card with her actions IN PLACE: Approve (owners only — gated on
 * `canApprove`, mirroring the backend's owners-only-approve), Comment, and
 * Request a change. A non-owner sees Comment / Request a change only. Comment &
 * Request-a-change reveal an inline note; Approve is a single confident tap.
 */
export function HomeRoomDecisionCard({
  decision,
  canApprove,
  onRespond,
  str,
}: {
  decision: HomeownerDecision
  canApprove: boolean
  onRespond: (action: DecisionAction, note?: string) => Promise<void>
  str: HomeRoomStrings
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const inputStyle = useInputStyle()
  const [mode, setMode] = useState<null | 'comment' | 'request_change'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<DecisionAction | null>(null)

  const run = async (action: DecisionAction, withNote?: string) => {
    setBusy(action)
    try {
      await onRespond(action, withNote)
      setMode(null)
      setNote('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
      <View
        style={[
          {
            backgroundColor: AMBER_TINT,
            borderWidth: 1,
            borderColor: AMBER_LINE,
            borderRadius: theme.radii.card,
            padding: SPACE.lg,
            gap: SPACE.md,
          },
          theme.shadowCard,
        ]}
      >
        <StatusPill status="warn" size="sm" label={str.decisionEyebrow} uppercase />
        <Title>{decision.title}</Title>
        {decision.detail ? <Body color={c.text}>{decision.detail}</Body> : null}

        {mode ? (
          /* Inline note for Comment / Request-a-change. */
          <View style={{ gap: SPACE.sm }}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={str.notePlaceholder}
              placeholderTextColor={c.textMute}
              multiline
              style={[inputStyle, { minHeight: 72, paddingVertical: SPACE.sm, textAlignVertical: 'top' }]}
            />
            <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <Button
                title={str.send}
                size="md"
                loading={busy === mode}
                disabled={!note.trim()}
                onPress={() => void run(mode, note.trim())}
                style={{ flex: 1 }}
              />
              <Button
                title={str.cancel}
                variant="ghost"
                size="md"
                onPress={() => {
                  setMode(null)
                  setNote('')
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {canApprove ? (
              <Button
                title={str.approve}
                size="md"
                loading={busy === 'approve'}
                leading={<Feather name="check" size={16} color={c.onAccent} />}
                onPress={() => void run('approve')}
              />
            ) : null}
            <Button
              title={str.comment}
              variant="secondary"
              size="md"
              onPress={() => setMode('comment')}
            />
            <Button
              title={str.requestChange}
              variant="ghost"
              size="md"
              onPress={() => setMode('request_change')}
            />
          </View>
        )}
      </View>
    </View>
  )
}
