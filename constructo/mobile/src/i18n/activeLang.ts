/**
 * The app language, readable outside React (toasts raised by the mutation
 * error fallback or a background send). {@link I18nProvider} keeps it current.
 */
import type { Language } from '../api/types'

let active: Language = 'en'

export function getActiveLang(): Language {
  return active
}

export function setActiveLang(lang: Language): void {
  active = lang
}
