/** Rules for the shared Account section (see AccountSection.tsx). */
import type { Language, Role } from '../api/types'

/** Where sign-out and account deletion land: a homeowner goes back to the
 *  front door, staff to the staff sign-in. */
export function accountExitHref(role: Role | null | undefined): string {
  return role === 'homeowner' ? '/' : '/(auth)/login'
}

/** The delete confirmation names who keeps the shared records. */
export function deleteConfirmMessageKey(role: Role | null | undefined): string {
  return role === 'homeowner' ? 'account.deleteAccountConfirmMsgHome' : 'account.deleteAccountConfirmMsg'
}

export function otherLanguage(lang: Language): Language {
  return lang === 'en' ? 'hi' : 'en'
}

/** The language row's subtitle: the current language in its own script. */
export function languageNameKey(lang: Language): string {
  return lang === 'hi' ? 'settings.hindi' : 'settings.english'
}
