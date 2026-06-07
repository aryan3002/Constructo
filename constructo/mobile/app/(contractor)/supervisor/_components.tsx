/**
 * Local composite components for the Supervisor branch (Blueprint theme). These
 * are NOT in src/ui — they are role-specific compositions of the shared kit
 * (Button, Card, Typography, StatusDot) and live with the screens that use them.
 *
 * The hero is {@link CaptureBar}: a giant photo button + a hold-to-talk mic,
 * built for gloves/sun/one-thumb (≥56px targets). Capture beats forms for this
 * role, so this is photo/voice first; the "what is this?" tag is one tap.
 */
import { type ReactNode } from 'react'
import { ActivityIndicator, Platform, Pressable, UIManager, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP } from '../../../src/theme/tokens'
import { Body, BodyStrong, H2, Mono, Small, StatusDot } from '../../../src/ui'
import type { CaptureKind } from '../../../src/api/supervisor'

// CaptureCard + MessageBubble live in the shared chat module so the owner Chat
// screen can reuse them. supervisor chat.tsx still uses its own inline Pressable bubble.
export { CaptureCard, MessageBubble } from '../../../src/chat/MessageView'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// ---------------------------------------------------------------------------
// Shared state views (loading / empty / error) — reused across the three tabs.
// ---------------------------------------------------------------------------

export function Loading() {
  const { theme } = useTheme()
  return (
    <View style={{ paddingVertical: SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  )
}

export function CalmEmpty({ title, body }: { title: string; body?: string }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: theme.colors.line,
        padding: SPACE.xl,
        gap: SPACE.xs,
        alignItems: 'center',
      }}
    >
      <BodyStrong>{title}</BodyStrong>
      {body ? (
        <Small muted style={{ textAlign: 'center' }}>
          {body}
        </Small>
      ) : null}
    </View>
  )
}

export function ErrorState({
  message,
  retryLabel,
  onRetry,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: theme.colors.line,
        padding: SPACE.lg,
        gap: SPACE.md,
      }}
    >
      <Small color={STATUS.risk}>{message}</Small>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          minHeight: TAP,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radii.control,
          borderWidth: 1,
          borderColor: theme.colors.line,
        }}
      >
        <BodyStrong>{retryLabel}</BodyStrong>
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Static site chip — the supervisor's assigned-site context (no "All Sites").
// ---------------------------------------------------------------------------

export function SiteChip({ name, online }: { name: string; online: boolean }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        alignSelf: 'flex-start',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.card,
        paddingVertical: 6,
        paddingHorizontal: SPACE.md,
      }}
    >
      <StatusDot status={online ? 'ok' : 'warn'} size={10} />
      <BodyStrong>{name}</BodyStrong>
    </View>
  )
}

// ---------------------------------------------------------------------------
// "What is this?" tag chip row — one tap to classify a capture.
// ---------------------------------------------------------------------------

export const CAPTURE_KINDS: CaptureKind[] = ['attendance', 'delivery', 'progress', 'issue']

export const KIND_GLYPH: Record<CaptureKind, string> = {
  attendance: '👷',
  delivery: '📦',
  progress: '▥',
  issue: '⚠',
}

export function KindChipRow({
  value,
  labels,
  onChange,
}: {
  value: CaptureKind
  labels: Record<CaptureKind, string>
  onChange: (k: CaptureKind) => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
      {CAPTURE_KINDS.map((k) => {
        const active = k === value
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(k)}
            style={{
              minHeight: TAP,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.xs,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: active ? c.accent : c.line,
              backgroundColor: active ? c.accent : c.card,
              paddingHorizontal: SPACE.md,
            }}
          >
            <Body color={active ? c.onAccent : c.text}>{KIND_GLYPH[k]}</Body>
            <Small color={active ? c.onAccent : c.text} style={{ fontWeight: '600' }}>
              {labels[k]}
            </Small>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// CaptureBar — the HERO. Giant photo button + hold-to-talk mic.
// ---------------------------------------------------------------------------

export function CaptureBar({
  photoLabel,
  busy,
  onPhoto,
  voiceSlot,
}: {
  photoLabel: string
  busy: boolean
  onPhoto: () => void
  /** The hold-to-talk recorder (real audio) rendered under the photo button. */
  voiceSlot: ReactNode
}) {
  const { theme } = useTheme()
  const c = theme.colors

  return (
    <View style={{ gap: SPACE.md }}>
      {/* GIANT photo button — half-screen-ish, amber, the primary action. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={photoLabel}
        disabled={busy}
        onPress={onPhoto}
        style={({ pressed }) => ({
          minHeight: 200,
          borderRadius: theme.radii.sheet,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          opacity: busy ? 0.6 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !busy ? 0.99 : 1 }],
          ...theme.shadowCard,
        })}
      >
        {busy ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <>
            <Feather name="camera" size={52} color={c.onAccent} />
            <H2 color={c.onAccent}>{photoLabel}</H2>
          </>
        )}
      </Pressable>

      {/* Real hold-to-talk recorder (records actual audio → STT pipeline). */}
      {voiceSlot}
    </View>
  )
}

// ---------------------------------------------------------------------------
// "Today you've sent" row — a queued/filed capture in the reassurance strip.
// ---------------------------------------------------------------------------

export function SentRow({
  glyph,
  label,
  meta,
  filed,
  filedLabel,
  queuedLabel,
  onPress,
  isLast,
}: {
  glyph: string
  label: string
  meta: string
  /** true = synced/filed (server has it), false = queued offline. */
  filed: boolean
  filedLabel: string
  queuedLabel: string
  onPress?: () => void
  isLast: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const dotColor = filed ? STATUS.ok : STATUS.warn
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      style={{
        minHeight: TAP,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingVertical: SPACE.sm,
        borderTopWidth: isLast ? 0 : 0,
      }}
    >
      <Body>{glyph}</Body>
      <View style={{ flex: 1 }}>
        <BodyStrong numberOfLines={1}>{label}</BodyStrong>
        <Mono muted style={{ fontSize: 12 }}>
          {meta}
        </Mono>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
        <Small color={dotColor} style={{ fontWeight: '600' }}>
          {filed ? filedLabel : queuedLabel}
        </Small>
      </View>
    </Pressable>
  )
}

// Re-export tokens consumers want without re-importing.
export { SPACE, STATUS, TAP }
