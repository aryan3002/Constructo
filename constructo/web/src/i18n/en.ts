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

  // === brief/owner ===
  'owner.home.title': 'Owner Brief',
  'owner.home.needs_you_one': '{count} thing needs you today across {sites} sites',
  'owner.home.needs_you_many': '{count} things need you today across {sites} sites',
  'owner.home.all_calm': 'All sites calm',
  'owner.home.all_calm_hint': 'No exceptions today. Everything is on track.',
  'owner.home.loading': 'Loading today’s brief…',
  'owner.home.error': 'Could not load your brief.',
  'owner.home.no_open_risks': 'No open risks. Site is on track.',
  'owner.home.more_at_site': '+{count} more at this site',
  'owner.home.show_proof': 'Show proof',
  'owner.home.rollup_title': 'Sites at a glance',
  'owner.home.pulse_title': 'Today’s pulse',
  'owner.home.expected_headcount': 'Expected {count} on site',
  'owner.home.action_done': '{action} recorded for {site}',
  'owner.home.action_failed': 'Could not record that action.',

  'owner.pulse.cash': 'Cash',
  'owner.pulse.labor': 'Labor',
  'owner.pulse.material': 'Material',
  'owner.pulse.progress': 'Progress',
  'owner.pulse.tap_evidence': 'Tap for evidence',
  'owner.pulse.no_evidence': 'No evidence yet',

  'owner.setup.title': 'Finish setting up',
  'owner.setup.hint': 'A few steps and your daily brief starts working.',
  'owner.setup.add_site': 'Add your first site',
  'owner.setup.connect_whatsapp': 'Connect a WhatsApp site group',
  'owner.setup.set_baseline': 'Set the expected daily headcount',
  'owner.setup.done': 'Done',
  'owner.setup.todo': 'To do',

  'brief.risk.labor_shortfall': 'Labor shortfall',
  'brief.risk.unverified_invoice': 'Unverified invoice',
  'brief.risk.pending_approval': 'Pending approval',
  'brief.risk.data_quality': 'Needs clarification',
  'brief.evidence.linked': 'Linked evidence',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
