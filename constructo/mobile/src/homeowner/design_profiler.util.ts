import type { ProfilerArea } from '../api/client'
import type { Status } from '../theme/tokens'

export type ConfidenceBand = 'high' | 'building' | 'low'

/** Map the reducer's confidence (0–1) to a calm band: colour + word + icon.
 *  The number is the engine's — we only present it (Determinism Doctrine). */
export function confidenceBand(confidence: number): {
  band: ConfidenceBand
  tone: Status
  label: string
  icon: string
} {
  if (confidence >= 0.75) return { band: 'high', tone: 'ok', label: 'High', icon: 'check-circle' }
  if (confidence >= 0.4) return { band: 'building', tone: 'warn', label: 'Building', icon: 'clock' }
  return { band: 'low', tone: 'quiet', label: 'Low', icon: 'circle' }
}

/** Progress as a count, never a percentage or ring (Calm Cockpit rule). */
export function areaProgressLabel(ranked: number, recommended: number): string {
  if (recommended <= 0 && ranked <= 0) return 'Not started'
  return `${ranked} of ${recommended} ranked`
}

/**
 * Resolve the area screen's SegmentedTabs key for a `?tab=` deep-link param.
 * Callers (the DPHub "Questions for you" card → `notes`; the room References
 * screen's "Rank these" button → `ranking`) push a lowercase param; any other
 * or absent value falls back to the default Inspiration tab so an unknown
 * param never crashes into a blank segment.
 */
export function areaTabForParam(tabParam: string | undefined): string {
  if (tabParam === 'notes') return 'AI Notes'
  if (tabParam === 'ranking') return 'Ranking'
  return 'Inspiration'
}

const _KIND_ORDER: Array<ProfilerArea['area_kind']> = ['house_build', 'interior', 'element']
const _KIND_LABEL: Record<string, string> = {
  house_build: 'House build',
  interior: 'Interior',
  element: 'Elements',
}

export function groupAreasByKind(
  areas: ProfilerArea[],
): Array<{ kind: string; label: string; areas: ProfilerArea[] }> {
  return _KIND_ORDER.map((kind) => ({
    kind,
    label: _KIND_LABEL[kind] ?? kind,
    areas: areas.filter((a) => a.area_kind === kind),
  })).filter((g) => g.areas.length > 0)
}

export function briefAudienceTabs(lang: 'en' | 'hi'): Array<{ key: string; label: string }> {
  const labels =
    lang === 'hi'
      ? { homeowner: 'आप', architect: 'डिज़ाइनर', contractor: 'ठेकेदार' }
      : { homeowner: 'You', architect: 'Designer', contractor: 'Contractor' }
  return [
    { key: 'homeowner', label: labels.homeowner },
    { key: 'architect', label: labels.architect },
    { key: 'contractor', label: labels.contractor },
  ]
}

/** Star labels for the 1–5 ranking + the quick tags from the prototype. */
export const RANKING_TAGS = [
  'Love overall', 'Colour only', 'Material only', 'Layout', 'Lighting',
  'Too dark', 'Too busy', 'Too expensive', 'Hard to maintain',
] as const

const _DESIGN_CHAT_DRAFT_STR = {
  en: {
    area: (area: string) => `About our ${area} design: `,
    brief: (v: number) => `About our design brief v${v}: `,
    plain: 'About our design: ',
  },
  hi: {
    area: (area: string) => `हमारी ${area} डिज़ाइन के बारे में: `,
    brief: (v: number) => `हमारे डिज़ाइन ब्रीफ़ v${v} के बारे में: `,
    plain: 'हमारे डिज़ाइन के बारे में: ',
  },
} as const

/** A prefilled opener for "ask the crew about this" — deep-linked into the
 *  design chat composer so she never faces a blank box. Area label wins over
 *  brief version (the more specific context); neither → a plain opener. */
export function designChatDraft(
  ctx: { areaLabel?: string; briefVersion?: number },
  lang: 'en' | 'hi' = 'en',
): string {
  const s = _DESIGN_CHAT_DRAFT_STR[lang] ?? _DESIGN_CHAT_DRAFT_STR.en
  if (ctx.areaLabel) return s.area(ctx.areaLabel)
  if (ctx.briefVersion != null) return s.brief(ctx.briefVersion)
  return s.plain
}

/** The route to her builder/crew thread with a prefilled draft — same params
 *  shape `messages.tsx`'s `open()` pushes, so the thread header renders
 *  identically whether she arrives from the inbox or from a design screen. */
export function designChatRoute(
  conv: { id: string; title?: string | null; site_name?: string | null },
  draft: string,
): { pathname: '/(homeowner)/messages/[id]'; params: Record<string, string> } {
  return {
    pathname: '/(homeowner)/messages/[id]',
    params: {
      id: conv.id,
      kind: 'homeowner',
      title: conv.title ?? '',
      siteName: conv.site_name ?? '',
      draft,
    },
  }
}

export const PROFILER_STR = {
  en: {
    intakeTitle: 'Your design profile',
    intakeSub: 'Rank what you love — we turn it into a clear brief.',
    briefTitle: 'Your design brief',
    rankPrompt: 'How much do you like this?',
    approve: 'Approve',
    requestChanges: 'Request changes',
    sendToArchitect: 'Send to designer',
    onlyOwnerCanApprove: 'Only a property owner can approve. You can add a comment.',
    noBriefYet: "Your brief is being prepared. We'll tell you when it's ready.",
    notSharedYet: 'Not shared with you yet.',
    intakeError: 'Could not load your design profile.',
  },
  hi: {
    intakeTitle: 'आपकी डिज़ाइन प्रोफ़ाइल',
    intakeSub: 'जो पसंद है उसे रैंक करें — हम उसे साफ़ ब्रीफ़ बनाते हैं।',
    briefTitle: 'आपका डिज़ाइन ब्रीफ़',
    rankPrompt: 'यह आपको कितना पसंद है?',
    approve: 'मंज़ूरी दें',
    requestChanges: 'बदलाव कहें',
    sendToArchitect: 'डिज़ाइनर को भेजें',
    onlyOwnerCanApprove: 'सिर्फ़ मालिक मंज़ूरी दे सकते हैं। आप टिप्पणी जोड़ सकते हैं।',
    noBriefYet: 'आपका ब्रीफ़ तैयार हो रहा है। तैयार होते ही हम बताएँगे।',
    notSharedYet: 'अभी आपके साथ साझा नहीं किया गया।',
    intakeError: 'आपकी डिज़ाइन प्रोफ़ाइल लोड नहीं हो सकी।',
  },
} as const
