/**
 * Resolves the build's runtime config and says what a release build is
 * missing. Pure (no `process.env`, no `__DEV__`) so it can be tested; see
 * config.ts for the inlined env reads.
 *
 * Development keeps its fallbacks (the Android-emulator loopback, clearly fake
 * policy pages). A release build never falls back: an OTA publish or a store
 * build made without the build env would otherwise talk to a developer
 * address on every install, so the app refuses to start and names what isn't
 * configured (see ConfigMissingScreen).
 */

export interface RawConfig {
  apiBase?: string
  webBase?: string
  privacyUrl?: string
  termsUrl?: string
}

export interface ResolvedConfig {
  apiBase: string
  webBase: string
  privacyUrl: string
  termsUrl: string
  /** Env var names a release build needs but doesn't have. Empty in dev. */
  missing: string[]
}

export const DEV_API_BASE = 'http://10.0.2.2:8000'
// `.invalid` can never resolve (RFC 2606): obviously not a real policy page.
export const DEV_PRIVACY_URL = 'https://privacy-policy.example.invalid/'
export const DEV_TERMS_URL = 'https://terms.example.invalid/'

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/\/$/, '')
}

export function resolveConfig(raw: RawConfig, isDev: boolean): ResolvedConfig {
  const apiBase = clean(raw.apiBase)
  const privacyUrl = (raw.privacyUrl ?? '').trim()
  const termsUrl = (raw.termsUrl ?? '').trim()
  const missing: string[] = []
  if (!isDev) {
    if (!apiBase) missing.push('EXPO_PUBLIC_API_BASE')
    if (!privacyUrl) missing.push('EXPO_PUBLIC_PRIVACY_URL')
    if (!termsUrl) missing.push('EXPO_PUBLIC_TERMS_URL')
  }
  const api = apiBase || (isDev ? DEV_API_BASE : '')
  return {
    apiBase: api,
    webBase: clean(raw.webBase) || api,
    privacyUrl: privacyUrl || (isDev ? DEV_PRIVACY_URL : ''),
    termsUrl: termsUrl || (isDev ? DEV_TERMS_URL : ''),
    missing,
  }
}
