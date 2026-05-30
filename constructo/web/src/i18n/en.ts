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

  // === approvals/notifications ===
  'approvals.title': 'Approval Inbox',
  'approvals.subtitle': 'The few decisions that need you — not a log.',
  'approvals.empty.title': 'All clear',
  'approvals.empty.hint': 'Nothing needs your decision right now.',
  'approvals.tab.open': 'Open',
  'approvals.tab.escalated': 'Escalated',
  'approvals.tab.resolved': 'Resolved',
  'approvals.action.reject': 'Reject',
  'approvals.batch.selected': '{count} selected',
  'approvals.batch.approve_all': 'Approve selected',
  'approvals.batch.reject_all': 'Reject selected',
  'approvals.batch.clear': 'Clear selection',
  'approvals.evidence.link': 'View evidence ({count})',
  'approvals.sla.overdue': 'SLA overdue',
  'approvals.sla.due': 'Due {when}',
  'approvals.assigned_to': 'Assigned to owner',
  'approvals.kind.approval': 'Approval',
  'approvals.kind.homeowner_question': 'Homeowner question',
  'approvals.kind.hold_payment': 'Payment hold',
  'approvals.kind.generic': 'Decision',
  'approvals.state.pending': 'Pending',
  'approvals.state.acknowledged': 'Acknowledged',
  'approvals.state.resolved': 'Resolved',
  'approvals.state.rejected': 'Rejected',
  'approvals.state.escalated': 'Escalated',
  'approvals.toast.done': 'Decision recorded',
  'notifications.title': 'Notifications',
  'notifications.empty': 'You’re all caught up.',
  'notifications.mark_read': 'Mark read',
  'notifications.unread': '{count} unread',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
