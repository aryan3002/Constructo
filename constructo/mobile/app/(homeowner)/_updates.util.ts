/**
 * Helpers local to the Project Updates screen (app/(homeowner)/updates.tsx).
 * Pure functions only — no React, no shared-file edits.
 */
import type { Language } from '../../src/api/types'
import type { Status } from '../../src/theme/tokens'
import type { UpdateType, MilestoneStatus } from '../../src/api/types'

/** Sub-tabs of the Updates screen (an in-screen segmented control). */
export type SubTab = 'timeline' | 'milestones' | 'changes' | 'property'
export const SUB_TABS: SubTab[] = ['timeline', 'milestones', 'changes', 'property']

/** Map an Update.type to a status tint + a readable label (en/hi). */
export function updateMeta(
  type: UpdateType,
  lang: Language,
): { status: Status | 'mute'; label: string } {
  const META: Record<UpdateType, { status: Status | 'mute'; en: string; hi: string }> = {
    progress: { status: 'info', en: 'Progress', hi: 'प्रगति' },
    milestone: { status: 'ok', en: 'Milestone', hi: 'पड़ाव' },
    decision_needed: { status: 'warn', en: 'Needs you', hi: 'आपकी ज़रूरत' },
    delay: { status: 'risk', en: 'Delay', hi: 'देरी' },
    change: { status: 'info', en: 'Change', hi: 'बदलाव' },
    quiet: { status: 'mute', en: 'Quiet day', hi: 'शांत दिन' },
  }
  const m = META[type] ?? META.progress
  return { status: m.status, label: lang === 'hi' ? m.hi : m.en }
}

/** Map a milestone status to the StatusPill props (label localised). */
export function milestoneMeta(
  status: MilestoneStatus,
  lang: Language,
): { status: Status; label: string } | { muted: true; label: string } {
  if (status === 'now') return { status: 'info', label: lang === 'hi' ? 'अभी' : 'Now' }
  if (status === 'done') return { status: 'ok', label: lang === 'hi' ? 'पूरा' : 'Done' }
  return { muted: true, label: lang === 'hi' ? 'आगामी' : 'Upcoming' }
}

/** Indian-format rupees: ≥1cr "₹X.X Cr", ≥1L "₹X.X L", else grouped "₹12,000". */
export function formatRupees(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)} Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`
  return `${sign}₹${abs.toLocaleString('en-IN')}`
}

/** Signed rupee delta, e.g. "+₹1.2 L" / "-₹40,000" / "₹0". */
export function formatRupeeDelta(n: number | null): string {
  if (n == null || n === 0) return '₹0'
  const body = formatRupees(Math.abs(n))
  return n > 0 ? `+${body}` : `-${body}`
}

/** Signed day delta, localised: "+5 days" / "-2 days" / "0 days". */
export function formatDayDelta(days: number | null, lang: Language): string {
  const d = days ?? 0
  const unit = lang === 'hi' ? 'दिन' : d === 1 || d === -1 ? 'day' : 'days'
  const sign = d > 0 ? '+' : ''
  return `${sign}${d} ${unit}`
}

/** Friendly date from an ISO string (falls back to the raw value). */
export function formatDate(iso: string | null, lang: Language): string {
  if (!iso) return lang === 'hi' ? 'तय नहीं' : 'Not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Short day+month — "14 Jun" — no year (the surrounding context implies it). */
export function shortDate(iso: string | null, lang: Language): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
}

/**
 * The 7-day window of a weekly summary, from its `week_start` — "26 May – 1 Jun".
 * Used for the pinned WeeklySummaryCard eyebrow on the Timeline tab.
 */
export function weekRange(weekStart: string, lang: Language): string | null {
  const s = new Date(weekStart)
  if (Number.isNaN(s.getTime())) return null
  const e = new Date(s)
  e.setDate(e.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  return `${fmt(s)} – ${fmt(e)}`
}

/**
 * Inclusive whole-day count from a start date to today (so a milestone that
 * started today reads "day 1"). Returns null for missing/future/invalid input —
 * we only ever show an HONEST elapsed count, never a fabricated estimate (§6).
 */
export function dayNumberSince(startIso: string | null): number | null {
  if (!startIso) return null
  const s = new Date(startIso)
  if (Number.isNaN(s.getTime())) return null
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const startDay = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((today - startDay) / MS_PER_DAY) + 1
  return days >= 1 ? days : null
}

/** "day 8" / "8वाँ दिन" — localised elapsed-day label for an active milestone. */
export function formatDayNumber(day: number, lang: Language): string {
  return lang === 'hi' ? `${day}वाँ दिन` : `day ${day}`
}
