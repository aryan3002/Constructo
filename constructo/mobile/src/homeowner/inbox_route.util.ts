/**
 * Pure routing decision for the notifications inbox (app/(homeowner)/inbox.tsx).
 * Extracted so the `design` bell-row case — which reads `data.url` off the
 * notification the way the push-response listener does for a live design push
 * (see src/push/design_route.util.ts) — is testable without mounting Expo
 * Router (tests can't live under app/ — see expo-router-no-tests-in-app).
 *
 * Returns the route to push, or null when the row has nowhere to go (caller
 * renders the row as non-interactive).
 */
import type { AppNotification } from '../api/types'

export function routeForNotification(n: AppNotification): string | null {
  switch (n.type) {
    case 'photo':
      return '/(homeowner)/photos'
    case 'request':
      return '/(homeowner)/requests'
    case 'update':
    case 'weekly_summary':
      return '/(homeowner)/updates'
    case 'design': {
      const url = typeof n.data?.url === 'string' ? n.data.url : '/design'
      return `/(homeowner)${url.startsWith('/') ? url : `/${url}`}`
    }
    default:
      return null
  }
}
