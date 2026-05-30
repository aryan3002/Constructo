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

  // === reconcile ===
  'reconcile.title': 'Reconcile',
  'reconcile.subtitle': 'Deliveries vs supplier invoices',
  'reconcile.pick_site': 'Choose a site to reconcile',
  'reconcile.pick_site_hint': 'Pick a site to match deliveries against invoices.',
  'reconcile.loading': 'Reconciling deliveries and invoices…',
  'reconcile.error': 'Could not load reconciliation',
  'reconcile.empty_title': 'Nothing to reconcile yet',
  'reconcile.empty_hint': 'Deliveries and invoices will appear here once captured.',
  'reconcile.all_clear': 'All clear — every delivery is matched.',
  'reconcile.at_risk': 'At risk',
  'reconcile.amount_at_risk': 'Amount at risk',
  'reconcile.summary_at_risk': '{amount} at risk across {count} items',
  'reconcile.status.matched': 'Matched',
  'reconcile.status.mismatch': 'Mismatch',
  'reconcile.status.missing_proof': 'Missing proof',
  'reconcile.status.needs_approval': 'Needs approval',
  'reconcile.filter.all': 'All ({count})',
  'reconcile.filter.exceptions': 'Needs action ({count})',
  'reconcile.side.delivery': 'Delivery (site)',
  'reconcile.side.invoice': 'Invoice (supplier)',
  'reconcile.field.vendor': 'Vendor',
  'reconcile.field.item': 'Item',
  'reconcile.field.quantity': 'Quantity',
  'reconcile.field.amount': 'Amount',
  'reconcile.field.invoice_number': 'Invoice no.',
  'reconcile.field.date': 'Date',
  'reconcile.reason.quantity_variance': 'Quantity differs',
  'reconcile.reason.amount_variance': 'Amount differs',
  'reconcile.reason.item_mismatch': 'Item differs',
  'reconcile.reason.no_invoice': 'No invoice received',
  'reconcile.reason.no_delivery': 'No delivery logged',
  'reconcile.no_proof': 'No matching document',
  'reconcile.select_prompt': 'Select an item to see both sides of the proof.',
  'reconcile.detail_heading': 'Evidence',
  'reconcile.action.hold': 'Hold payment',
  'reconcile.action.holding': 'Holding…',
  'reconcile.action.view_grn': 'Draft GRN',
  'reconcile.hold.note_label': 'Reason (optional)',
  'reconcile.hold.note_placeholder': 'e.g. Billed 150 bags, only 100 received',
  'reconcile.hold.confirm': 'Hold & notify owner',
  'reconcile.hold.success': 'Payment held — sent to owner for approval.',
  'reconcile.hold.error': 'Could not hold payment',
  'reconcile.hold.routed': 'Routed to the owner as an approval.',
  'reconcile.grn.title': 'Draft Goods Received Note',
  'reconcile.grn.reference': 'Reference',
  'reconcile.grn.received_on': 'Received on',
  'reconcile.grn.loading': 'Drafting GRN…',
  'reconcile.grn.error': 'Could not draft GRN',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
