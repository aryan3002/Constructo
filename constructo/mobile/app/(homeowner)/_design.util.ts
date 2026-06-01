/**
 * Local helpers for the Design Documents screen. Pure functions only — no React,
 * no side effects — so they're trivially testable and keep design.tsx lean.
 */
import type { DesignProfile, DesignSelection } from '../../src/api/types'
import type { Status } from '../../src/theme/tokens'

/** Localised string bundle shape used by the Design screen. */
export interface DesignStrings {
  title: string
  styleEyebrow: string
  profileEmptyTitle: string
  profileEmptyBody: string
  setupProfile: string
  plansTitle: string
  plansEmpty: string
  approveDrawing: string
  approveDrawingComingSoon: string
  inspirationTitle: string
  inspirationEmpty: string
  addInspiration: string
  selectionsTitle: string
  selectionsEmpty: string
  checkFit: string
  addSelectionTitle: string
  itemLabel: string
  choiceLabel: string
  addSelection: string
  loading: string
  errorTitle: string
  retry: string
  permissionDenied: string
  added: string
  adviceNote: string
}

export const DESIGN_STR: Record<'en' | 'hi', DesignStrings> = {
  en: {
    title: 'Design',
    styleEyebrow: 'YOUR STYLE',
    profileEmptyTitle: 'Tell us your style',
    profileEmptyBody:
      'Set up a quick design profile so every choice stays true to the home you imagine.',
    setupProfile: 'Set up your design profile',
    plansTitle: 'Plans',
    plansEmpty: 'Your approved drawings will appear here.',
    approveDrawing: 'Approve drawing',
    approveDrawingComingSoon: 'Drawing approval coming soon',
    inspirationTitle: 'Inspiration',
    inspirationEmpty: 'Add photos that capture the look you love.',
    addInspiration: 'Add inspiration',
    selectionsTitle: 'Selections',
    selectionsEmpty: 'No selections yet. Add your first one below.',
    checkFit: 'Check fit',
    addSelectionTitle: 'Add a selection',
    itemLabel: 'Item (e.g. Living room flooring)',
    choiceLabel: 'Choice (e.g. Oak engineered wood)',
    addSelection: 'Add selection',
    loading: 'Loading your design space…',
    errorTitle: 'Could not load this section',
    retry: 'Try again',
    permissionDenied: 'Photo access is needed to add inspiration.',
    added: 'Added to your inspiration board.',
    adviceNote: 'This is friendly advice — it never blocks your choice.',
  },
  hi: {
    title: 'डिज़ाइन',
    styleEyebrow: 'आपकी शैली',
    profileEmptyTitle: 'हमें अपनी शैली बताएं',
    profileEmptyBody:
      'एक छोटा डिज़ाइन प्रोफ़ाइल बनाएं ताकि हर चुनाव उस घर के अनुरूप रहे जिसकी आप कल्पना करते हैं।',
    setupProfile: 'अपना डिज़ाइन प्रोफ़ाइल बनाएं',
    plansTitle: 'नक्शे',
    plansEmpty: 'आपके स्वीकृत नक्शे यहाँ दिखाई देंगे।',
    approveDrawing: 'नक्शा स्वीकृत करें',
    approveDrawingComingSoon: 'ड्रॉइंग अप्रूवल जल्द आ रहा है',
    inspirationTitle: 'प्रेरणा',
    inspirationEmpty: 'वे तस्वीरें जोड़ें जो आपकी पसंद का रूप दर्शाती हैं।',
    addInspiration: 'प्रेरणा जोड़ें',
    selectionsTitle: 'चयन',
    selectionsEmpty: 'अभी तक कोई चयन नहीं। नीचे अपना पहला चयन जोड़ें।',
    checkFit: 'उपयुक्तता जांचें',
    addSelectionTitle: 'एक चयन जोड़ें',
    itemLabel: 'वस्तु (जैसे लिविंग रूम का फर्श)',
    choiceLabel: 'विकल्प (जैसे ओक इंजीनियर्ड लकड़ी)',
    addSelection: 'चयन जोड़ें',
    loading: 'आपका डिज़ाइन स्थान लोड हो रहा है…',
    errorTitle: 'यह अनुभाग लोड नहीं हो सका',
    retry: 'पुनः प्रयास करें',
    permissionDenied: 'प्रेरणा जोड़ने के लिए फ़ोटो की अनुमति आवश्यक है।',
    added: 'आपके प्रेरणा बोर्ड में जोड़ा गया।',
    adviceNote: 'यह मित्रवत सलाह है — यह आपके चयन को कभी नहीं रोकती।',
  },
}

/** Safely pull the freeform profile text out of the loose `profile` jsonb. */
export function profileText(profile: DesignProfile | undefined): string {
  const inner = profile?.profile as { profile?: unknown } | undefined
  const text = inner?.profile
  return typeof text === 'string' ? text.trim() : ''
}

/** Pull the tone keyword list out of the loose `profile` jsonb. */
export function profileTone(profile: DesignProfile | undefined): string[] {
  const inner = profile?.profile as { tone?: unknown } | undefined
  const tone = inner?.tone
  if (!Array.isArray(tone)) return []
  return tone.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

/** True when the profile carries no usable content yet. */
export function isProfileEmpty(profile: DesignProfile | undefined): boolean {
  return profileText(profile).length === 0 && profileTone(profile).length === 0
}

/** Map a selection's freeform status onto the shared status spine. */
export function selectionStatus(selection: DesignSelection): Status {
  switch (selection.status?.toLowerCase()) {
    case 'approved':
    case 'final':
    case 'done':
      return 'ok'
    case 'rejected':
    case 'blocked':
      return 'risk'
    case 'pending':
    case 'proposed':
    case 'review':
      return 'warn'
    default:
      return 'info'
  }
}
