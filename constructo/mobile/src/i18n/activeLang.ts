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

type ServerLangSync = (serverLang: Language | null | undefined) => Promise<void>
let serverSync: ServerLangSync | null = null

/** I18nProvider registers how a signed-in profile's language is applied. */
export function setServerLangSync(fn: ServerLangSync | null): void {
  serverSync = fn
}

/** After sign-in: adopt `me.language` (see lang.util.ts). No-op without an
 *  I18nProvider. */
export function syncLanguageWithServer(serverLang: Language | null | undefined): Promise<void> {
  return serverSync ? serverSync(serverLang) : Promise.resolve()
}
