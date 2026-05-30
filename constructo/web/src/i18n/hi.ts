// Hindi resource bundle. MUST provide every key in en.ts (enforced by the
// `Record<TranslationKey, string>` type below — a missing key fails tsc).
// Any key left untranslated falls back to English at runtime.
import type { TranslationKey } from './en'

export const hi: Record<TranslationKey, string> = {
  'app.name': 'कंस्ट्रक्टो',

  'nav.brief': 'ब्रीफ़',
  'nav.sites': 'साइट',
  'nav.approvals': 'मंज़ूरी',
  'nav.search': 'खोज',
  'nav.more': 'और',

  'action.approve': 'मंज़ूर करें',
  'action.hold': 'रोकें',
  'action.assign': 'सौंपें',
  'action.save': 'सहेजें',
  'action.cancel': 'रद्द करें',
  'action.retry': 'फिर कोशिश करें',

  'common.loading': 'लोड हो रहा है…',
  'common.error': 'कुछ गड़बड़ हो गई',
  'common.all_sites': 'सभी साइट ({count})',

  'language.label': 'भाषा',
  'language.en': 'English',
  'language.hi': 'हिन्दी',

  // === search ===
  'search.title': 'लेज़र में खोजें',
  'search.subtitle': 'सीधे शब्दों में पूछें — हर जवाब अपना सबूत दिखाता है।',
  'search.input.label': 'साइट इवेंट खोजें',
  'search.input.placeholder': 'जैसे: इस हफ़्ते Site A पर सीमेंट डिलीवरी',
  'search.submit': 'खोजें',
  'search.searching': 'खोज रहे हैं…',
  'search.understood': 'इस तरह समझा',
  'search.filter.type': 'प्रकार',
  'search.filter.from': '{date} से',
  'search.filter.to': '{date} तक',
  'search.filter.site': 'साइट: {name}',
  'search.results.count': '{count} नतीजे',
  'search.results.one': '1 नतीजा',
  'search.score': 'मेल {pct}%',
  'search.viewEvidence': 'सबूत देखें',
  'search.evidenceTitle': 'स्रोत संदेश',
  'search.evidence.message': 'व्हाट्सऐप संदेश',
  'search.evidence.none': 'इस इवेंट पर कोई स्रोत संदेश नहीं',
  'search.needsClarification': 'स्पष्टीकरण चाहिए',
  'search.empty.title': 'अपने साइट लेज़र में खोजें',
  'search.empty.hint': 'आज़माएँ “इस हफ़्ते सीमेंट डिलीवरी” या “किन साइटों पर दिक्कतें थीं”।',
  'search.notSure.title': 'इस बारे में पक्का नहीं',
  'search.notSure.hint': 'आपकी साइटों में कोई भरोसेमंद मेल नहीं मिला। शब्द बदलें या तारीख़ बढ़ाएँ।',
  'search.error': 'खोज विफल रही। कृपया दोबारा कोशिश करें।',
}
