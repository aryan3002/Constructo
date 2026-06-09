/**
 * ChatComposer — the theme-aware message composer for the unified chat kit. A
 * reply banner (quote-reply), an optional row of leading actions (camera, …), a
 * multiline input, and a Send button — plus a `belowComposer` slot for the
 * voice recorder / smart-suggest chip. Each screen passes only the actions it
 * supports, so the homeowner thread gets text+reply today and the supervisor adds
 * camera/voice/capture. Send uses `theme.colors.accent` (sage on daylight, amber
 * on blueprint).
 */
import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useT } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'
import { Mono, Small } from '../ui'

const STR = {
  en: { replyingTo: 'Replying to', cancel: 'Cancel reply' },
  hi: { replyingTo: 'जवाब', cancel: 'रद्द करें' },
} as const

export function ChatComposer({
  value,
  onChange,
  onSend,
  sending,
  placeholder,
  sendAccessibilityLabel,
  reply,
  onCancelReply,
  leadingActions,
  belowComposer,
  insetsBottom,
}: {
  value: string
  onChange: (s: string) => void
  onSend: () => void
  sending: boolean
  placeholder: string
  sendAccessibilityLabel: string
  /** Quote-reply target snippet, or null. */
  reply?: { snippet: string } | null
  onCancelReply?: () => void
  /** Buttons left of the input (e.g. camera). */
  leadingActions?: ReactNode
  /** Slot under the input row (e.g. voice recorder, suggest chip). */
  belowComposer?: ReactNode
  insetsBottom: number
}) {
  const { lang } = useT()
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang as 'en' | 'hi'] ?? STR.en
  const canSend = !!value.trim() && !sending

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.card,
        paddingBottom: insetsBottom + SPACE.sm,
      }}
    >
      {/* Reply banner */}
      {reply ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.gutter,
            paddingTop: SPACE.sm,
          }}
        >
          <View
            style={{
              flex: 1,
              borderLeftWidth: 3,
              borderLeftColor: c.accent,
              paddingLeft: SPACE.sm,
            }}
          >
            <Mono muted style={{ fontSize: 11 }}>
              {t.replyingTo}
            </Mono>
            <Small numberOfLines={1} style={{ color: c.text }}>
              {reply.snippet}
            </Small>
          </View>
          <Pressable
            onPress={onCancelReply}
            accessibilityRole="button"
            accessibilityLabel={t.cancel}
            hitSlop={10}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={18} color={c.textMute} />
          </Pressable>
        </View>
      ) : null}

      {/* Input row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.gutter,
          paddingTop: SPACE.sm,
        }}
      >
        {leadingActions}
        <View
          style={{
            flex: 1,
            minHeight: TAP,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: theme.radii.card,
            backgroundColor: c.paper,
            paddingHorizontal: SPACE.lg,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={c.textMute}
            multiline
            style={{ maxHeight: 110, paddingVertical: SPACE.sm, color: c.text, fontSize: 16 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendAccessibilityLabel}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            {
              width: TAP,
              height: TAP,
              borderRadius: theme.radii.card,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !canSend ? 0.5 : 1,
              transform: [{ scale: pressed && canSend ? 0.96 : 1 }],
            },
            canSend ? theme.shadowCard : null,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <Feather name="arrow-up" size={22} color={c.onAccent} />
          )}
        </Pressable>
      </View>

      {belowComposer ? <View style={{ paddingHorizontal: SPACE.gutter }}>{belowComposer}</View> : null}
    </View>
  )
}
