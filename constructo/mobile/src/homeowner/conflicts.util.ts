/**
 * Conflicts — pure helpers for the homeowner "settle this together" sheet
 * (design/profiler/[area].tsx, AI Notes tab). No React: keeps side-labeling
 * and the sheet copy testable and shared without threading UI state through.
 *
 * Calm Cockpit framing: a conflict is never a "warning" — it's just two
 * people's styles differing on one dimension. `conflictSides` turns the raw
 * ProfilerConflict (dimension/value + contributor ids) into two friendly,
 * named sides for the sheet to render as Cards.
 */
import type { ProfilerConflict, ProfilerContributor } from '../api/client'

export interface ConflictSide {
  name: string
  value: string
}

export interface ConflictSides {
  dimension: string
  label: string
  a: ConflictSide
  b: ConflictSide
}

/** Real ContributorRole values (backend app/models/profiler.py): owner |
 *  co_owner | family | advisor | architect. "owner" -> "Owner", "co_owner" ->
 *  "Co-owner", "family" -> "Family", "advisor" -> "Advisor", "architect" ->
 *  "Designer" (the homeowner-facing name for the architect role everywhere
 *  else in this app). Unknown/missing roles fall through to "Co-owner",
 *  matching the brief's fallback. */
function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'co_owner':
      return 'Co-owner'
    case 'family':
      return 'Family'
    case 'advisor':
      return 'Advisor'
    case 'architect':
      return 'Designer'
    default:
      return 'Co-owner'
  }
}

/** Resolve a contributor id to a display name: "You" when it's the caller's
 *  own contributor, else a role-based label, else the fallback "Co-owner"
 *  when the id doesn't match anyone in the profile's contributor list. */
function contributorName(
  contributorId: string | null | undefined,
  contributors: ProfilerContributor[],
  myContributorId: string | null | undefined,
): string {
  if (!contributorId) return 'Co-owner'
  if (contributorId === myContributorId) return 'You'
  const found = contributors.find((c) => c.id === contributorId)
  return roleLabel(found?.role)
}

/** "colors" -> "Colours", "material" -> "Materials", etc. Falls back to a
 *  title-cased version of the raw dimension string for anything unmapped. */
function dimensionLabel(dimension: string): string {
  const map: Record<string, string> = {
    colors: 'Colours',
    color: 'Colours',
    material: 'Materials',
    materials: 'Materials',
    style: 'Style',
    layout: 'Layout',
    finish: 'Finish',
  }
  if (map[dimension]) return map[dimension]
  return dimension.charAt(0).toUpperCase() + dimension.slice(1).replace(/_/g, ' ')
}

/**
 * Turn a raw conflict into two labeled, named sides for the sheet.
 *
 * `c.value` is expected to carry both sides' picks, "a|b" separated (the
 * engine's raw conflict value shape); anything else is shown as-is on side A
 * with a generic "a different choice" on side B so the sheet never renders
 * blank.
 */
export function conflictSides(
  c: ProfilerConflict,
  contributors: ProfilerContributor[],
  myContributorId?: string | null,
): ConflictSides {
  const [rawA, rawB] = c.value.includes('|') ? c.value.split('|') : [c.value, undefined]

  return {
    dimension: c.dimension,
    label: dimensionLabel(c.dimension),
    a: {
      name: contributorName(c.contributor_a_id, contributors, myContributorId),
      value: (rawA ?? '').trim() || 'One direction',
    },
    b: {
      name: contributorName(c.contributor_b_id, contributors, myContributorId),
      value: (rawB ?? '').trim() || 'A different direction',
    },
  }
}

/** "Settled by {name}: {note}" once we know who resolved it, else the
 *  quieter "Settled: {note}" — used for the read-only row once a conflict
 *  moves out of `pending`. */
export function resolvedSummary(note: string | null, resolvedByName?: string | null): string {
  const body = note && note.trim().length > 0 ? note : 'Decision recorded'
  return resolvedByName ? `Settled by ${resolvedByName}: ${body}` : `Settled: ${body}`
}

export const CONFLICT_STR = {
  en: {
    sheetEyebrow: 'SETTLE THIS TOGETHER',
    sheetTitle: 'Your styles differ',
    keepA: (name: string) => `Go with ${name}`,
    keepB: (name: string) => `Go with ${name}`,
    compromiseLabel: 'Write our own middle ground',
    compromisePlaceholder: 'Describe the middle ground…',
    compromiseCta: 'Save this decision',
    deferLabel: 'Ask our designer to decide',
    readOnlyNotice: 'Only an owner can settle this. You can talk it over in chat.',
    resolvedToast: 'Settled — this shapes your brief',
    deferredToast: 'Sent to your designer',
    deferredRow: 'Sent to your designer',
    cardButton: 'Settle this together',
    cancel: 'Cancel',
  },
  hi: {
    sheetEyebrow: 'मिलकर तय करें',
    sheetTitle: 'आपकी पसंद अलग है',
    keepA: (name: string) => `${name} की पसंद चुनें`,
    keepB: (name: string) => `${name} की पसंद चुनें`,
    compromiseLabel: 'अपना बीच का रास्ता लिखें',
    compromisePlaceholder: 'बीच का रास्ता बताएं…',
    compromiseCta: 'यह निर्णय सहेजें',
    deferLabel: 'हमारे डिज़ाइनर से तय करवाएं',
    readOnlyNotice: 'इसे केवल घर के मालिक ही तय कर सकते हैं। आप चैट में बात कर सकते हैं।',
    resolvedToast: 'तय हो गया — यह आपके ब्रीफ़ को आकार देगा',
    deferredToast: 'आपके डिज़ाइनर को भेजा गया',
    deferredRow: 'आपके डिज़ाइनर को भेजा गया',
    cardButton: 'मिलकर तय करें',
    cancel: 'रद्द करें',
  },
} as const

export type ConflictLang = keyof typeof CONFLICT_STR
