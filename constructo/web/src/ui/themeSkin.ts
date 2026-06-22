/**
 * Pure mapping between the active "skin" + resolved light/dark mode and the
 * `data-theme` value written to <html>. Kept pure + framework-free so it can be
 * unit-tested and reused by both the runtime provider and the no-FOUC script's
 * mirror logic. The server remains the authorization source of truth; the skin
 * only drives presentation.
 */
export type ThemeSkin = 'blueprint' | 'neev'
export type DataTheme = 'light' | 'dark' | 'neev' | 'neev-dark'

export function resolveDataTheme(skin: ThemeSkin, resolved: 'light' | 'dark'): DataTheme {
  if (skin === 'neev') return resolved === 'dark' ? 'neev-dark' : 'neev'
  return resolved
}

/** The Neev skin is owner-only and gated by the VITE_NEEV_OWNER flag. */
export function skinForRole(role: string | undefined, enabled: boolean): ThemeSkin {
  return enabled && role === 'owner' ? 'neev' : 'blueprint'
}
