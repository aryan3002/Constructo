import {createContext, useContext, type ReactNode} from 'react';

import {day, type Theme} from './tokens';

const ThemeContext = createContext<Theme>(day);

/** Gives every UI component below it the Day or Night palette. */
export function ThemeProvider({theme, children}: {theme: Theme; children: ReactNode}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
