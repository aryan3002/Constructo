/**
 * ConversationRow — one accessible crew/homeowner/group thread in the Chat inbox.
 *
 * Web translation of the mobile `_chat_components.tsx` ConversationRow, using
 * Tailwind semantic tokens (Blueprint light + neev-dark) instead of React Native
 * inline styles.
 *
 * Avatar:
 *   - homeowner kind  → a person-glyph SVG (shape + --info color, never color alone)
 *   - all other kinds → up to two leading initials, uppercased, in a brand-subtle circle
 *
 * Sub-cue (shape + color — never color alone so it survives color-blind modes):
 *   - group with no site_id       → ◈ Company-wide
 *   - has_homeowner && kind!=home → ◆ Client in this thread
 *   - homeowner kind              → no cue (title already communicates this)
 *
 * Recency: compact short string (now / 5m / 3h / 2d / 2w) rendered in Mono font.
 * Unread:  amber pill badge, `99+` cap.
 */
import type { ConversationSummary } from '../../api/chat'

// ---------------------------------------------------------------------------
// Helpers (mirrored from mobile _chat_components.tsx)
// ---------------------------------------------------------------------------

/** Initials from a thread label — up to two leading letters (uppercased). */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '#'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Compact recency: now / 5m / 3h / 2d / 2w from an ISO timestamp. */
export function recency(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const ms = Date.now() - t
  if (ms < 60_000) return 'now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return `${Math.floor(day / 7)}w`
}

// ---------------------------------------------------------------------------
// PersonIcon — shape-only SVG so the avatar is never color-alone
// ---------------------------------------------------------------------------

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// ConversationRow
// ---------------------------------------------------------------------------

export interface ConversationRowProps {
  conversation: ConversationSummary
  selected: boolean
  onSelect: (conversation: ConversationSummary) => void
}

export function ConversationRow({ conversation, selected, onSelect }: ConversationRowProps) {
  const c = conversation
  const isHomeowner = c.kind === 'homeowner'
  const isCompanyWideGroup = c.kind === 'group' && c.site_id == null

  const siteName = c.site_name ?? 'Site'
  const label = isHomeowner
    ? `Homeowner · ${siteName}`
    : (c.title ?? c.site_name ?? 'Site')

  const when = recency(c.last_message_at)
  const unread = c.unread_count > 0
  const badgeText = c.unread_count > 99 ? '99+' : String(c.unread_count)

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(c)}
      className={[
        'flex w-full items-center gap-3 rounded-control px-4 py-3 text-left',
        'min-h-tap transition-colors duration-160 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
        'focus-visible:ring-offset-surface hover:bg-surface-hover',
        selected ? 'bg-surface-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* --- Avatar --- */}
      {isHomeowner ? (
        /* Person-glyph avatar: info tint bg + info border (shape + color — a11y OK) */
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-info bg-info-bg"
          aria-hidden="true"
        >
          <PersonIcon className="h-5 w-5 text-info" />
        </span>
      ) : (
        /* Initials avatar */
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle"
          aria-hidden="true"
        >
          <span className="font-body text-small font-semibold text-brand-text">
            {initials(label)}
          </span>
        </span>
      )}

      {/* --- Title + sub-cue --- */}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-body text-body font-semibold text-text-primary">
          {label}
        </span>

        {isCompanyWideGroup ? (
          <span className="mt-0.5 flex items-center gap-1">
            {/* ◈ is the shape cue; info color is the color cue — both present */}
            <span className="font-mono text-micro text-info" aria-hidden="true">
              ◈
            </span>
            <span className="font-body text-small text-info">Company-wide</span>
          </span>
        ) : !isHomeowner && c.has_homeowner ? (
          <span className="mt-0.5 flex items-center gap-1">
            {/* ◆ is the shape cue; info color is the color cue — both present */}
            <span className="font-mono text-micro text-info" aria-hidden="true">
              ◆
            </span>
            <span className="font-body text-small text-info">Client in this thread</span>
          </span>
        ) : null}
      </span>

      {/* --- Recency + unread badge --- */}
      <span className="flex shrink-0 flex-col items-end gap-1">
        {when ? (
          <span className="font-mono text-micro text-text-muted">{when}</span>
        ) : null}

        {unread ? (
          <span
            aria-label={`${c.unread_count} unread`}
            className="inline-flex min-w-[1.375rem] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 font-mono text-micro font-semibold text-text-on-brand"
          >
            {badgeText}
          </span>
        ) : null}
      </span>
    </button>
  )
}
