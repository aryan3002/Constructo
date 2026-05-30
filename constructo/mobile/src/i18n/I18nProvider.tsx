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
  useState,
  type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { authApi } from '../api/auth'
import type { Language } from '../api/types'
import { en, type Dict } from './en'
import { hi } from './hi'

const BUNDLES: Record<Language, Dict> = { en, hi }
const STORAGE_KEY = 'constructo.lang'

type TParams = Record<string, string | number>

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
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

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'hi') setLangState(saved)
    })
  }, [])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
    // Fire-and-forget: sync the preference if signed in (ignore when guest).
    void authApi.updateLanguage(next).catch(() => undefined)
  }, [])

  const t = useCallback(
    (path: string, params?: TParams) => interpolate(lookup(BUNDLES[lang], path), params),
    [lang],
  )

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within an <I18nProvider>')
  return ctx
}
