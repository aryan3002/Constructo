/**
 * Pure helpers + strings for the two Design write sub-routes
 * (app/(homeowner)/design/select.tsx · design/profile.tsx). No React, no side
 * effects — keeps the screens lean and the logic unit-testable.
 *
 * These power the genuinely-new design write-back: a room-scoped, status-aware
 * SELECTION flow with a pre-commit consistency check, and the "confirm / re-draft
 * your style" PROFILE loop (PUT /design/profile). Both are capability-gated by the
 * caller (only a `can_design` member may write; a room-narrowed member may write
 * only her own space).
 */
import type { DesignProfile, Language, Space } from '../../src/api/types'

/** The two status values the homeowner can set on a selection. */
export const SELECTION_STATUSES = ['proposed', 'final'] as const
export type SelectionStatusChoice = (typeof SELECTION_STATUSES)[number]

/**
 * The rooms she may write to. A room-narrowed member (`scopedSpaceId` set, e.g.
 * a family member given a say over one room) sees ONLY that room — mirroring the
 * server's `design_room_only` gate; everyone else sees every room.
 */
export function visibleSpaces(spaces: Space[], scopedSpaceId: string | null): Space[] {
  if (!scopedSpaceId) return spaces
  return spaces.filter((s) => s.id === scopedSpaceId)
}

/**
 * Build the `profile` payload for a confirming PUT: carry every key the draft
 * returned (per_room / contributors / conflicts / source) through UNTOUCHED, and
 * override only the two she edited — the prose and the tone keywords. Editing the
 * prose must never drop the conflict cards or contributor roster.
 */
export function buildProfilePayload(
  draft: DesignProfile | undefined,
  text: string,
  tones: string[],
): Record<string, unknown> {
  const inner = (draft?.profile as Record<string, unknown> | undefined) ?? {}
  return { ...inner, profile: text.trim(), tone: tones }
}

/** Localised copy for the room-scoped, status-aware selection sheet. */
export interface SelectStrings {
  title: string
  subtitle: string
  roomLabel: string
  wholeHouse: string
  itemLabel: string
  itemPlaceholder: string
  choiceLabel: string
  choicePlaceholder: string
  checkFit: string
  fits: string
  worthLook: string
  adviceNote: string
  checkFitErr: string
  statusLabel: string
  statusProposed: string
  statusFinal: string
  save: string
  saved: string
  loadingRooms: string
  noRooms: string
  back: string
  errorTitle: string
  retry: string
  saveErr: string
}

export const SELECT_STR: Record<'en' | 'hi', SelectStrings> = {
  en: {
    title: 'Add a selection',
    subtitle: 'Pick a room, name the choice, and we’ll check it fits your style.',
    roomLabel: 'Which room?',
    wholeHouse: 'Whole house',
    itemLabel: 'Item',
    itemPlaceholder: 'e.g. Living room flooring',
    choiceLabel: 'Your choice',
    choicePlaceholder: 'e.g. Oak engineered wood',
    checkFit: 'Check fit',
    fits: 'Fits your style',
    worthLook: 'Worth a look',
    adviceNote: 'Friendly advice — it never blocks your choice.',
    checkFitErr: 'Couldn’t check fit just now — you can still save your choice.',
    statusLabel: 'Status',
    statusProposed: 'Proposed',
    statusFinal: 'Final',
    save: 'Save selection',
    saved: 'Saved to your design space.',
    loadingRooms: 'Loading your rooms…',
    noRooms: 'No rooms yet — your builder adds these as the home takes shape.',
    back: 'Back',
    errorTitle: 'We couldn’t load your rooms just now.',
    retry: 'Try again',
    saveErr: 'We couldn’t save that just now. Please try again.',
  },
  hi: {
    title: 'एक चयन जोड़ें',
    subtitle: 'एक कमरा चुनें, अपना विकल्प बताएं — हम जांचेंगे कि यह आपकी शैली से मेल खाता है।',
    roomLabel: 'कौन सा कमरा?',
    wholeHouse: 'पूरा घर',
    itemLabel: 'वस्तु',
    itemPlaceholder: 'जैसे लिविंग रूम का फर्श',
    choiceLabel: 'आपका विकल्प',
    choicePlaceholder: 'जैसे ओक इंजीनियर्ड लकड़ी',
    checkFit: 'उपयुक्तता जांचें',
    fits: 'आपकी शैली से मेल खाता है',
    worthLook: 'एक नज़र डालें',
    adviceNote: 'मित्रवत सलाह — यह आपके चयन को कभी नहीं रोकती।',
    checkFitErr: 'अभी उपयुक्तता जांच नहीं हो सकी — आप फिर भी अपना विकल्प सहेज सकते हैं।',
    statusLabel: 'स्थिति',
    statusProposed: 'विचाराधीन',
    statusFinal: 'अंतिम',
    save: 'चयन सहेजें',
    saved: 'आपके डिज़ाइन स्थान में सहेजा गया।',
    loadingRooms: 'आपके कमरे लोड हो रहे हैं…',
    noRooms: 'अभी कोई कमरा नहीं — जैसे-जैसे घर आकार लेगा, आपका बिल्डर इन्हें जोड़ेगा।',
    back: 'वापस',
    errorTitle: 'आपके कमरे अभी लोड नहीं हो सके।',
    retry: 'पुनः प्रयास करें',
    saveErr: 'अभी सहेज नहीं सके। कृपया दोबारा कोशिश करें।',
  },
}

/** Localised copy for the confirm / re-draft style loop. */
export interface ProfileStrings {
  title: string
  subtitle: string
  currentEmpty: string
  draftCta: string
  createCta: string
  drafting: string
  draftHint: string
  profileLabel: string
  profilePlaceholder: string
  toneLabel: string
  tonePlaceholder: string
  addTone: string
  save: string
  saved: string
  back: string
  draftErr: string
  saveErr: string
}

export const PROFILE_STR: Record<'en' | 'hi', ProfileStrings> = {
  en: {
    title: 'Your style',
    subtitle: 'A calm read of the home you imagine — yours to shape.',
    currentEmpty: 'You don’t have a style profile yet. Draft one to get started.',
    draftCta: 'Draft an updated style',
    createCta: 'Create your style profile',
    drafting: 'Reading your choices…',
    draftHint: 'Here’s a fresh read of your style — tweak it and save.',
    profileLabel: 'Your style, in words',
    profilePlaceholder: 'Warm, light-filled, rooted in natural materials…',
    toneLabel: 'The feeling',
    tonePlaceholder: 'Add a word (e.g. calm)',
    addTone: 'Add',
    save: 'Save my style',
    saved: 'Saved — this is your style now.',
    back: 'Back',
    draftErr: 'We couldn’t draft your style just now. Please try again.',
    saveErr: 'We couldn’t save your style just now. Please try again.',
  },
  hi: {
    title: 'आपकी शैली',
    subtitle: 'जिस घर की आप कल्पना करते हैं उसका एक शांत चित्र — आपके हाथों में।',
    currentEmpty: 'अभी आपके पास कोई शैली प्रोफ़ाइल नहीं है। शुरू करने के लिए एक बनाएं।',
    draftCta: 'अपडेटेड शैली का मसौदा बनाएं',
    createCta: 'अपनी शैली प्रोफ़ाइल बनाएं',
    drafting: 'आपके चुनाव पढ़े जा रहे हैं…',
    draftHint: 'यह आपकी शैली का एक नया चित्र है — इसे बदलें और सहेजें।',
    profileLabel: 'शब्दों में आपकी शैली',
    profilePlaceholder: 'गर्म, रोशनी से भरा, प्राकृतिक सामग्री में बसा…',
    toneLabel: 'एहसास',
    tonePlaceholder: 'एक शब्द जोड़ें (जैसे शांत)',
    addTone: 'जोड़ें',
    save: 'मेरी शैली सहेजें',
    saved: 'सहेजा गया — अब यही आपकी शैली है।',
    back: 'वापस',
    draftErr: 'अभी आपकी शैली का मसौदा नहीं बना सके। कृपया दोबारा कोशिश करें।',
    saveErr: 'अभी आपकी शैली सहेज नहीं सके। कृपया दोबारा कोशिश करें।',
  },
}
