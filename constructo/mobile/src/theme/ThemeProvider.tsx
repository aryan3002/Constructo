/**
 * Theme context for React Native. Exposes the active {@link Theme} (resolved
 * token set) and a setter. The app shell sets `blueprint` for contractor routes
 * and `daylight` for homeowner routes, so a screen never hardcodes colors — it
 * reads them from `useTheme().theme`.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { THEMES, type Theme, type ThemeName } from './tokens'

interface ThemeContextValue {
  theme: Theme
  name: ThemeName
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({
  children,
  initial = 'blueprint',
}: {
  children: ReactNode
  initial?: ThemeName
}) {
  const [name, setName] = useState<ThemeName>(initial)
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[name], name, setTheme: setName }),
    [name],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>')
  return ctx
}
