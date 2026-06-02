/**
 * Local helpers for the Settings cluster (settings · members · notifications).
 * Owned by the settings flow only — not a shared module. Strings live here in
 * the per-screen en/hi pattern (NOT the i18n catalog — founder's WIP).
 */
import type { Capabilities, HomeownerMember, HomeownerSubRole } from '../../src/api/types'

export type Lang = 'en' | 'hi'

// ---- Notification cadence -------------------------------------------------

/** Per-category delivery cadence. `spike` events always punch through. */
export type Cadence = 'as_it_happens' | 'daily' | 'weekly' | 'pause'

export const CADENCES: Cadence[] = ['as_it_happens', 'daily', 'weekly', 'pause']

export const CADENCE_LABEL: Record<Cadence, Record<Lang, string>> = {
  as_it_happens: { en: 'As it happens', hi: 'जैसे ही हो' },
  daily: { en: 'Daily', hi: 'रोज़' },
  weekly: { en: 'Weekly', hi: 'साप्ताहिक' },
  pause: { en: 'Paused', hi: 'रोका हुआ' },
}

/** A notification category the homeowner can tune. `wired` = backed by a real
 *  delivery hook today; `false` = honest placeholder (label it in the UI). */
export interface NotifCategory {
  key: string
  label: Record<Lang, string>
  desc: Record<Lang, string>
  /** false → no backend delivery hook yet; show an honest "coming soon" note. */
  wired: boolean
}

export const NOTIF_CATEGORIES: NotifCategory[] = [
  {
    key: 'site_updates',
    label: { en: 'Site updates', hi: 'साइट अपडेट' },
    desc: {
      en: 'Photos, progress, and milestones from your builder.',
      hi: 'आपके बिल्डर से तस्वीरें, प्रगति और पड़ाव।',
    },
    wired: true,
  },
  {
    key: 'weekly_summary',
    label: { en: 'Weekly summary', hi: 'साप्ताहिक सारांश' },
    desc: {
      en: 'The "this week" letter — what got done, what is next.',
      hi: '"इस सप्ताह" का पत्र — क्या हुआ, आगे क्या है।',
    },
    wired: true,
  },
  {
    key: 'design',
    label: { en: 'Design & decisions', hi: 'डिज़ाइन और निर्णय' },
    desc: {
      en: 'New plans and choices waiting for the household.',
      hi: 'नए नक्शे और विकल्प जो परिवार की राह देख रहे हैं।',
    },
    // No dedicated design push channel is wired yet — honest placeholder.
    wired: false,
  },
]

/** Default cadence when a category has no stored preference yet. */
export const DEFAULT_CADENCE: Cadence = 'as_it_happens'

/**
 * Read the stored cadence map out of a member's `notif_prefs` jsonb. We keep
 * cadences under a `cadence` sub-object so other prefs (e.g. `push_token`) are
 * never clobbered. Unknown/missing values fall back to {@link DEFAULT_CADENCE}.
 */
export function readCadence(prefs: Record<string, unknown> | undefined, key: string): Cadence {
  const map = (prefs?.cadence ?? {}) as Record<string, unknown>
  const v = map?.[key]
  return CADENCES.includes(v as Cadence) ? (v as Cadence) : DEFAULT_CADENCE
}

/**
 * Merge a single category's new cadence into the full prefs blob (preserving
 * everything else — push_token, future keys). Returns the object to PATCH.
 */
export function withCadence(
  prefs: Record<string, unknown> | undefined,
  key: string,
  cadence: Cadence,
): Record<string, unknown> {
  const existing = (prefs?.cadence ?? {}) as Record<string, unknown>
  return { ...(prefs ?? {}), cadence: { ...existing, [key]: cadence } }
}

/** The "headline" cadence for the Settings-hub subtitle: the cadence shared by
 *  all WIRED categories, else "Mixed". */
export function summaryCadence(prefs: Record<string, unknown> | undefined, lang: Lang): string {
  const wired = NOTIF_CATEGORIES.filter((c) => c.wired)
  const values = wired.map((c) => readCadence(prefs, c.key))
  const allSame = values.every((v) => v === values[0])
  if (allSame && values.length > 0) return CADENCE_LABEL[values[0]][lang]
  return lang === 'hi' ? 'मिश्रित' : 'Mixed'
}

// ---- Roles & capabilities (graceful authority) ----------------------------

export function subRoleLabel(role: HomeownerSubRole, lang: Lang): string {
  const map: Record<HomeownerSubRole, Record<Lang, string>> = {
    primary_owner: { en: 'Primary owner', hi: 'मुख्य मालिक' },
    co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
    family: { en: 'Family', hi: 'परिवार' },
    advisor: { en: 'Advisor', hi: 'सलाहकार' },
  }
  return map[role]?.[lang] ?? role
}

/**
 * The one-line capability sentence per role — graceful authority. Every role
 * gets a clear statement of what they CAN do; we NEVER show a grey lock or a
 * "you can't" message (handoff §5).
 */
export function capabilityLine(role: HomeownerSubRole, lang: Lang): string {
  const map: Record<HomeownerSubRole, Record<Lang, string>> = {
    primary_owner: {
      en: 'Can approve costs, manage the household, and decide design.',
      hi: 'खर्च मंज़ूर कर सकते हैं, परिवार संभाल सकते हैं और डिज़ाइन तय कर सकते हैं।',
    },
    co_owner: {
      en: 'Can approve costs — the same authority as the owner.',
      hi: 'खर्च मंज़ूर कर सकते हैं — मालिक जैसी ही अधिकारिता।',
    },
    family: {
      en: 'Can follow the build, comment, and flag concerns.',
      hi: 'निर्माण देख सकते हैं, टिप्पणी और चिंता जता सकते हैं।',
    },
    advisor: {
      en: 'Can view and suggest on design choices.',
      hi: 'डिज़ाइन विकल्पों पर देख और सुझाव दे सकते हैं।',
    },
  }
  return map[role]?.[lang] ?? ''
}

/** "Can design" sentence appended for members with a design say. */
export function designLine(member: HomeownerMember, lang: Lang): string | null {
  if (!member.can_design) return null
  if (member.design_space_id) {
    return lang === 'hi' ? 'एक कमरे के डिज़ाइन में राय है।' : 'Has a say on one room’s design.'
  }
  return lang === 'hi' ? 'पूरे घर के डिज़ाइन में राय है।' : 'Has a say on the whole home’s design.'
}

/** True when these capabilities can manage the household roster. */
export function canManage(caps: Capabilities | undefined): boolean {
  if (!caps) return false
  return caps.can_manage_members === true || caps.sub_role === 'primary_owner'
}
