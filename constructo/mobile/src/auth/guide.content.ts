/**
 * "What's what" — the one reference every signed-out screen can open, plus the
 * per-role tab tours shown on the welcome screens.
 *
 * Templated truth only: every line describes what the product ACTUALLY does
 * (spec §2). Copy lives here (not the i18n catalog) because it is structured
 * content — ordered sections with bullet lists — and both languages must stay
 * in lock-step, which `guide.content.test.ts` enforces.
 */
import type { Feather } from '@expo/vector-icons'

import type { Role } from '../api/types'

export type FeatherName = React.ComponentProps<typeof Feather>['name']
export type Lang = 'en' | 'hi'

export type GuideSectionId = 'doors' | 'joinCode' | 'otp' | 'roles' | 'notEnabled' | 'privacy'

export interface GuideSection {
  id: GuideSectionId
  icon: FeatherName
  title: string
  body: string[]
}

type L<T> = Record<Lang, T>

const SECTION_ORDER: GuideSectionId[] = ['doors', 'joinCode', 'otp', 'roles', 'notEnabled', 'privacy']

const SECTION_ICON: Record<GuideSectionId, FeatherName> = {
  doors: 'log-in',
  joinCode: 'key',
  otp: 'message-square',
  roles: 'users',
  notEnabled: 'slash',
  privacy: 'shield',
}

const SECTION_TITLE: Record<GuideSectionId, L<string>> = {
  doors: { en: 'Two doors, one app', hi: 'एक ऐप, दो दरवाज़े' },
  joinCode: { en: 'The join code', hi: 'जॉइन कोड' },
  otp: { en: 'The one-time code', hi: 'एक बार का कोड (OTP)' },
  roles: { en: "Who's who on a site", hi: 'साइट पर कौन क्या है' },
  notEnabled: { en: 'Number not enabled?', hi: 'नंबर चालू नहीं है?' },
  privacy: { en: 'Your number & privacy', hi: 'आपका नंबर और निजता' },
}

const SECTION_BODY: Record<GuideSectionId, L<string[]>> = {
  doors: {
    en: [
      'Homeowner — you are having a home built or renovated. You enter with the join code your builder sent you. After that, just your phone number.',
      'Builder / site team — you run sites: owner, PM, supervisor, accountant, mukadam or architect. You sign in with your phone number.',
      'Picked the wrong door? Go back — nothing is saved until you are in.',
    ],
    hi: [
      'घर-मालिक — आपका घर बन रहा है या रिनोवेट हो रहा है। आप बिल्डर से मिले जॉइन कोड से अंदर आते हैं। उसके बाद सिर्फ़ फ़ोन नंबर।',
      'बिल्डर / साइट टीम — आप साइट चलाते हैं: मालिक, PM, सुपरवाइज़र, अकाउंटेंट, मुकादम या आर्किटेक्ट। आप फ़ोन नंबर से साइन इन करते हैं।',
      'गलत दरवाज़ा चुन लिया? वापस जाएँ — अंदर आने तक कुछ सेव नहीं होता।',
    ],
  },
  joinCode: {
    en: [
      'A short code your builder creates for you and your family, one per person.',
      'It arrives on WhatsApp or SMS. If you tapped a link, the code fills itself in.',
      'A code works once. If it says "already used", sign in with your phone instead.',
      "Can't find it? Ask your builder to re-send it from their Neev app.",
    ],
    hi: [
      'एक छोटा कोड जो आपका बिल्डर आपके और परिवार के लिए बनाता है — हर व्यक्ति का अलग।',
      'यह WhatsApp या SMS पर आता है। लिंक टैप किया हो तो कोड खुद भर जाता है।',
      'एक कोड एक बार चलता है। "पहले इस्तेमाल हो चुका" दिखे तो फ़ोन से साइन इन करें।',
      'नहीं मिल रहा? बिल्डर से कहें कि अपने Neev ऐप से दोबारा भेजें।',
    ],
  },
  otp: {
    en: [
      'There is no password. Each time you sign in we text a 6-digit code to your number.',
      'Type it (or let your phone fill it) and you are in. It expires quickly, so use the latest one.',
      'Nothing arrived? Wait 30 seconds and tap "Resend code".',
    ],
    hi: [
      'कोई पासवर्ड नहीं है। हर बार साइन इन पर हम आपके नंबर पर 6 अंकों का कोड भेजते हैं।',
      'उसे डालें (या फ़ोन खुद भर दे) और आप अंदर। यह जल्दी खत्म होता है, इसलिए सबसे नया कोड डालें।',
      'कुछ नहीं आया? 30 सेकंड रुकें और "कोड दोबारा भेजें" दबाएँ।',
    ],
  },
  roles: {
    en: [
      'Owner — runs the company: sites, approvals, money.',
      'PM — plans the work and reviews the daily report.',
      'Supervisor — on site every day: tasks, photos, audits.',
      'Accountant — reconciles payments and bills.',
      'Mukadam — the labour contractor: attendance and wages.',
      'Architect — design brief, selections, drawings.',
      'Homeowner — follows the build: photos, updates, decisions.',
    ],
    hi: [
      'मालिक — कंपनी चलाता है: साइट, मंज़ूरी, पैसा।',
      'PM — काम की योजना बनाता है और रोज़ की रिपोर्ट देखता है।',
      'सुपरवाइज़र — रोज़ साइट पर: काम, तस्वीरें, ऑडिट।',
      'अकाउंटेंट — भुगतान और बिल मिलाता है।',
      'मुकादम — लेबर ठेकेदार: हाज़िरी और मज़दूरी।',
      'आर्किटेक्ट — डिज़ाइन ब्रीफ़, चयन, ड्रॉइंग।',
      'घर-मालिक — निर्माण देखता है: तस्वीरें, अपडेट, फ़ैसले।',
    ],
  },
  notEnabled: {
    en: [
      'Neev is in a pilot. Only numbers on the pilot list can sign in as builder or site team.',
      'If you see "not enabled yet", ask your Neev contact to add your number — it takes a minute.',
      'Homeowners are always welcome: the join code from your builder is all you need.',
    ],
    hi: [
      'Neev अभी पायलट में है। सिर्फ़ पायलट सूची के नंबर बिल्डर या साइट टीम के रूप में साइन इन कर सकते हैं।',
      '"अभी चालू नहीं" दिखे तो अपने Neev संपर्क से नंबर जुड़वाएँ — एक मिनट लगता है।',
      'घर-मालिकों का हमेशा स्वागत है: बिल्डर से मिला जॉइन कोड ही काफ़ी है।',
    ],
  },
  privacy: {
    en: [
      'Your number is used to sign you in and to show your name to the people on your site.',
      'We never show it to anyone outside your site, and we never sell it.',
      'You can delete your account any time from Settings.',
    ],
    hi: [
      'आपका नंबर आपको साइन इन कराने और आपकी साइट के लोगों को आपका नाम दिखाने के लिए इस्तेमाल होता है।',
      'हम इसे आपकी साइट के बाहर किसी को नहीं दिखाते, और कभी बेचते नहीं।',
      'आप कभी भी सेटिंग्स से अपना खाता हटा सकते हैं।',
    ],
  },
}

const DEV_OTP_LINE: L<string> = {
  en: 'Dev build: the code is always 000000.',
  hi: 'डेव बिल्ड: कोड हमेशा 000000 है।',
}

/** The six "What's what" sections, in reading order. */
export function guideSections(lang: Lang, opts: { dev: boolean }): GuideSection[] {
  return SECTION_ORDER.map((id) => {
    const body = [...SECTION_BODY[id][lang]]
    if (id === 'otp' && opts.dev) body.push(DEV_OTP_LINE[lang])
    return { id, icon: SECTION_ICON[id], title: SECTION_TITLE[id][lang], body }
  })
}

// ─── Welcome tours ──────────────────────────────────────────────────────────

export type TourRole = Role

export interface TourRow {
  icon: FeatherName
  title: string
  body: string
}

export const ROLE_LABEL: Record<TourRole, L<string>> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  pm: { en: 'Project Manager', hi: 'प्रोजेक्ट मैनेजर' },
  supervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },
  accountant: { en: 'Accountant', hi: 'अकाउंटेंट' },
  labor_contractor: { en: 'Mukadam', hi: 'मुकादम' },
  architect: { en: 'Architect', hi: 'आर्किटेक्ट' },
  procurement: { en: 'Procurement', hi: 'खरीद' },
  homeowner: { en: 'Homeowner', hi: 'घर-मालिक' },
}

type TourDef = { icon: FeatherName; title: L<string>; body: L<string> }

const ROLE_TOUR: Record<TourRole, TourDef[]> = {
  owner: [
    { icon: 'grid', title: { en: 'Brief', hi: 'ब्रीफ़' }, body: { en: 'Your morning read: what moved, what needs you.', hi: 'सुबह की नज़र: क्या बढ़ा, क्या आपका इंतज़ार कर रहा है।' } },
    { icon: 'map-pin', title: { en: 'Sites', hi: 'साइट्स' }, body: { en: 'Every site, its health and its people.', hi: 'हर साइट, उसकी हालत और उसके लोग।' } },
    { icon: 'message-circle', title: { en: 'Chat', hi: 'चैट' }, body: { en: 'Site groups with your crew and the homeowner.', hi: 'टीम और घर-मालिक के साथ साइट ग्रुप।' } },
    { icon: 'layers', title: { en: 'Specs', hi: 'स्पेक्स' }, body: { en: 'Materials and finishes, decided and recorded.', hi: 'सामग्री और फ़िनिश — तय और दर्ज।' } },
    { icon: 'check-square', title: { en: 'Approvals', hi: 'मंज़ूरी' }, body: { en: 'Payments and changes waiting on your yes.', hi: 'भुगतान और बदलाव जो आपकी हाँ का इंतज़ार कर रहे हैं।' } },
  ],
  supervisor: [
    { icon: 'home', title: { en: 'Home', hi: 'होम' }, body: { en: "Today's plan for your site at a glance.", hi: 'आज की साइट योजना एक नज़र में।' } },
    { icon: 'check-square', title: { en: 'Tasks', hi: 'काम' }, body: { en: 'What to do, who does it, what is done.', hi: 'क्या करना है, कौन करेगा, क्या हो गया।' } },
    { icon: 'camera', title: { en: 'Capture', hi: 'कैप्चर' }, body: { en: 'Photos and notes from the site — the daily record.', hi: 'साइट से तस्वीरें और नोट — रोज़ का रिकॉर्ड।' } },
    { icon: 'message-circle', title: { en: 'Chat', hi: 'चैट' }, body: { en: 'Your site groups.', hi: 'आपके साइट ग्रुप।' } },
    { icon: 'more-horizontal', title: { en: 'More', hi: 'और' }, body: { en: 'Audits, drawings, your profile.', hi: 'ऑडिट, ड्रॉइंग, आपकी प्रोफ़ाइल।' } },
  ],
  pm: [
    { icon: 'file-text', title: { en: 'DPR', hi: 'DPR' }, body: { en: 'The daily progress report, drafted for your review.', hi: 'रोज़ की प्रगति रिपोर्ट, आपकी समीक्षा के लिए तैयार।' } },
    { icon: 'message-circle', title: { en: 'Chat', hi: 'चैट' }, body: { en: 'Your site groups.', hi: 'आपके साइट ग्रुप।' } },
    { icon: 'more-horizontal', title: { en: 'More', hi: 'और' }, body: { en: 'Sites, settings, your profile.', hi: 'साइट्स, सेटिंग्स, आपकी प्रोफ़ाइल।' } },
  ],
  accountant: [
    { icon: 'credit-card', title: { en: 'Reconcile', hi: 'मिलान' }, body: { en: 'Match payments to bills and site work.', hi: 'भुगतान को बिल और साइट के काम से मिलाएँ।' } },
    { icon: 'dollar-sign', title: { en: 'Payments', hi: 'भुगतान' }, body: { en: 'What went out, to whom, and why.', hi: 'क्या गया, किसे, और क्यों।' } },
    { icon: 'more-horizontal', title: { en: 'More', hi: 'और' }, body: { en: 'Sites, settings, your profile.', hi: 'साइट्स, सेटिंग्स, आपकी प्रोफ़ाइल।' } },
  ],
  labor_contractor: [
    { icon: 'users', title: { en: 'Attendance', hi: 'हाज़िरी' }, body: { en: 'Mark who came today — takes a minute.', hi: 'आज कौन आया, निशान लगाएँ — एक मिनट लगता है।' } },
    { icon: 'dollar-sign', title: { en: 'My payments', hi: 'मेरे भुगतान' }, body: { en: 'Wages and advances, clearly listed.', hi: 'मज़दूरी और एडवांस, साफ़ सूची में।' } },
    { icon: 'help-circle', title: { en: 'Help', hi: 'मदद' }, body: { en: 'How the app works, in simple words.', hi: 'ऐप कैसे चलता है, आसान शब्दों में।' } },
  ],
  architect: [
    { icon: 'home', title: { en: 'Home', hi: 'होम' }, body: { en: 'Your projects and what needs a decision.', hi: 'आपके प्रोजेक्ट और जिन पर फ़ैसला चाहिए।' } },
    { icon: 'book-open', title: { en: 'Brief', hi: 'ब्रीफ़' }, body: { en: "The homeowner's taste and needs, versioned.", hi: 'घर-मालिक की पसंद और ज़रूरतें, संस्करणों में।' } },
    { icon: 'layers', title: { en: 'Selections', hi: 'चयन' }, body: { en: 'Materials and finishes, room by room.', hi: 'सामग्री और फ़िनिश, कमरे-दर-कमरे।' } },
    { icon: 'message-circle', title: { en: 'Chat', hi: 'चैट' }, body: { en: 'Your project groups.', hi: 'आपके प्रोजेक्ट ग्रुप।' } },
    { icon: 'more-horizontal', title: { en: 'More', hi: 'और' }, body: { en: 'Changes, drawings, your profile.', hi: 'बदलाव, ड्रॉइंग, आपकी प्रोफ़ाइल।' } },
  ],
  procurement: [
    { icon: 'map-pin', title: { en: 'Your sites', hi: 'आपकी साइट्स' }, body: { en: 'Procurement runs on the Neev web dashboard for now.', hi: 'खरीद फ़िलहाल Neev वेब डैशबोर्ड पर चलती है।' } },
    { icon: 'message-circle', title: { en: 'Chat', hi: 'चैट' }, body: { en: 'Your site groups.', hi: 'आपके साइट ग्रुप।' } },
    { icon: 'more-horizontal', title: { en: 'More', hi: 'और' }, body: { en: 'Settings and your profile.', hi: 'सेटिंग्स और आपकी प्रोफ़ाइल।' } },
  ],
  homeowner: [
    { icon: 'home', title: { en: 'Home', hi: 'होम' }, body: { en: 'Where your home stands today, in one calm screen.', hi: 'आपका घर आज कहाँ है, एक शांत स्क्रीन में।' } },
    { icon: 'camera', title: { en: 'Photos', hi: 'तस्वीरें' }, body: { en: 'Real photos from site, as your builder shares them.', hi: 'साइट की असली तस्वीरें, जैसे बिल्डर साझा करे।' } },
    { icon: 'activity', title: { en: 'Updates', hi: 'अपडेट' }, body: { en: 'Milestones and a weekly summary — no jargon.', hi: 'पड़ाव और साप्ताहिक सार — बिना जटिल शब्दों के।' } },
    { icon: 'message-circle', title: { en: 'Messages', hi: 'संदेश' }, body: { en: 'One group with your builder and family.', hi: 'बिल्डर और परिवार के साथ एक ग्रुप।' } },
    { icon: 'feather', title: { en: 'Design', hi: 'डिज़ाइन' }, body: { en: 'Your taste, your brief, the choices still open.', hi: 'आपकी पसंद, आपका ब्रीफ़, खुले विकल्प।' } },
    { icon: 'help-circle', title: { en: 'Ask', hi: 'पूछें' }, body: { en: 'Ask anything about your home — answered from the record.', hi: 'घर के बारे में कुछ भी पूछें — रिकॉर्ड से जवाब।' } },
  ],
}

/** The tab tour for a role, in the order the tab bar shows them. */
export function roleTour(role: TourRole, lang: Lang): TourRow[] {
  return ROLE_TOUR[role].map((row) => ({
    icon: row.icon,
    title: row.title[lang],
    body: row.body[lang],
  }))
}
