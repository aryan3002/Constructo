// Minimal, dependency-free i18n for Constructo.
//
// Usage (see README.md):
//   const t = useT()
//   <Button>{t('action.approve')}</Button>
//   const { lang, setLanguage } = useLanguage()
//   setLanguage('hi')   // persists to localStorage + best-effort to the user record
//
// Feature agents: add keys to en.ts (then hi.ts) — never hardcode user-facing
// strings. Unknown/untranslated keys fall back to English, then to the key.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { API_BASE } from '../api/config'
import { getToken } from '../api/auth'
import { en, type TranslationKey } from './en'
import { hi } from './hi'

export type Language = 'en' | 'hi'

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'hi']
const STORAGE_KEY = 'cstk.lang'

const RESOURCES: Record<Language, Partial<Record<TranslationKey, string>>> = {
  en,
  hi,
}

/** Simple {placeholder} interpolation. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  )
}

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string

function makeT(lang: Language): TFunction {
  return (key, vars) => {
    const value = RESOURCES[lang][key] ?? en[key] ?? key
    return interpolate(value, vars)
  }
}

function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'hi') return stored
  const nav = window.navigator?.language?.toLowerCase() ?? ''
  return nav.startsWith('hi') ? 'hi' : 'en'
}

/** Fire-and-forget: persist the choice to the user record IF the endpoint exists.
 *  No-op-safe today (PATCH /api/v1/users/me is owned by a feature agent). */
async function persistRemote(lang: Language): Promise<void> {
  const token = getToken()
  if (!token) return
  try {
    await fetch(`${API_BASE}/api/v1/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language: lang }),
    })
  } catch {
    /* endpoint not present yet / offline — local choice still applies */
  }
}

interface LanguageContextValue {
  lang: Language
  setLanguage: (lang: Language) => void
  t: TFunction
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  children,
  defaultLanguage,
}: {
  children: ReactNode
  defaultLanguage?: Language
}) {
  const [lang, setLang] = useState<Language>(defaultLanguage ?? detectInitialLanguage())

  // Keep <html lang> in sync for accessibility + correct font shaping.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const setLanguage = useCallback((next: Language) => {
    setLang(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
    void persistRemote(next)
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLanguage, t: makeT(lang) }),
    [lang, setLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useT/useLanguage must be used within a <LanguageProvider>')
  return ctx
}

/** Translation function hook: `const t = useT()`. */
export function useT(): TFunction {
  return useLanguageContext().t
}

/** Current language + setter: `const { lang, setLanguage } = useLanguage()`. */
export function useLanguage(): { lang: Language; setLanguage: (lang: Language) => void } {
  const { lang, setLanguage } = useLanguageContext()
  return { lang, setLanguage }
}

export type { TranslationKey }
