import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { resolveDataTheme, type ThemeSkin } from './themeSkin'

/**
 * Root theme-MODE controller for the contractor web console.
 *
 * Mode (light | dark | system) is the user's choice; `resolved` (light | dark)
 * is what's actually applied. The active mode is written to `<html data-theme>`
 * — CSS custom properties in theme.css switch the whole app instantly, and any
 * nested legacy `data-theme="site"` wrapper inherits it (mode-transparent).
 *
 * The no-FOUC inline script in index.html applies the same logic BEFORE first
 * paint; this provider takes over for runtime changes + OS-preference tracking.
 * Storage key `cstk.theme` is shared with that script.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'cstk.theme'
const SKIN_KEY = 'cstk.skin'

interface ThemeModeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  skin: ThemeSkin
  setMode: (mode: ThemeMode) => void
  setSkin: (skin: ThemeSkin) => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'system'
}

function readStoredSkin(): ThemeSkin {
  try {
    const v = localStorage.getItem(SKIN_KEY)
    if (v === 'neev' || v === 'blueprint') return v
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'blueprint'
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

function apply(skin: ThemeSkin, resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolveDataTheme(skin, resolved))
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored())
  const [skin, setSkinState] = useState<ThemeSkin>(() => readStoredSkin())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveMode(mode))

  // Apply the resolved theme to <html> whenever mode OR skin changes.
  useEffect(() => {
    const r = resolveMode(mode)
    setResolved(r)
    apply(skin, r)
  }, [mode, skin])

  // While in 'system', follow live OS-preference changes (re-using the skin).
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(r)
      apply(skin, r)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode, skin])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* localStorage unavailable — runtime-only change */
    }
  }, [])

  const setSkin = useCallback((next: ThemeSkin) => {
    setSkinState(next)
    try {
      localStorage.setItem(SKIN_KEY, next)
    } catch {
      /* localStorage unavailable — runtime-only change */
    }
  }, [])

  return (
    <ThemeModeContext.Provider value={{ mode, resolved, skin, setMode, setSkin }}>
      {children}
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) {
    throw new Error('useThemeMode must be used within a <ThemeModeProvider>')
  }
  return ctx
}

/**
 * Safe skin reader. Unlike `useThemeMode`, this does NOT throw outside a
 * provider — it returns `'blueprint'`. Shared chrome (AppShell) is rendered
 * bare in many unit tests; this lets it read the skin without forcing every
 * such test to wrap in a `<ThemeModeProvider>`.
 */
export function useSkin(): ThemeSkin {
  return useContext(ThemeModeContext)?.skin ?? 'blueprint'
}
