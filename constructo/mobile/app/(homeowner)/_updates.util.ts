/**
 * Helpers local to the Project Updates screen (app/(homeowner)/updates.tsx).
 * Pure functions only — no React, no shared-file edits.
 */
import type { Language, Update } from '../../src/api/types'
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

/** The structured story behind a delay (Calm Cockpit §5/§8). */
export interface DelayStory {
  revisedDate: string
  reason: string
  impactDays: number | null
  impactCost: number | null
}

/**
 * A delay only earns the red treatment when it carries the full story: a revised
 * date + a reason + at least one measured impact (days and/or cost). Returns the
 * story when complete, or `null` when the entry is not a delay or is missing any
 * piece — callers degrade a story-less delay to a calm (non-red) entry rather
 * than fabricate a date/impact the contractor never gave.
 */
export function delayStory(u: Update): DelayStory | null {
  if (u.type !== 'delay') return null
  const hasImpact = u.impact_days != null || u.impact_cost_delta != null
  if (!u.revised_date || !u.reason || !hasImpact) return null
  return {
    revisedDate: u.revised_date,
    reason: u.reason,
    impactDays: u.impact_days ?? null,
    impactCost: u.impact_cost_delta ?? null,
  }
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

/**
 * Honest, inclusive elapsed day count for a started milestone — the start date
 * itself is "day 1", so a phase begun 7 days ago reads "day 8". Returns `null`
 * when there's no start date, the date is unparseable, or the start is still in
 * the future (the phase hasn't begun). This is REAL project time — distinct from
 * the industry-typical range, which is only a reference.
 */
export function elapsedDays(startedOn: string | null, now: Date = new Date()): number | null {
  if (!startedOn) return null
  const start = new Date(startedOn)
  if (Number.isNaN(start.getTime())) return null
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const diff = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY)
  if (diff < 0) return null
  return diff + 1
}

/**
 * Label a curated INDUSTRY-typical duration range as "usually X–Y days" (never
 * project-specific). Returns `null` when no range is known, so the UI omits the
 * line rather than fabricating one.
 */
export function formatTypicalRange(range: [number, number] | null, lang: Language): string | null {
  if (!range) return null
  const [min, max] = range
  return lang === 'hi'
    ? `आमतौर पर ${min}–${max} दिन`
    : `usually ${min}–${max} days`
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
