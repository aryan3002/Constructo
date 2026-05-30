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

  // === auth/settings ===
  // Login (phone + OTP, no passwords)
  'auth.tagline': 'Your site command center',
  'auth.phone.label': 'Phone number',
  'auth.phone.placeholder': '+91 98765 43210',
  'auth.otp.label': 'One-time code',
  'auth.otp.hint': 'Demo code: {code}',
  'auth.action.send_code': 'Send code',
  'auth.action.sending': 'Sending…',
  'auth.action.sign_in': 'Sign in',
  'auth.action.signing_in': 'Signing in…',
  'auth.action.resend': 'Resend code',
  'auth.action.change_phone': 'Change number',
  'auth.code_sent': 'We sent a code to {phone}',
  'auth.error.generic': 'Sign in failed. Please try again.',
  'auth.error.phone_required': 'Enter your phone number',

  // Owner first-run
  'auth.onboard.welcome': 'Welcome to Constructo',
  'auth.onboard.company.title': 'Name your company',
  'auth.onboard.company.subtitle': 'You can change this later.',
  'auth.onboard.company.label': 'Company name',
  'auth.onboard.company.placeholder': 'e.g. Sharma Constructions',
  'auth.onboard.site.title': 'Add your first site',
  'auth.onboard.site.subtitle': 'Just a name and type — we learn the rest.',
  'auth.onboard.site.name_label': 'Site name',
  'auth.onboard.site.name_placeholder': 'e.g. Green Acres Tower B',
  'auth.onboard.site.type_label': 'Site type',
  'auth.onboard.site.type.residential': 'Residential',
  'auth.onboard.site.type.commercial': 'Commercial',
  'auth.onboard.site.type.villa': 'Villa / Bungalow',
  'auth.onboard.site.type.interior': 'Interior fit-out',
  'auth.onboard.site.type.infra': 'Infrastructure',
  'auth.onboard.whatsapp.title': "Connect your site's WhatsApp group",
  'auth.onboard.whatsapp.subtitle':
    "Constructo reads your team's existing chat — no new habits. Connect it now or skip for now.",
  'auth.onboard.whatsapp.connect': 'Connect WhatsApp group',
  'auth.onboard.skip': 'Skip for now',
  'auth.onboard.continue': 'Continue',
  'auth.onboard.finish': 'Go to dashboard',
  'auth.onboard.step': 'Step {current} of {total}',

  // Invite team
  'invite.title': 'Invite your team',
  'invite.subtitle': 'Add a teammate by phone and pick their role.',
  'invite.phone.label': "Teammate's phone",
  'invite.name.label': 'Name (optional)',
  'invite.role.label': 'Role',
  'invite.role.pm': 'Project Manager',
  'invite.role.supervisor': 'Supervisor',
  'invite.role.accountant': 'Accountant',
  'invite.role.procurement': 'Procurement',
  'invite.role.labor_contractor': 'Mukadam (labour contractor)',
  'invite.role.owner': 'Owner',
  'invite.free_seat': 'Free seat',
  'invite.action.create': 'Create invite link',
  'invite.action.creating': 'Creating…',
  'invite.link.title': 'Invite link ready',
  'invite.link.share_whatsapp': 'Share on WhatsApp',
  'invite.link.copy': 'Copy link',
  'invite.link.copied': 'Copied',
  'invite.link.another': 'Invite someone else',
  'invite.message': 'Join {company} on Constructo as {role}: {link}',
  'invite.pending.title': 'Pending invites',
  'invite.status.pending': 'Pending',
  'invite.status.accepted': 'Joined',
  'invite.status.revoked': 'Revoked',
  'invite.empty': 'No invites yet.',

  // Join (invitee accepts an invite)
  'join.title': 'You have been invited',
  'join.subtitle': 'Join {company} as {role}.',
  'join.signed_out':
    'Sign in with your phone to accept this invite.',
  'join.action.accept': 'Accept & join',
  'join.action.accepting': 'Joining…',
  'join.welcome': 'Welcome to the team!',
  'join.coachmark.supervisor':
    'Tap the big camera or mic to log work — no forms.',
  'join.coachmark.labor_contractor':
    'Mark your crew present in one tap each morning.',
  'join.coachmark.accountant':
    'Match payments to challans here. Anything off shows up first.',
  'join.coachmark.procurement':
    'Track material orders and deliveries in one place.',
  'join.coachmark.pm':
    'Your sites, exceptions-first. The ≤3 things needing you are up top.',
  'join.coachmark.default': "Here's your home. The important things come first.",
  'join.coachmark.got_it': 'Got it',
  'join.error.invalid': 'This invite link is no longer valid.',

  // Settings / profile
  'settings.title': 'Settings',
  'settings.profile.title': 'Profile',
  'settings.profile.name': 'Your name',
  'settings.profile.phone': 'Phone',
  'settings.profile.role': 'Role',
  'settings.profile.saved': 'Saved',
  'settings.language.title': 'Language',
  'settings.language.subtitle': 'Choose the language for your app.',
  'settings.display.title': 'Display',
  'settings.display.contrast': 'Sunlight (high-contrast) mode',
  'settings.display.contrast.hint':
    'Boosts contrast for bright outdoor screens.',
  'settings.notifications.title': 'Notifications',
  'settings.notifications.daily_brief': 'Daily brief',
  'settings.notifications.risk_alerts': 'Risk alerts',
  'settings.notifications.mentions': 'Mentions & approvals',
  'settings.notifications.hint': 'Coming soon — preferences are saved locally.',
  'settings.team.title': 'Team',
  'settings.team.invite': 'Invite a teammate',
  'settings.signout': 'Sign out',
} as const

// The set of valid translation keys. hi.ts must provide all of these.
export type TranslationKey = keyof typeof en
