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
import { memo, useEffect, useState, type ComponentProps } from 'react'
import { Image, Platform, Pressable, View } from 'react-native'
import { Image as CachedImage } from 'expo-image'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { useTheme } from '../theme/ThemeProvider'
import { AP, SPACE, STATUS, TAP } from '../theme/tokens'
import { Body, BodyStrong, Micro, Mono, Small, StatusPill } from '../ui'
import type { ChatEvent } from '../api/chat'
import { tickGlyph, isReadTick } from './tick'
import type { DeliveryState } from './threadState'
import type { NivaanProposalView } from './nivaanProposal'

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

export const CaptureCard = memo(function CaptureCard({
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

  // No LayoutAnimation here: configureNext is GLOBAL — it animated every layout
  // change in the frame, visibly sliding the whole inverted feed whenever a
  // proof panel toggled. The reveal renders immediately instead (the doctrine:
  // motion never delays reading).
  const toggle = () => setOpen((o) => !o)

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
})

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

/** Send-to-feed chrome on a photo bubble. Kept English (app-chrome, like the
 *  timestamps/ticks) — the localized flow copy lives in the SendToFeedSheet. */
const SEND_TO_FEED_STR = {
  badge: 'In feed',
  hint: 'Long-press to send this photo to the homeowner feed',
} as const

/** A stable disk-cache key for a presigned R2 GET: the object path without the
 *  rotating signature query. Presigns are re-issued on every thread focus, so
 *  caching by full URL would re-download every photo on every focus. Local
 *  file:// sources need no key. */
function stableCacheKey(url: string): string | undefined {
  if (!url.startsWith('http')) return undefined
  const clean = url.split('?')[0]
  // Last two path segments (bucket-agnostic object key tail) — unique per object.
  return clean.split('/').slice(-2).join('/') || undefined
}

export const MessageBubble = memo(function MessageBubble({
  body,
  mine,
  attachmentUrl,
  attachmentLocalUri,
  timestamp,
  deliveryState,
  onLongPress,
  nivaan,
  showSenderName,
  senderName,
  onSendToFeed,
  feedPhotoId,
  attachmentWidth,
  attachmentHeight,
  onPressAttachment,
}: {
  body: string | null
  mine: boolean
  attachmentUrl?: string | null
  /** Local file the photo was sent from (client-only cache field) — preferred
   *  over the remote URL so a just-sent photo never re-downloads itself. */
  attachmentLocalUri?: string | null
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
  /** Contractor-only "Send to feed" (photo bubbles). When provided AND this bubble
   *  has an attachment, long-press publishes the photo to the homeowner feed — UNLESS
   *  it is already in the feed (`feedPhotoId` set), in which case long-press falls back
   *  to the normal reply action. Never passed on homeowner screens, so they never see
   *  the affordance. */
  onSendToFeed?: () => void
  /** The PublishedPhoto id when this photo is already in the feed — renders a small
   *  "✓ In feed" badge on the bubble and disables re-sending. */
  feedPhotoId?: string | null
  attachmentWidth?: number
  attachmentHeight?: number
  onPressAttachment?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const daylight = theme.name === 'daylight'
  // Attachment image source + load state. Two rules keep photos from flashing:
  //  1. Prefer the LOCAL file a just-sent photo was uploaded from — never
  //     re-download our own upload.
  //  2. HOLD the currently-loaded URL when a fresh presign rotates in on focus
  //     (imgState==='ok' → keep rendering what's on screen); adopt the fresh
  //     URL only when we have nothing loaded or the current one FAILED (the
  //     expired-presign case the on-focus refresh exists for).
  const preferredSrc = attachmentLocalUri ?? attachmentUrl ?? null
  const [src, setSrc] = useState(preferredSrc)
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'failed'>('loading')
  useEffect(() => {
    if (preferredSrc === src) return
    if (!src || imgState === 'failed') {
      setSrc(preferredSrc)
      setImgState('loading')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredSrc])
  const onImgError = () => {
    // A failed local file (cleared cache dir) falls back to the remote URL once.
    if (attachmentLocalUri && src === attachmentLocalUri && attachmentUrl) {
      setSrc(attachmentUrl)
      setImgState('loading')
      return
    }
    setImgState('failed')
  }

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

  const TAIL = 4
  const r = theme.radii.bubble
  const tail = mine
    ? { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: r, borderBottomRightRadius: TAIL }
    : { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: TAIL, borderBottomRightRadius: r }

  const bubbleStyle = [
    {
      maxWidth: '82%' as const,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      gap: 2,
    },
    tail,
    mine ? ownBubble : otherBubble,
  ]

  const hasDims = !!attachmentWidth && !!attachmentHeight
  const ar = hasDims ? Math.max(0.6, Math.min(1.5, attachmentWidth / attachmentHeight)) : 4 / 3
  const imgW = Math.min(280, 280) // 280 is approx bubble max width
  const imgH = imgW / ar
  const dimStyle = hasDims ? { width: imgW, height: imgH } : { width: 200, height: 150 }

  // A photo bubble the contractor can publish to the feed (and hasn't yet) makes
  // "Send to feed" the primary long-press action; once in the feed (feedPhotoId set)
  // long-press falls back to the normal reply handler. Non-photo bubbles and the
  // homeowner (no onSendToFeed) keep the plain reply long-press.
  const canSendToFeed = !!onSendToFeed && !!attachmentUrl && !feedPhotoId
  const longPress = canSendToFeed ? onSendToFeed : onLongPress
  // Shared by the whole bubble AND the inner photo Pressable. The photo MUST get
  // its own onLongPress: the tap-to-open Pressable captures the touch responder,
  // so without this a long-press on the photo never reaches the bubble's handler
  // and "Send to feed" (only reachable by long-pressing a photo) is dead.
  const handleLongPress = longPress
    ? () => {
        // A light tap the instant the gesture is recognized, so the menu/sheet
        // doesn't appear out of nowhere.
        if (Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
        }
        longPress()
      }
    : undefined

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
      {src ? (
        <Pressable
          onPress={onPressAttachment}
          onLongPress={handleLongPress}
          disabled={!onPressAttachment}
          style={[{ borderRadius: 8, marginBottom: 4, overflow: 'hidden' }, dimStyle]}
        >
          {imgState !== 'failed' ? (
            <CachedImage
              source={{ uri: src, ...(stableCacheKey(src) ? { cacheKey: stableCacheKey(src) } : {}) }}
              style={dimStyle}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={stableCacheKey(src) ?? src}
              transition={140}
              onLoad={() => setImgState('ok')}
              onError={onImgError}
            />
          ) : null}
          {imgState !== 'ok' ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.paper,
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: 8,
              }}
            >
              <Feather
                name={imgState === 'failed' ? 'image' : 'loader'}
                size={26}
                color={c.textMute}
              />
            </View>
          ) : null}
          {/* "✓ In feed" badge — a small ok-tinted pill pinned to the photo's
              bottom-left once the contractor has published it to the homeowner
              feed. Durable: driven by feedPhotoId (message-out left-join). */}
          {feedPhotoId ? (
            <View
              style={{
                position: 'absolute',
                left: 6,
                bottom: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 9999,
                backgroundColor: 'rgba(0,0,0,0.55)',
              }}
            >
              <Feather name="check" size={12} color={c.ok} />
              <Micro style={{ color: '#ffffff', fontWeight: '600' }}>
                {SEND_TO_FEED_STR.badge}
              </Micro>
            </View>
          ) : null}
        </Pressable>
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

  return longPress ? (
    <Pressable
      onLongPress={handleLongPress}
      accessibilityHint={canSendToFeed ? SEND_TO_FEED_STR.hint : undefined}
      style={({ pressed }) => [...bubbleStyle, pressed ? { opacity: 0.82 } : null]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={bubbleStyle}>{content}</View>
  )
})
