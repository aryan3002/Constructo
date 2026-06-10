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
import { Body, BodyStrong, EmptyState, H2, MonoSm, Small, StatusDot, StatusPill } from '../../../src/ui'
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

/** CalmEmpty — delegates to the kit EmptyState. Uses "empty" variant for lists,
 *  "clear" when there is nothing pending (all-clear feeling). Screens that want
 *  "offline" pass variant explicitly via the underlying EmptyState directly. */
export function CalmEmpty({ title, body }: { title: string; body?: string }) {
  return <EmptyState variant="empty" title={title} body={body} />
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
  const c = theme.colors
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: c.line,
        padding: SPACE.lg,
        gap: SPACE.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <StatusPill status="risk" label={message} size="sm" />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          minHeight: TAP,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radii.control,
          borderWidth: 1,
          borderColor: c.line,
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
  // Active kind chip: ink fill (not marigold — the one marigold is the capture
  // mic + the single affirmative "yes"; never two marigold fills on one screen).
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
              borderWidth: active ? 1.5 : 1,
              borderColor: active ? c.text : c.line,
              backgroundColor: active ? c.text : c.card,
              paddingHorizontal: SPACE.md,
            }}
          >
            <Body color={active ? c.paper : c.text}>{KIND_GLYPH[k]}</Body>
            <Small color={active ? c.paper : c.text} style={{ fontWeight: '600' }}>
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
      }}
    >
      <Body>{glyph}</Body>
      <View style={{ flex: 1 }}>
        <BodyStrong numberOfLines={1}>{label}</BodyStrong>
        <MonoSm muted>{meta}</MonoSm>
      </View>
      {/* Status = shape + label + colour via the kit StatusPill (never dot alone). */}
      <StatusPill
        status={filed ? 'ok' : 'info'}
        label={filed ? filedLabel : queuedLabel}
        size="sm"
      />
    </Pressable>
  )
}

// Re-export tokens consumers want without re-importing.
export { SPACE, STATUS, TAP }
