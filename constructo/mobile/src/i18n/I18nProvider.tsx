/**
 * Tiny dependency-free i18n. `useT()` returns a `t('a.b.c', { count })` lookup
 * over the active language bundle (en/hi), with `{var}` interpolation. The
 * choice persists to AsyncStorage and (when signed in) syncs to the backend
 * language preference — mirroring the web i18n layer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { authApi } from '../api/auth'
import type { Language } from '../api/types'
import { getToken } from '../store/secure'
import { setActiveLang, setServerLangSync } from './activeLang'
import { isLanguage, resolveSignInLanguage } from './lang.util'
import { en, type Dict } from './en'
import { hi } from './hi'

const BUNDLES: Record<Language, Dict> = { en, hi }
const STORAGE_KEY = 'constructo.lang'
// Set while this phone's choice hasn't reached the server (picked signed out,
// or the save failed); the next sign-in sends it up.
const UNSYNCED_KEY = 'constructo.lang.unsynced'

type TParams = Record<string, string | number>

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  /** After sign-in: adopt the language saved on the server (`me.language`),
   *  or save this phone's unsent choice to it. */
  syncWithServer: (serverLang: Language | null | undefined) => Promise<void>
  t: (path: string, params?: TParams) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function lookup(bundle: Dict, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], bundle)
  return typeof value === 'string' ? value : path
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')
  setActiveLang(lang)

  // The stored choice is read once; sign-in sync waits for it so it compares
  // against what the person last picked, not the 'en' default.
  const loaded = useRef<Promise<Language> | null>(null)
  if (!loaded.current) {
    loaded.current = AsyncStorage.getItem(STORAGE_KEY)
      .then((saved): Language => (isLanguage(saved) ? saved : 'en'))
      .catch((): Language => 'en')
  }

  useEffect(() => {
    void loaded.current?.then((saved) => setLangState(saved))
  }, [])

  const saveToServer = useCallback(async (next: Language) => {
    try {
      await authApi.updateLanguage(next)
      await AsyncStorage.removeItem(UNSYNCED_KEY)
    } catch {
      await AsyncStorage.setItem(UNSYNCED_KEY, '1').catch(() => undefined)
    }
  }, [])

  const setLang = useCallback(
    (next: Language) => {
      setLangState(next)
      loaded.current = Promise.resolve(next)
      void AsyncStorage.setItem(STORAGE_KEY, next)
      // Signed in: save it to the profile now. Signed out: remember to save
      // it at the next sign-in.
      void getToken().then((token) =>
        token ? saveToServer(next) : AsyncStorage.setItem(UNSYNCED_KEY, '1'),
      )
    },
    [saveToServer],
  )

  const syncWithServer = useCallback(
    async (serverLang: Language | null | undefined) => {
      const local = (await loaded.current) ?? 'en'
      const unsynced = (await AsyncStorage.getItem(UNSYNCED_KEY).catch(() => null)) === '1'
      const { apply, push } = resolveSignInLanguage({ local, server: serverLang, unsynced })
      if (apply) {
        setLangState(apply)
        loaded.current = Promise.resolve(apply)
        await AsyncStorage.setItem(STORAGE_KEY, apply).catch(() => undefined)
      }
      if (push) await saveToServer(push)
      else if (unsynced) await AsyncStorage.removeItem(UNSYNCED_KEY).catch(() => undefined)
    },
    [saveToServer],
  )

  const t = useCallback(
    (path: string, params?: TParams) => interpolate(lookup(BUNDLES[lang], path), params),
    [lang],
  )

  useEffect(() => {
    setServerLangSync(syncWithServer)
    return () => setServerLangSync(null)
  }, [syncWithServer])

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, syncWithServer, t }),
    [lang, setLang, syncWithServer, t],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within an <I18nProvider>')
  return ctx
}
