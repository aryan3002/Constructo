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

  // === approvals/notifications ===
  'approvals.title': 'मंज़ूरी इनबॉक्स',
  'approvals.subtitle': 'सिर्फ़ वे फ़ैसले जिनमें आपकी ज़रूरत है — कोई लंबी सूची नहीं।',
  'approvals.empty.title': 'सब ठीक है',
  'approvals.empty.hint': 'अभी किसी फ़ैसले की ज़रूरत नहीं है।',
  'approvals.tab.open': 'खुले',
  'approvals.tab.escalated': 'बढ़ाए गए',
  'approvals.tab.resolved': 'निपटाए गए',
  'approvals.action.reject': 'अस्वीकार करें',
  'approvals.batch.selected': '{count} चुने गए',
  'approvals.batch.approve_all': 'चुने हुए मंज़ूर करें',
  'approvals.batch.reject_all': 'चुने हुए अस्वीकार करें',
  'approvals.batch.clear': 'चयन हटाएँ',
  'approvals.evidence.link': 'प्रमाण देखें ({count})',
  'approvals.sla.overdue': 'समय-सीमा बीत गई',
  'approvals.sla.due': 'समय-सीमा {when}',
  'approvals.assigned_to': 'मालिक को सौंपा गया',
  'approvals.kind.approval': 'मंज़ूरी',
  'approvals.kind.homeowner_question': 'गृहस्वामी का सवाल',
  'approvals.kind.hold_payment': 'भुगतान रोक',
  'approvals.kind.generic': 'फ़ैसला',
  'approvals.state.pending': 'लंबित',
  'approvals.state.acknowledged': 'स्वीकृत',
  'approvals.state.resolved': 'निपटाया',
  'approvals.state.rejected': 'अस्वीकृत',
  'approvals.state.escalated': 'बढ़ाया गया',
  'approvals.toast.done': 'फ़ैसला दर्ज हुआ',
  'notifications.title': 'सूचनाएँ',
  'notifications.empty': 'सब पढ़ लिया गया।',
  'notifications.mark_read': 'पढ़ा हुआ चिह्नित करें',
  'notifications.unread': '{count} अपठित',
}
