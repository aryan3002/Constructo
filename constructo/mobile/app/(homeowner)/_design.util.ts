/**
 * Local helpers for the Design Documents screen. Pure functions only — no React,
 * no side effects — so they're trivially testable and keep design.tsx lean.
 */
import type {
  DesignConflict,
  DesignContributor,
  DesignProfile,
  DesignSelection,
  Drawing,
  DrawingKind,
  Language,
} from '../../src/api/types'
import type { Status } from '../../src/theme/tokens'

/** Localised string bundle shape used by the Design screen. */
export interface DesignStrings {
  title: string
  subtitle: string
  styleEyebrow: string
  styleTitle: string
  profileEmptyTitle: string
  profileEmptyBody: string
  setupProfile: string
  toneEyebrow: string
  plansTitle: string
  plansSubtitle: string
  plansEmpty: string
  plansEmptyTitle: string
  whatChanged: string
  versionLabel: string
  pendingApproval: string
  /** DecisionCard kicker on a plan awaiting the homeowner's choice. */
  needsYourChoice: string
  /** Calm "why now" line under a pending plan ("Shared by your builder · <date>"). */
  sharedByBuilder: string
  openFile: string
  approveDrawing: string
  /** Full-width green CTA on a pending plan's DecisionCard. */
  reviewAndApprove: string
  approveDrawingComingSoon: string
  /** Eyebrow above the Plans section. */
  plansEyebrow: string
  /** Eyebrow above the coherence section. */
  coherenceEyebrow: string
  /** Eyebrow above the inspiration board. */
  inspirationEyebrow: string
  /** Eyebrow above the monthly digest. */
  digestEyebrow: string
  /** PhotoTile fallback caption / a11y labels for inspiration tiles. */
  inspirationCaption: string
  coherenceTitle: string
  coherenceSubtitle: string
  fitsLabel: string
  worthLookLabel: string
  inspirationTitle: string
  inspirationSubtitle: string
  inspirationEmpty: string
  addInspiration: string
  provenanceUpload: string
  provenancePinterest: string
  digestTitle: string
  digestComingSoon: string
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
  contributorsTitle: string
  conflictsTitle: string
  conflictsBody: string
  decideTogether: string
  conflictResolved: string
  authoritativeTag: string
  advisoryTag: string
  /** Quiet notice for a member without a design say (graceful read-only). */
  readOnlyNotice: string
  /** Entry to the confirm / re-draft style loop. */
  refreshStyle: string
  /** Per-kind drawing labels (active language). */
  kinds: Record<DrawingKind, string>
}

export const DESIGN_STR: Record<'en' | 'hi', DesignStrings> = {
  en: {
    title: 'Design',
    subtitle: 'Your style, your plans — all in one calm place.',
    styleEyebrow: 'YOUR STYLE',
    styleTitle: 'Your design profile',
    profileEmptyTitle: 'Tell us your style',
    profileEmptyBody:
      'Set up a quick design profile so every choice stays true to the home you imagine.',
    setupProfile: 'Set up your design profile',
    toneEyebrow: 'THE FEELING',
    plansTitle: 'Plans',
    plansSubtitle: 'Drawings your builder has shared.',
    plansEmpty: 'Your builder hasn’t shared any drawings yet. They’ll appear here.',
    plansEmptyTitle: 'No plans shared yet',
    whatChanged: 'WHAT CHANGED',
    versionLabel: 'Version',
    pendingApproval: 'Pending your approval',
    needsYourChoice: 'Needs your choice',
    sharedByBuilder: 'Shared by your builder',
    openFile: 'Open drawing',
    approveDrawing: 'Approve',
    reviewAndApprove: 'Review & approve',
    approveDrawingComingSoon:
      'Approving plans in the app is coming soon. For now, please confirm with your builder.',
    plansEyebrow: 'YOUR PLANS',
    coherenceEyebrow: 'COHERENCE',
    inspirationEyebrow: 'THE LOOK YOU LOVE',
    digestEyebrow: 'EACH MONTH',
    inspirationCaption: 'Reference photo',
    coherenceTitle: 'How your choices fit together',
    coherenceSubtitle: 'A gentle read on coherence — advice only, never a block.',
    fitsLabel: 'Fits your style',
    worthLookLabel: 'Worth a look',
    inspirationTitle: 'Inspiration',
    inspirationSubtitle: 'Real photos that capture the look you love.',
    inspirationEmpty: 'Add photos that capture the look you love.',
    addInspiration: 'Add inspiration',
    provenanceUpload: 'You added this',
    provenancePinterest: 'From Pinterest',
    digestTitle: 'Monthly design digest',
    digestComingSoon:
      'A warm monthly recap of how your home is taking shape is coming soon.',
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
    contributorsTitle: 'Who shaped this',
    conflictsTitle: 'Decide together',
    conflictsBody: 'A couple of choices differ. Pick one together when you’re ready.',
    decideTogether: 'Pick one',
    conflictResolved: 'Choice saved for your home.',
    authoritativeTag: 'has a say',
    advisoryTag: 'suggesting',
    readOnlyNotice: 'You can view your design space. Ask an owner for a say to make changes.',
    refreshStyle: 'Refresh your style',
    kinds: {
      plan: 'Floor plan',
      elevation: 'Elevation',
      section: 'Section',
      structural: 'Structural',
      electrical: 'Electrical',
      plumbing: 'Plumbing',
      other: 'Drawing',
    },
  },
  hi: {
    title: 'डिज़ाइन',
    subtitle: 'आपकी शैली, आपके नक्शे — सब एक शांत जगह पर।',
    styleEyebrow: 'आपकी शैली',
    styleTitle: 'आपका डिज़ाइन प्रोफ़ाइल',
    profileEmptyTitle: 'हमें अपनी शैली बताएं',
    profileEmptyBody:
      'एक छोटा डिज़ाइन प्रोफ़ाइल बनाएं ताकि हर चुनाव उस घर के अनुरूप रहे जिसकी आप कल्पना करते हैं।',
    setupProfile: 'अपना डिज़ाइन प्रोफ़ाइल बनाएं',
    toneEyebrow: 'एहसास',
    plansTitle: 'नक्शे',
    plansSubtitle: 'आपके बिल्डर द्वारा साझा किए गए नक्शे।',
    plansEmpty: 'आपके बिल्डर ने अभी तक कोई नक्शा साझा नहीं किया है। वे यहाँ दिखाई देंगे।',
    plansEmptyTitle: 'अभी तक कोई नक्शा साझा नहीं',
    whatChanged: 'क्या बदला',
    versionLabel: 'संस्करण',
    pendingApproval: 'आपकी स्वीकृति बाकी',
    needsYourChoice: 'आपका चुनाव चाहिए',
    sharedByBuilder: 'आपके बिल्डर ने साझा किया',
    openFile: 'नक्शा खोलें',
    approveDrawing: 'स्वीकृत करें',
    reviewAndApprove: 'देखें और स्वीकृत करें',
    approveDrawingComingSoon:
      'ऐप में नक्शे स्वीकृत करना जल्द आ रहा है। फ़िलहाल, कृपया अपने बिल्डर से पुष्टि करें।',
    plansEyebrow: 'आपके नक्शे',
    coherenceEyebrow: 'तालमेल',
    inspirationEyebrow: 'आपकी पसंद का रूप',
    digestEyebrow: 'हर महीने',
    inspirationCaption: 'संदर्भ तस्वीर',
    coherenceTitle: 'आपके चुनाव कैसे मेल खाते हैं',
    coherenceSubtitle: 'मेल पर एक नरम राय — सिर्फ़ सलाह, कभी रोक नहीं।',
    fitsLabel: 'आपकी शैली से मेल खाता है',
    worthLookLabel: 'एक नज़र डालें',
    inspirationTitle: 'प्रेरणा',
    inspirationSubtitle: 'असली तस्वीरें जो आपकी पसंद का रूप दर्शाती हैं।',
    inspirationEmpty: 'वे तस्वीरें जोड़ें जो आपकी पसंद का रूप दर्शाती हैं।',
    addInspiration: 'प्रेरणा जोड़ें',
    provenanceUpload: 'आपने जोड़ा',
    provenancePinterest: 'Pinterest से',
    digestTitle: 'मासिक डिज़ाइन सारांश',
    digestComingSoon:
      'आपका घर कैसे आकार ले रहा है, इसका एक गर्मजोशी भरा मासिक सारांश जल्द आ रहा है।',
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
    contributorsTitle: 'किसने आकार दिया',
    conflictsTitle: 'मिलकर तय करें',
    conflictsBody: 'कुछ चुनाव अलग हैं। जब तैयार हों, तो मिलकर एक चुनें।',
    decideTogether: 'एक चुनें',
    conflictResolved: 'आपके घर के लिए चुनाव सहेजा गया।',
    authoritativeTag: 'राय है',
    advisoryTag: 'सुझाव दे रहे',
    readOnlyNotice: 'आप अपना डिज़ाइन स्थान देख सकते हैं। बदलाव के लिए किसी मालिक से राय का अनुरोध करें।',
    refreshStyle: 'अपनी शैली ताज़ा करें',
    kinds: {
      plan: 'फ़्लोर प्लान',
      elevation: 'एलिवेशन',
      section: 'सेक्शन',
      structural: 'स्ट्रक्चरल',
      electrical: 'इलेक्ट्रिकल',
      plumbing: 'प्लंबिंग',
      other: 'नक्शा',
    },
  },
}

/** Safely pull the freeform profile text out of the loose `profile` jsonb. */
export function profileText(profile: DesignProfile | undefined): string {
  const inner = profile?.profile as { profile?: unknown } | undefined
  const text = inner?.profile
  return typeof text === 'string' ? text.trim() : ''
}

/**
 * Pull the tone keyword list out of the loose `profile` jsonb.
 *
 * Reads the tone LIST (the v2 shape), and stays tolerant of a legacy single
 * tone STRING by wrapping it — closes the known drift where a string tone
 * rendered nothing.
 */
export function profileTone(profile: DesignProfile | undefined): string[] {
  const inner = profile?.profile as { tone?: unknown } | undefined
  const tone = inner?.tone
  const list = Array.isArray(tone) ? tone : typeof tone === 'string' ? [tone] : []
  return list.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
}

/** Pull the household contributors roster out of the loose `profile` jsonb. */
export function profileContributors(profile: DesignProfile | undefined): DesignContributor[] {
  const inner = profile?.profile as { contributors?: unknown } | undefined
  const list = inner?.contributors
  if (!Array.isArray(list)) return []
  return list.filter(
    (c): c is DesignContributor =>
      typeof c === 'object' && c !== null && typeof (c as DesignContributor).name === 'string',
  )
}

/** Pull the "decide together" conflict cards out of the loose `profile` jsonb. */
export function profileConflicts(profile: DesignProfile | undefined): DesignConflict[] {
  const inner = profile?.profile as { conflicts?: unknown } | undefined
  const list = inner?.conflicts
  if (!Array.isArray(list)) return []
  return list.filter(
    (c): c is DesignConflict =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as DesignConflict).item === 'string' &&
      Array.isArray((c as DesignConflict).options),
  )
}

/** True when the profile carries no usable content yet. */
export function isProfileEmpty(profile: DesignProfile | undefined): boolean {
  return profileText(profile).length === 0 && profileTone(profile).length === 0
}

/**
 * The AI "what changed" line in the active language (render as-is, never both).
 * Falls back to the other language when the active one is missing, then to the
 * raw change note — honest empty ("" ) when nothing is shared.
 */
export function drawingSummary(drawing: Drawing, lang: Language): string {
  const active = lang === 'hi' ? drawing.plain_summary_hi : drawing.plain_summary_en
  const other = lang === 'hi' ? drawing.plain_summary_en : drawing.plain_summary_hi
  return (active ?? other ?? drawing.change_note ?? '').trim()
}

/** Localised human label for a drawing kind (tolerant of unknown kinds). */
export function drawingKindLabel(kind: DrawingKind, strings: DesignStrings): string {
  return strings.kinds[kind] ?? strings.kinds.other
}

/**
 * Short, locale-aware published-on date for a drawing ("6 Jun" / "6 जून").
 * Returns null on a missing/invalid date so callers can omit the chip.
 */
export function drawingDate(iso: string | null, lang: Language): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
  })
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

/**
 * Group selections by space, resolving each group's display name AND its
 * route slug from a real space-name map (id → name, e.g. built from
 * `homeowner.property().spaces`) — never the raw space UUID.
 *
 * `roomSlug` is what gets pushed into `design/references/[room]`; it must be
 * a NAME so `areaForRoom`'s normalizer (which matches on human names like
 * "kitchen") can bridge into the profiler. Falls back to the raw space_id
 * only when the id isn't in the map (a space the property fetch hasn't
 * caught up on yet) so the screen never throws — it just won't bridge into
 * the profiler for that one room until the name is known.
 */
export function groupSelections(
  selections: DesignSelection[],
  wholeHouseLabel: string,
  spaceNameById: Record<string, string> = {},
): Array<{ spaceId: string | null; spaceName: string; roomSlug: string; items: DesignSelection[] }> {
  const map = new Map<
    string,
    { spaceId: string | null; spaceName: string; roomSlug: string; items: DesignSelection[] }
  >()
  for (const s of selections) {
    const key = s.space_id ?? '__whole__'
    if (!map.has(key)) {
      const name = s.space_id ? (spaceNameById[s.space_id] ?? s.space_id) : wholeHouseLabel
      map.set(key, {
        spaceId: s.space_id,
        spaceName: name,
        roomSlug: s.space_id ? name : 'all',
        items: [],
      })
    }
    map.get(key)!.items.push(s)
  }
  return Array.from(map.values())
}
