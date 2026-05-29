import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import './theme.css'

export type Theme = 'site' | 'daylight'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  children: ReactNode
  /** Initial theme. Defaults to the contractor "site" surface. */
  defaultTheme?: Theme
  /**
   * When false (the default) the provider wraps children in its own themed
   * element. When true it renders only context (no wrapper) — useful if a
   * parent already owns the `data-theme` element, e.g. the gallery rendering
   * both themes at once.
   */
  asContextOnly?: boolean
  className?: string
}

/**
 * Provides the active Constructo theme and applies the `data-theme` attribute
 * + `.cstk-root` base styles to a wrapping element so descendant components and
 * Tailwind token utilities resolve to the right palette.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'site',
  asContextOnly = false,
  className,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'site' ? 'daylight' : 'site')),
    }),
    [theme],
  )

  if (asContextOnly) {
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  }

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-theme={theme}
        className={`cstk-root min-h-screen ${className ?? ''}`}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

/**
 * A standalone themed surface — applies a fixed `data-theme` without owning the
 * theme state. Used by the gallery to show both themes simultaneously.
 */
export function ThemeSurface({
  theme,
  children,
  className,
}: {
  theme: Theme
  children: ReactNode
  className?: string
}) {
  return (
    <div data-theme={theme} className={`cstk-root ${className ?? ''}`}>
      {children}
    </div>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>')
  }
  return ctx
}
