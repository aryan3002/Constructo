/**
 * Local composite components for the Supervisor branch (Blueprint theme). These
 * are NOT in src/ui — they are role-specific compositions of the shared kit
 * (Button, Card, Typography, StatusDot) and live with the screens that use them.
 *
 * The hero is {@link CaptureBar}: a giant photo button + a hold-to-talk mic,
 * built for gloves/sun/one-thumb (≥56px targets). Capture beats forms for this
 * role, so this is photo/voice first; the "what is this?" tag is one tap.
 */
import { useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../../../src/theme/ThemeProvider'
import { SPACE, STATUS, TAP } from '../../../src/theme/tokens'
import { Body, BodyStrong, H2, Micro, Mono, Small, StatusDot, StatusPill } from '../../../src/ui'
import type { CaptureKind } from '../../../src/api/supervisor'
import type { ChatEvent } from '../../../src/api/chat'

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

// ---------------------------------------------------------------------------
// CaptureCard — a chat message that became a structured SiteEvent, rendered
// inline as a Card (event-type pill + key fields + "show proof") instead of a
// flat bubble. This is "capture with a conversation around it" made VISIBLE:
// the magic that a message also booked ground-truth into the ledger. Low
// confidence is marked amber (honest AI); the proof is one tap away (the soul).
// ---------------------------------------------------------------------------

type EvLang = 'en' | 'hi'

type EvMeta = { icon: ComponentProps<typeof Feather>['name']; en: string; hi: string }

const EVENT_META: Record<string, EvMeta> = {
  attendance: { icon: 'users', en: 'Attendance', hi: 'हाज़िरी' },
  material_delivery: { icon: 'truck', en: 'Delivery', hi: 'डिलीवरी' },
  progress_update: { icon: 'trending-up', en: 'Progress', hi: 'प्रगति' },
  issue: { icon: 'alert-triangle', en: 'Issue', hi: 'दिक्कत' },
  invoice_received: { icon: 'file-text', en: 'Invoice', hi: 'बिल' },
  drawing_shared: { icon: 'map', en: 'Drawing', hi: 'ड्रॉइंग' },
  approval: { icon: 'check-circle', en: 'Decision', hi: 'फ़ैसला' },
  payment_request: { icon: 'credit-card', en: 'Payment', hi: 'भुगतान' },
  unknown: { icon: 'help-circle', en: 'Note', hi: 'नोट' },
}

const CARD_STR = {
  en: { show: 'Show proof ▾', hide: 'Hide proof ▴', review: 'Check this', captured: 'Captured', conf: 'sure', workers: 'workers' },
  hi: { show: 'सबूत देखें ▾', hide: 'सबूत छिपाएँ ▴', review: 'जाँचें', captured: 'दर्ज हुआ', conf: 'पक्का', workers: 'मज़दूर' },
} as const

/** Indian-grouped rupee formatting (no reliance on Hermes Intl). */
function inr(value: number): string {
  const neg = value < 0
  const s = Math.abs(Math.round(value)).toString()
  let grouped = s
  if (s.length > 3) {
    const last3 = s.slice(-3)
    let rest = s.slice(0, -3)
    const parts: string[] = []
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2))
      rest = rest.slice(0, -2)
    }
    if (rest) parts.unshift(rest)
    grouped = `${parts.join(',')},${last3}`
  }
  return `${neg ? '-₹' : '₹'}${grouped}`
}

/** A compact, Mono-rendered key-field line; '' → caller falls back to summary. */
function keyFields(eventType: string, f: Record<string, unknown>, lang: EvLang): string {
  const str = (k: string) => (f[k] == null ? '' : String(f[k]))
  const num = (k: string) => (typeof f[k] === 'number' ? (f[k] as number) : null)
  switch (eventType) {
    case 'attendance': {
      const head = num('headcount')
      const trades =
        f.by_trade && typeof f.by_trade === 'object'
          ? Object.entries(f.by_trade as Record<string, unknown>)
              .map(([t, v]) => `${v} ${t}`)
              .join(' · ')
          : ''
      const base = head != null ? `${head} ${CARD_STR[lang].workers}` : ''
      return [base, trades].filter(Boolean).join('   ')
    }
    case 'material_delivery':
      return (
        [str('quantity'), str('unit'), str('material')].filter(Boolean).join(' ') +
        (str('vendor') ? `   ·   ${str('vendor')}` : '')
      )
    case 'invoice_received':
      return (
        (num('amount') != null ? inr(num('amount')!) : '') +
        (str('vendor') ? `   ·   ${str('vendor')}` : '') +
        (str('invoice_number') ? `   ·   #${str('invoice_number')}` : '')
      )
    case 'payment_request':
      return (num('amount') != null ? inr(num('amount')!) : '') + (str('to') ? `   →   ${str('to')}` : '')
    default:
      return ''
  }
}

export function CaptureCard({
  event,
  lang,
  sourceText,
  time,
}: {
  event: ChatEvent
  lang: EvLang
  /** The original message text — the proof, revealed on tap. */
  sourceText?: string | null
  time: string
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const [open, setOpen] = useState(false)
  const meta = EVENT_META[event.event_type] ?? EVENT_META.unknown
  const str = CARD_STR[lang]
  const fieldsLine = keyFields(event.event_type, event.fields, lang)
  const pct = Math.round(event.confidence * 100)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((o) => !o)
  }

  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: theme.radii.card,
          borderWidth: 1,
          borderColor: c.line,
          padding: SPACE.lg,
          gap: SPACE.sm,
        },
        theme.shadowCard,
      ]}
    >
      {/* Header: event-type pill (icon + word) + low-confidence cue (amber). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.paper,
            paddingVertical: 4,
            paddingHorizontal: 10,
          }}
        >
          <Feather name={meta.icon} size={13} color={c.text} />
          <Small style={{ fontWeight: '600' }}>{lang === 'hi' ? meta.hi : meta.en}</Small>
        </View>
        {event.needs_clarification ? <StatusPill status="warn" label={str.review} size="sm" /> : null}
      </View>

      {/* Key fields (Mono ledger numerals) and/or the human-readable summary. */}
      {fieldsLine ? <Mono style={{ fontSize: 18, color: c.text }}>{fieldsLine}</Mono> : null}
      {event.summary ? (
        <Body style={{ color: fieldsLine ? c.textMute : c.text }}>{event.summary}</Body>
      ) : null}

      {/* Show proof — one tap from the captured message (evidence on tap). */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={{ minHeight: TAP, justifyContent: 'center' }}
      >
        <BodyStrong color={c.accentDeep}>{open ? str.hide : str.show}</BodyStrong>
      </Pressable>

      {open ? (
        <View
          style={{
            gap: SPACE.xs,
            borderRadius: theme.radii.control,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.paper,
            padding: SPACE.sm,
          }}
        >
          <Micro muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {str.captured}
          </Micro>
          {sourceText ? <Body style={{ color: c.text }}>{sourceText}</Body> : null}
          <Mono muted style={{ fontSize: 12 }}>
            {[time, `${pct}% ${str.conf}`].filter(Boolean).join('  ·  ')}
          </Mono>
        </View>
      ) : null}
    </View>
  )
}

// Re-export tokens consumers want without re-importing.
export { SPACE, STATUS, TAP }
