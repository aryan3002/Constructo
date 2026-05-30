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

  // === brief/owner ===
  'owner.home.title': 'मालिक ब्रीफ़',
  'owner.home.needs_you_one': 'आज {sites} साइटों में {count} काम आपके ध्यान का इंतज़ार',
  'owner.home.needs_you_many': 'आज {sites} साइटों में {count} काम आपके ध्यान का इंतज़ार',
  'owner.home.all_calm': 'सभी साइट शांत',
  'owner.home.all_calm_hint': 'आज कोई दिक्कत नहीं। सब कुछ सही चल रहा है।',
  'owner.home.loading': 'आज का ब्रीफ़ लोड हो रहा है…',
  'owner.home.error': 'आपका ब्रीफ़ लोड नहीं हो सका।',
  'owner.home.no_open_risks': 'कोई खुला जोखिम नहीं। साइट सही रास्ते पर है।',
  'owner.home.more_at_site': 'इस साइट पर {count} और',
  'owner.home.show_proof': 'सबूत देखें',
  'owner.home.rollup_title': 'साइट एक नज़र में',
  'owner.home.pulse_title': 'आज की नब्ज़',
  'owner.home.expected_headcount': 'साइट पर {count} अपेक्षित',
  'owner.home.action_done': '{site} के लिए {action} दर्ज किया गया',
  'owner.home.action_failed': 'यह कार्रवाई दर्ज नहीं हो सकी।',

  'owner.pulse.cash': 'नकद',
  'owner.pulse.labor': 'मज़दूर',
  'owner.pulse.material': 'सामान',
  'owner.pulse.progress': 'प्रगति',
  'owner.pulse.tap_evidence': 'सबूत के लिए टैप करें',
  'owner.pulse.no_evidence': 'अभी कोई सबूत नहीं',

  'owner.setup.title': 'सेटअप पूरा करें',
  'owner.setup.hint': 'कुछ कदम और आपका रोज़ का ब्रीफ़ चालू हो जाएगा।',
  'owner.setup.add_site': 'अपनी पहली साइट जोड़ें',
  'owner.setup.connect_whatsapp': 'एक WhatsApp साइट ग्रुप जोड़ें',
  'owner.setup.set_baseline': 'अपेक्षित दैनिक हाज़िरी तय करें',
  'owner.setup.done': 'हो गया',
  'owner.setup.todo': 'बाकी',

  'brief.risk.labor_shortfall': 'मज़दूरों की कमी',
  'brief.risk.unverified_invoice': 'असत्यापित बिल',
  'brief.risk.pending_approval': 'मंज़ूरी बाकी',
  'brief.risk.data_quality': 'स्पष्टीकरण ज़रूरी',
  'brief.evidence.linked': 'जुड़ा हुआ सबूत',
}
