// English resource bundle — the SOURCE OF TRUTH for translation keys.
//
// KEY CONVENTION (read web/src/i18n/README.md before adding strings):
//   <feature>.<element>           e.g. 'payments.title', 'permits.status.applied'
//   'common.*'  shared words (loading, error…)
//   'action.*'  buttons/verbs (approve, save…)
//   'nav.*'     bottom-tab / nav labels
// Add every new user-facing string here FIRST, then mirror it in hi.ts.
export const en = {
  'app.name': 'Constructo',

  // Navigation (bottom tabs / shell)
  'nav.brief': 'Brief',
  'nav.sites': 'Sites',
  'nav.approvals': 'Approvals',
  'nav.search': 'Search',
  'nav.more': 'More',

  // Common actions
  'action.approve': 'Approve',
  'action.hold': 'Hold',
  'action.assign': 'Assign',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.retry': 'Retry',

  // Common words
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
  'common.all_sites': 'All Sites ({count})',

  // Language switcher
  'language.label': 'Language',
  'language.en': 'English',
  'language.hi': 'हिन्दी',

  // === search ===
  'search.title': 'Search the ledger',
  'search.subtitle': 'Ask in plain words — every answer shows its proof.',
  'search.input.label': 'Search site events',
  'search.input.placeholder': 'e.g. cement deliveries Site A this week',
  'search.submit': 'Search',
  'search.searching': 'Searching…',
  'search.understood': 'Understood as',
  'search.filter.type': 'Type',
  'search.filter.from': 'From {date}',
  'search.filter.to': 'To {date}',
  'search.filter.site': 'Site: {name}',
  'search.results.count': '{count} results',
  'search.results.one': '1 result',
  'search.score': 'Match {pct}%',
  'search.viewEvidence': 'View evidence',
  'search.evidenceTitle': 'Source messages',
  'search.evidence.message': 'WhatsApp message',
  'search.evidence.none': 'No source messages on this event',
  'search.needsClarification': 'Needs clarification',
  'search.empty.title': 'Search your site ledger',
  'search.empty.hint': 'Try “cement deliveries this week” or “which sites had issues”.',
  'search.notSure.title': 'Not sure about that one',
  'search.notSure.hint': "I couldn't find a confident match in your sites. Try rewording, or widen the dates.",
  'search.error': 'Search failed. Please try again.',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
