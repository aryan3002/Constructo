/**
 * Link-style text colour for the auth screens.
 *
 * Daylight: the deep sage (`accentDeep`) reads at ≥4.5:1 on sand.
 * Neev: marigold-as-TEXT fails contrast on warm paper (≈2.6:1 — the locked
 * "amber is for fills" rule), so links are ink (`text`), bold.
 */
import { useTheme } from '../../theme/ThemeProvider'

export function useAuthLinkColor(): string {
  const { theme } = useTheme()
  return theme.name === 'neev' ? theme.colors.text : theme.colors.accentDeep
}
