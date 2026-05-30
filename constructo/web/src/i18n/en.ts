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

  // === payments/permits ===
  // Payments (money TRACKING — Constructo never moves money)
  'payments.title': 'Payments',
  'payments.subtitle': 'Recorded money in & out — proof on tap',
  'payments.ledger': 'Ledger',
  'payments.cash_pulse': 'Cash pulse',
  'payments.inflow': 'Money in',
  'payments.outflow': 'Money out',
  'payments.net': 'Net position',
  'payments.count': '{count} payments',
  'payments.empty': 'No payments recorded yet',
  'payments.empty_hint': 'Record money in or out to start the ledger.',
  'payments.record': 'Record payment',
  'payments.all_sites': 'All sites',
  'payments.no_proof': 'No reference attached',
  'payments.method': 'Method',
  'payments.reference': 'Reference',
  'payments.paid_on': 'Paid on',
  'payments.linked_event': 'Linked to site event',
  'payments.dir.in': 'From homeowner',
  'payments.dir.out': 'To supplier',
  'payments.status.recorded': 'Recorded',
  'payments.status.confirmed': 'Confirmed',
  'payments.status.disputed': 'Disputed',

  // Permits / government approvals
  'permits.title': 'Permits & approvals',
  'permits.subtitle': 'Are we legal to build? Track every approval',
  'permits.checklist': 'Site checklist',
  'permits.add': 'Add permit',
  'permits.empty': 'No permits tracked yet',
  'permits.empty_hint': 'Add the approvals this site needs to stay compliant.',
  'permits.authority': 'Authority',
  'permits.reference': 'Reference',
  'permits.applied_on': 'Applied',
  'permits.expected_on': 'Expected by',
  'permits.decided_on': 'Decided',
  'permits.expiry_on': 'Expires',
  'permits.expires_in': 'Expires in {days} days',
  'permits.expired_ago': 'Expired {days} days ago',
  'permits.no_dates': 'No key dates yet',
  'permits.status.not_started': 'Not started',
  'permits.status.applied': 'Applied',
  'permits.status.under_review': 'Under review',
  'permits.status.approved': 'Approved',
  'permits.status.rejected': 'Rejected',
  'permits.status.expired': 'Expired',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
