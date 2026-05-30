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
