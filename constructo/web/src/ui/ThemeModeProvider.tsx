import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

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

interface ThemeModeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
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

function apply(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveMode(mode))

  // Apply the resolved theme to <html> whenever the chosen mode changes.
  useEffect(() => {
    const r = resolveMode(mode)
    setResolved(r)
    apply(r)
  }, [mode])

  // While in 'system', follow live OS-preference changes.
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(r)
      apply(r)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* localStorage unavailable — runtime-only change */
    }
  }, [])

  return (
    <ThemeModeContext.Provider value={{ mode, resolved, setMode }}>
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
