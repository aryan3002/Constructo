/**
 * Theme decisions — pure helpers for the homeowner "commit a theme" flow
 * (design/profiler/[area].tsx, AI Notes tab). An owner/co-owner turns each
 * AI-suggested theme into a real decision: approve ("Love it"), adjust
 * ("Close, adjust" — optional note), or reject ("Not this one"). No React:
 * keeps the tone map + attribution testable and shared without threading
 * UI state through.
 *
 * Determinism doctrine: the LLM drafts the theme; a named human commits it.
 * `decided_by` on the theme is that human's user id — `decidedAttribution`
 * turns it into "Decided by you" only when it matches the caller, and
 * otherwise omits attribution entirely rather than guessing a name (the
 * API doesn't resolve other users' display names for this surface).
 */
import type { Status } from '../theme/tokens'

/** approved -> ok (settled well), adjusted -> warn (a note attached, still
 *  moving), rejected -> quiet (set aside, not a failure). Anything else
 *  (suggested, unrecognised) is not yet a decision -> quiet. */
export function themeDecisionTone(status: string): Status {
  if (status === 'approved') return 'ok'
  if (status === 'adjusted') return 'warn'
  return 'quiet'
}

/** "Decided by you" when `decidedBy` equals the caller's own user id, else
 *  null (omit attribution — never guess another person's name). */
export function decidedAttribution(
  decidedBy: string | null | undefined,
  myUserId: string | null | undefined,
): string | null {
  if (!decidedBy || !myUserId) return null
  return decidedBy === myUserId ? 'Decided by you' : null
}

export const THEME_DECISION_STR = {
  en: {
    approve: 'Love it',
    adjust: 'Close, adjust',
    reject: 'Not this one',
    adjustSheetEyebrow: 'A NOTE FOR YOUR DESIGNER',
    adjustSheetTitle: "What's close, but not quite?",
    adjustPlaceholder: 'Optional — tell your designer what to tweak…',
    adjustSubmit: 'Save adjustment',
    adjustSkip: 'Save without a note',
    cancel: 'Cancel',
    decidedToast: 'Noted — this shapes your brief',
  },
  hi: {
    approve: 'यह पसंद है',
    adjust: 'लगभग सही, बदलाव चाहिए',
    reject: 'यह नहीं',
    adjustSheetEyebrow: 'आपके डिज़ाइनर के लिए टिप्पणी',
    adjustSheetTitle: 'क्या बदलना चाहिए?',
    adjustPlaceholder: 'वैकल्पिक — डिज़ाइनर को बताएं क्या बदलें…',
    adjustSubmit: 'बदलाव सहेजें',
    adjustSkip: 'बिना टिप्पणी सहेजें',
    cancel: 'रद्द करें',
    decidedToast: 'दर्ज हो गया — यह आपके ब्रीफ़ को आकार देगा',
  },
} as const

export type ThemeDecisionLang = keyof typeof THEME_DECISION_STR
