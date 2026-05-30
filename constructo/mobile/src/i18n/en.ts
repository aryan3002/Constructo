/** English strings. `hi.ts` mirrors this shape (Devanagari-first parity). */
export const en = {
  common: {
    loading: 'Loading…',
    retry: 'Try again',
    somethingWrong: 'Something went wrong',
    offline: 'Offline',
    online: 'Online',
    syncing: 'Syncing…',
    synced: 'All changes saved',
    pendingChanges: '{count} change(s) waiting to sync',
  },
  auth: {
    welcome: 'Welcome to Constructo',
    phoneLabel: 'Phone number',
    phonePlaceholder: '+91 ',
    sendCode: 'Send code',
    otpLabel: 'Enter the 6-digit code',
    devOtpHint: 'Dev code: 000000',
    verify: 'Verify & continue',
    joinTitle: 'Join your home',
    joinSubtitle: 'Enter the code your builder shared with you.',
    joinCodeLabel: 'Join code',
    joinCta: 'Join',
    haveJoinCode: 'I have a join code',
    staffLogin: 'Builder / staff login',
    signOut: 'Sign out',
  },
  nav: {
    home: 'Home',
    photos: 'Photos',
    updates: 'Updates',
    design: 'Design',
    settings: 'Settings',
  },
  contractor: {
    comingSoonTitle: 'The builder app is on its way',
    comingSoonBody:
      'For now, manage your sites on the Constructo web dashboard. The full builder experience is coming to mobile soon.',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    english: 'English',
    hindi: 'हिन्दी',
  },
  gallery: {
    title: 'Component gallery',
    subtitle: 'The Constructo kit, in both themes.',
  },
}

export type Dict = typeof en
