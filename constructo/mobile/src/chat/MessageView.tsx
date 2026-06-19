/**
 * Shared message-rendering primitives for crew threads (Neev theme).
 *
 * These are the PRESENTATIONAL pieces both the supervisor crew-chat screen and
 * the owner Chat screen render. Extracted here (out of the expo-router route
 * groups) so the owner screen can reuse them without importing across groups.
 *
 * - {@link CaptureCard}: a chat message that became a structured SiteEvent,
 *   rendered as a Card (event-type pill + key fields + "show proof") instead of
 *   a flat bubble. Low confidence is marked amber (honest AI); proof is one tap.
 * - {@link MessageBubble}: a plain chat bubble (own = amber bg, other = card bg)
 *   with an optional attachment image, body text and a Mono timestamp.
 */
import { useState, type ComponentProps } from 'react'
import { Image, LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE, STATUS, TAP } from '../theme/tokens'
import { Body, BodyStrong, Micro, Mono, Small, StatusPill } from '../ui'
import type { ChatEvent } from '../api/chat'
import { tickGlyph, isReadTick } from './tick'
import type { DeliveryState } from './threadState'
import type { NivaanProposalView } from './nivaanProposal'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// ---------------------------------------------------------------------------
// SystemNotice — a centered, full-width informational row for sender_kind=system
// messages (member added, dispute resolved) and blocked-contested notices.
// Uses semantic theme tokens only; no hardcoded hex. Neev: textMute on
// transparent; Daylight: same token resolves to the warm Calm Cockpit muted
// ink — both systems agree on a calm centered treatment for system rows.
// ---------------------------------------------------------------------------

export function SystemNotice({ text }: { text: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACE.xs, paddingHorizontal: SPACE.lg }}>
      <Small muted style={{ textAlign: 'center', color: c.textMute }}>{text}</Small>
    </View>
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
  en: { show: 'Show proof ▾', hide: 'Hide proof ▴', review: 'Check this', captured: 'Captured', conf: 'sure', workers: 'workers', disputed: 'Disputed', approved: 'Approved' },
  hi: { show: 'सबूत देखें ▾', hide: 'सबूत छिपाएँ ▴', review: 'जाँचें', captured: 'दर्ज हुआ', conf: 'पक्का', workers: 'मज़दूर', disputed: 'विवादित', approved: 'मंज़ूर' },
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
  attachmentUrl,
  time,
}: {
  event: ChatEvent
  lang: EvLang
  /** The original message text — the proof, revealed on tap. */
  sourceText?: string | null
  /** The captured photo/challan (1.2) — shown in the proof reveal. */
  attachmentUrl?: string | null
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
        {event.contested ? <StatusPill status="risk" label={str.disputed} size="sm" /> : null}
        {(event.fields as { status?: string })?.status === 'approved' ? (
          <StatusPill status="ok" label={str.approved} size="sm" />
        ) : null}
        {event.needs_clarification && !event.contested ? (
          <StatusPill status="warn" label={str.review} size="sm" />
        ) : null}
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
          {attachmentUrl ? (
            <Image
              source={{ uri: attachmentUrl }}
              style={{ width: '100%', height: 180, borderRadius: 8, marginBottom: 2 }}
              resizeMode="cover"
            />
          ) : null}
          {sourceText ? <Body style={{ color: c.text }}>{sourceText}</Body> : null}
          <Mono muted style={{ fontSize: 12 }}>
            {[time, `${pct}% ${str.conf}`].filter(Boolean).join('  ·  ')}
          </Mono>
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// NivaanProposalCard — a left-aligned card for a Nivaan-drafted proposal.
// Shows a "Nivaan · proposal" eyebrow label (warn/amber = AI-proposed), the
// human-readable summary, a Confirm Pressable (marigold accent, only when
// committable), and a Dismiss. A missing_proof row renders without Confirm.
// Uses semantic theme tokens only — no hardcoded hex.
// ---------------------------------------------------------------------------

export function NivaanProposalCard({
  view,
  onConfirm,
  onDismiss,
}: {
  view: NivaanProposalView
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  // (1) Guard against double-commit: once confirmed or dismissed the buttons
  // are replaced by a muted status line, so neither action can fire again.
  const [status, setStatus] = useState<'open' | 'confirmed' | 'dismissed'>('open')

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          maxWidth: '92%',
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
      {/* (3) Eyebrow collapsed to a single text node — the ✦ is inline text,
          not a sibling, so the wrapping View + its gap are unnecessary. */}
      <Micro style={{ color: c.warn, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        ✦ Nivaan · proposal
      </Micro>

      {/* Draft summary */}
      <Body style={{ color: c.text }}>{view.summary}</Body>

      {/* Action row — replaced by a status line once acted upon. */}
      {status === 'confirmed' ? (
        <Small style={{ color: c.textMute }}>✓ Added</Small>
      ) : status === 'dismissed' ? (
        <Small style={{ color: c.textMute }}>Dismissed</Small>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs }}>
          {view.committable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm"
              onPress={() => { setStatus('confirmed'); onConfirm() }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: TAP,
                paddingHorizontal: SPACE.lg,
                borderRadius: theme.radii.control,
                backgroundColor: c.accent,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Feather name="check" size={15} color={c.onAccent} />
              <BodyStrong style={{ color: c.onAccent }}>Confirm</BodyStrong>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => { setStatus('dismissed'); onDismiss() }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              minHeight: TAP,
              paddingHorizontal: SPACE.md,
              borderRadius: theme.radii.control,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.paper,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Small style={{ color: c.textMute }}>Dismiss</Small>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble — a plain chat bubble (own = amber bg, other = card bg) with an
// optional attachment image, the body text, and a Mono timestamp. Copied
// verbatim from the supervisor screen's inline bubble so the owner Chat screen
// renders crew threads identically.
// ---------------------------------------------------------------------------

export function MessageBubble({
  body,
  mine,
  attachmentUrl,
  timestamp,
  deliveryState,
  onLongPress,
  nivaan,
  showSenderName,
  senderName,
}: {
  body: string | null
  mine: boolean
  attachmentUrl?: string | null
  timestamp?: string
  deliveryState?: DeliveryState
  onLongPress?: () => void
  /** (2) When true, renders a small "✦ Nivaan" caption above the body to
   *  visually distinguish AI-generated answer rows from human messages. */
  nivaan?: boolean
  /** When true and a senderName is provided, renders a small name label above
   *  the bubble for non-mine messages — used in multi-sender site/group threads. */
  showSenderName?: boolean
  /** The author's display name (from sender_name on the message). */
  senderName?: string | null
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const daylight = theme.name === 'daylight'

  // Own bubble: neev keeps its translucent amber (unchanged); daylight uses
  // the warm sage chip the homeowner DaylightBubble used, so the look is preserved
  // when the homeowner thread renders through this shared bubble.
  const ownBubble = daylight
    ? {
        alignSelf: 'flex-end' as const,
        backgroundColor: AP.chip,
        borderColor: AP.chip,
        borderWidth: 1,
      }
    : {
        alignSelf: 'flex-end' as const,
        backgroundColor: 'rgba(242,161,0,0.16)',
        borderColor: 'rgba(242,161,0,0.45)',
        borderWidth: 1,
      }
  const otherBubble = {
    alignSelf: 'flex-start' as const,
    backgroundColor: c.card,
    borderColor: c.line,
    borderWidth: 1,
  }

  const bubbleStyle = [
    {
      maxWidth: '82%' as const,
      borderRadius: theme.radii.card,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      gap: 2,
    },
    mine ? ownBubble : otherBubble,
  ]

  const content = (
    <>
      {nivaan ? (
        <Micro style={{ color: c.warn, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
          ✦ Nivaan
        </Micro>
      ) : null}
      {showSenderName && !mine && senderName ? (
        <Micro style={{ color: c.textMute, fontWeight: '600', marginBottom: 2 }}>
          {senderName}
        </Micro>
      ) : null}
      {attachmentUrl ? (
        <Image
          source={{ uri: attachmentUrl }}
          style={{ width: 200, height: 150, borderRadius: 8, marginBottom: 4 }}
          resizeMode="cover"
        />
      ) : null}
      {body ? <Body style={{ color: c.text }}>{body}</Body> : null}
      {timestamp ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            // Own bubbles hug the right (with the tick); received bubbles keep
            // their original left alignment.
            alignSelf: mine ? 'flex-end' : 'flex-start',
          }}
        >
          <Mono style={{ color: c.textMute, fontSize: 11 }}>{timestamp}</Mono>
          {mine && tickGlyph(deliveryState) ? (
            <Mono style={{ fontSize: 11, color: isReadTick(deliveryState) ? c.accent : c.textMute }}>
              {tickGlyph(deliveryState)}
            </Mono>
          ) : null}
        </View>
      ) : null}
    </>
  )

  return onLongPress ? (
    <Pressable onLongPress={onLongPress} style={bubbleStyle}>
      {content}
    </Pressable>
  ) : (
    <View style={bubbleStyle}>{content}</View>
  )
}
