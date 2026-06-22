/**
 * CaptureCard — web port of the mobile `CaptureCard` from
 * `constructo/mobile/src/chat/MessageView.tsx`.
 *
 * Renders a structured SiteEvent inline as a card (event-type pill + key
 * fields + status pills + "Show proof" toggle) instead of a plain bubble.
 * Semantic tokens only — no hardcoded hex. Neev light + neev-dark aware.
 *
 * Props: `{ event: ChatEvent, message: ChatMessage }`.
 */
import { useState } from 'react'
import type { ChatEvent, ChatMessage } from '../../api/chat'

// ---------------------------------------------------------------------------
// Inline SVG glyphs (ported from Feather icon names in the mobile reference)
// These are minimal stroked glyphs so the type pill has an icon without an
// icon-font dependency. `currentColor` so they inherit text color.
// ---------------------------------------------------------------------------

type GlyphProps = { className?: string; 'aria-hidden'?: boolean }

const G = {
  /** users — attendance */
  users: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="3" />
      <path d="M20.5 20a4 4 0 0 0-7 0" />
    </svg>
  ),
  /** truck — material_delivery */
  truck: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 5v3h-7V8Z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  /** trending-up — progress_update */
  trendingUp: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  /** alert-triangle — issue */
  alertTriangle: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 4 3 19h18L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  /** file-text — invoice_received */
  fileText: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 3h7l4 4v14H7V3Z" />
      <path d="M13 3v5h5" />
      <path d="M9.5 13h6M9.5 16h6" />
    </svg>
  ),
  /** map — drawing_shared */
  map: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  /** check-circle — approval */
  checkCircle: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  /** credit-card — payment_request */
  creditCard: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  /** help-circle — unknown */
  helpCircle: (p: GlyphProps) => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
}

// ---------------------------------------------------------------------------
// EVENT_META — ported directly from mobile MessageView.tsx
// ---------------------------------------------------------------------------

type EvIcon = keyof typeof G

interface EvMeta {
  icon: EvIcon
  en: string
  hi: string
}

const EVENT_META: Record<string, EvMeta> = {
  attendance:       { icon: 'users',         en: 'Attendance',  hi: 'हाज़िरी'   },
  material_delivery:{ icon: 'truck',         en: 'Delivery',    hi: 'डिलीवरी'  },
  progress_update:  { icon: 'trendingUp',    en: 'Progress',    hi: 'प्रगति'   },
  issue:            { icon: 'alertTriangle', en: 'Issue',       hi: 'दिक्कत'   },
  invoice_received: { icon: 'fileText',      en: 'Invoice',     hi: 'बिल'      },
  drawing_shared:   { icon: 'map',           en: 'Drawing',     hi: 'ड्रॉइंग'  },
  approval:         { icon: 'checkCircle',   en: 'Decision',    hi: 'फ़ैसला'   },
  payment_request:  { icon: 'creditCard',    en: 'Payment',     hi: 'भुगतान'   },
  unknown:          { icon: 'helpCircle',    en: 'Note',        hi: 'नोट'      },
}

// ---------------------------------------------------------------------------
// inr — Indian-grouped rupee formatter (ported from mobile MessageView.tsx;
// no Intl dependency so it works in any JS environment including jsdom)
// ---------------------------------------------------------------------------

export function inr(value: number): string {
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

// ---------------------------------------------------------------------------
// keyFields — compact key-field line per event type (ported from mobile)
// Returns '' when no structured line can be built (caller falls back to summary).
// ---------------------------------------------------------------------------

export function keyFields(eventType: string, f: Record<string, unknown>): string {
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
      const base = head != null ? `${head} workers` : ''
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
      return (num('amount') != null ? inr(num('amount')!) : '') +
        (str('to') ? `   →   ${str('to')}` : '')
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// fmtTime — HH:MM from an ISO timestamp
// ---------------------------------------------------------------------------

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ---------------------------------------------------------------------------
// CaptureCard
// ---------------------------------------------------------------------------

export interface CaptureCardProps {
  event: ChatEvent
  message: ChatMessage
}

export function CaptureCard({ event, message }: CaptureCardProps) {
  const [open, setOpen] = useState(false)

  const meta = EVENT_META[event.event_type] ?? EVENT_META.unknown
  const Icon = G[meta.icon]
  const fieldsLine = keyFields(event.event_type, event.fields)
  const pct = Math.round(event.confidence * 100)
  const time = message.created_at ? fmtTime(message.created_at) : ''

  // "approved" status lives in event.fields.status
  const fieldsStatus = (event.fields as { status?: string })?.status

  // raw_status cue
  const rawStatus = message.raw_status
  const isProcessing = rawStatus === 'queued' || rawStatus === 'processing'
  const isFailed = rawStatus === 'failed'

  return (
    <article
      data-testid="capture-card"
      className="bg-surface-card border border-edge rounded-card shadow-card p-4 flex flex-col gap-2"
    >
      {/* ── Header row: type pill + status pills ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Type pill */}
        <span className="inline-flex items-center gap-1.5 bg-surface-sunken text-text-secondary rounded-full border border-edge px-2.5 py-0.5 font-body text-small font-semibold">
          <span className="text-[1em] leading-none" aria-hidden>
            <Icon aria-hidden />
          </span>
          {meta.en}
        </span>

        {/* Disputed */}
        {event.contested ? (
          <span
            role="status"
            data-testid="pill-disputed"
            className="inline-flex items-center gap-1 bg-risk-bg text-risk-fg rounded-full border border-risk-fg/20 px-2 py-0.5 font-body text-small font-semibold"
          >
            Disputed
          </span>
        ) : null}

        {/* Approved */}
        {fieldsStatus === 'approved' ? (
          <span
            role="status"
            data-testid="pill-approved"
            className="inline-flex items-center gap-1 bg-ok-bg text-ok-fg rounded-full border border-ok-fg/20 px-2 py-0.5 font-body text-small font-semibold"
          >
            Approved
          </span>
        ) : null}

        {/* Check this — only when needs_clarification AND not contested */}
        {event.needs_clarification && !event.contested ? (
          <span
            role="status"
            data-testid="pill-check-this"
            className="inline-flex items-center gap-1 bg-warn-bg text-warn-fg rounded-full border border-warn-fg/20 px-2 py-0.5 font-body text-small font-semibold"
          >
            Check this
          </span>
        ) : null}
      </div>

      {/* ── Key-field line (Mono ledger numerals) ─────────────────────────── */}
      {fieldsLine ? (
        <span
          data-testid="key-fields"
          className="cstk-mono text-text-primary font-mono text-body"
        >
          {fieldsLine}
        </span>
      ) : null}

      {/* ── Summary ───────────────────────────────────────────────────────── */}
      {event.summary ? (
        <p
          data-testid="summary"
          className={`font-body text-body ${fieldsLine ? 'text-text-secondary' : 'text-text-primary'}`}
        >
          {event.summary}
        </p>
      ) : null}

      {/* ── Show / Hide proof toggle ──────────────────────────────────────── */}
      <button
        type="button"
        aria-expanded={open}
        data-testid="proof-toggle"
        onClick={() => setOpen((o) => !o)}
        className="self-start font-body text-small font-semibold text-brand-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {open ? 'Hide proof ▴' : 'Show proof ▾'}
      </button>

      {/* ── Proof panel ───────────────────────────────────────────────────── */}
      {open ? (
        <div
          data-testid="proof-panel"
          className="flex flex-col gap-1.5 rounded-control border border-edge bg-surface-sunken p-3"
        >
          <span className="font-body text-micro uppercase tracking-wide text-text-muted">
            Captured
          </span>

          {/* Attachment image */}
          {message.attachment_url ? (
            <img
              src={message.attachment_url}
              alt="captured attachment"
              className="w-full max-h-48 rounded-md object-cover"
            />
          ) : null}

          {/* Source text (message body as best-effort proof) */}
          {message.body ? (
            <p
              data-testid="proof-source"
              className="font-body text-body text-text-primary"
            >
              {message.body}
            </p>
          ) : null}

          {/* Footer: time · pct% sure */}
          <span
            data-testid="proof-footer"
            className="cstk-mono text-micro text-text-muted"
          >
            {[time, `${pct}% sure`].filter(Boolean).join('  ·  ')}
          </span>
        </div>
      ) : null}

      {/* ── raw_status processing / failed cue ───────────────────────────── */}
      {isProcessing ? (
        <span
          data-testid="raw-processing"
          className="font-body text-small text-text-muted"
          aria-live="polite"
        >
          processing…
        </span>
      ) : isFailed ? (
        <span
          data-testid="raw-failed"
          className="font-body text-small text-risk-fg"
          aria-live="polite"
        >
          couldn't process
        </span>
      ) : null}
    </article>
  )
}
