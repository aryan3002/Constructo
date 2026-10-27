/**
 * Which language wins after sign-in. The server keeps each person's choice
 * (`me.language`), so a reinstall or a new phone opens in their language. A
 * choice made on this phone that the server hasn't heard yet — picked while
 * signed out, or while the save failed — is sent up instead of overwritten.
 */
import type { Language } from '../api/types'

export interface LangSync {
  /** Switch the app to this language (no server write). */
  apply: Language | null
  /** Save this language to the server. */
  push: Language | null
}

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'hi'
}

export function resolveSignInLanguage(opts: {
  local: Language
  server: Language | null | undefined
  /** The local choice hasn't reached the server yet. */
  unsynced: boolean
}): LangSync {
  const { local, server, unsynced } = opts
  if (unsynced) return { apply: null, push: server === local ? null : local }
  if (isLanguage(server) && server !== local) return { apply: server, push: null }
  return { apply: null, push: null }
}
