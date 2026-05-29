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
}
