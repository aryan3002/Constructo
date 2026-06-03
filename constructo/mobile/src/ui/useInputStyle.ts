/**
 * useInputStyle — shared TextInput style hook.
 *
 * Fixes a React Native / iOS bug where custom fonts (Anek, Hind) bleed
 * letter-spacing into TextInput placeholder rendering, causing placeholders
 * to display as "a b c 1 2 3 ..." instead of "abc123…".
 *
 * Always import this instead of hand-rolling `inputStyle` in each screen.
 */
import type { TextStyle } from 'react-native'

import { useTheme } from '../theme/ThemeProvider'
import { SPACE, TAP } from '../theme/tokens'

export function useInputStyle(): TextStyle {
  const { theme } = useTheme()
  return {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radii.control,
    paddingHorizontal: SPACE.lg,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 16,
    // Explicitly reset letter-spacing so custom-font tracking doesn't leak
    // into placeholder text on iOS (RN bug with Anek/Hind fonts).
    letterSpacing: 0,
  }
}
