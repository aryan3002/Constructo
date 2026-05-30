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

  // === capture/attendance ===
  'capture.title': 'Capture',
  'capture.subtitle': 'Send a photo or speak — typing is optional',
  'capture.recent': 'Recent captures',
  'capture.empty': 'No captures yet today',
  'capture.empty_hint': 'Tap the camera or hold to talk to log what’s happening on site.',
  'capture.find_proof': 'Find a drawing or past proof',
  'capture.find_proof_hint': 'Search photos, challans and messages already captured.',
  'capture.photo_hint': 'Photo capture opens the camera in the app.',
  'capture.voice_hint': 'Release to send your voice note.',
  'capture.type_title': 'Type a quick note',
  'capture.headcount_label': 'Workers present today',
  'capture.note_label': 'Note (optional)',
  'capture.note_placeholder': 'e.g. 24 mazdoor aaye, plastering started',
  'capture.submit': 'Log attendance',
  'capture.logged': 'Logged {count} workers',
  'capture.queue.title': 'Sync',
  'capture.queue.synced': 'All captures saved',
  'capture.queue.pending': '{count} waiting to sync',
  'capture.queue.error': '{count} failed — will retry',
  'capture.queue.offline': 'Offline — captures are saved and will sync',
  'capture.queue.retry': 'Retry now',
  'capture.queue.never_lose': 'Saved on your phone. Nothing is lost if you go offline.',
  'capture.select_site': 'Choose a site',
  'capture.no_sites': 'No sites assigned to you yet',

  'attendance.title': 'Today’s attendance',
  'attendance.subtitle': 'Snap the crew or count out loud — proof means faster payment',
  'attendance.proof_payment': 'Proof = faster payment',
  'attendance.proof_payment_hint':
    'A photo with today’s count gets your payment approved sooner.',
  'attendance.count_label': 'Headcount',
  'attendance.count_down': 'One fewer',
  'attendance.count_up': 'One more',
  'attendance.add_photo': 'Add a photo of the crew',
  'attendance.planned': 'Planned',
  'attendance.actual': 'Present',
  'attendance.variance': 'Difference',
  'attendance.on_track': 'On track for today',
  'attendance.short': 'Short by {count}',
  'attendance.over': '{count} more than planned',
  'attendance.no_baseline': 'No planned count set for this site',
  'attendance.submit': 'Send attendance',
  'attendance.sent': 'Attendance sent',
  'attendance.tab_capture': 'Attendance',
  'attendance.tab_payments': 'My payments',
  'attendance.payments_title': 'Payments recorded for you',
  'attendance.payments_empty': 'No payments recorded yet',
  'attendance.payments_empty_hint': 'Keep sending daily proof to get paid faster.',
  'attendance.payment_status.recorded': 'Recorded',
  'attendance.payment_status.confirmed': 'Confirmed',
  'attendance.payment_status.disputed': 'Disputed',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
