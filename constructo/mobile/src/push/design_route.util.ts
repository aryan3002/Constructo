/**
 * Pure routing decision for a "design" push payload (see backend
 * `app.push.sender` design-event callers: `data: { type: 'design', kind,
 * profile_id, site_id, url, audience? }`). Extracted out of the
 * notification-response listener in app/_layout.tsx so it's testable without
 * mounting Expo Router (tests can't live under app/ — see
 * expo-router-no-tests-in-app).
 *
 * Returns the route to push, or null when the payload isn't a design push
 * (caller falls through to its other `type` branches).
 */
export function designPushRoute(data: { type?: string; url?: unknown; audience?: string } | undefined): string | null {
  if (data?.type !== 'design') return null

  if (data.audience === 'designer') {
    return '/(contractor)/architect/brief'
  }

  const url = typeof data.url === 'string' ? data.url : '/design'
  return `/(homeowner)${url.startsWith('/') ? url : `/${url}`}`
}
