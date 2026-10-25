/**
 * Pure routing decision for a chat push (`{ conversation_id }` — see backend
 * `_push_offline_members`): each role opens the thread in ITS OWN navigator.
 * Every non-homeowner used to land in the owner's screens, where Approve is
 * always shown (review S9). Lives under src/ so it's testable without mounting
 * Expo Router.
 *
 * Returns null when the role has no chat thread screen (accountant, mukadam,
 * procurement) — the tap then just opens the app.
 */
import type { Role } from '../api/types'

export type ChatPushRoute =
  | { pathname: string; params?: Record<string, string> }
  | null

export function chatPushRoute(role: Role | null | undefined, convId: string): ChatPushRoute {
  switch (role) {
    case 'homeowner':
      return { pathname: '/(homeowner)/messages/[id]', params: { id: convId, kind: 'homeowner' } }
    case 'owner':
      // Contractor threads address by conversation id; an undefined `kind`
      // falls back to addressing by conv id in the screen.
      return { pathname: '/(contractor)/owner/chat/[id]', params: { id: convId } }
    case 'pm':
      return { pathname: '/(contractor)/pm/chat/[id]', params: { id: convId } }
    case 'architect':
      return { pathname: '/(contractor)/architect/chat/[id]', params: { id: convId } }
    case 'supervisor':
      // The engineer's crew chat is site-addressed (no per-conversation route).
      return { pathname: '/(contractor)/supervisor/chat' }
    default:
      return null
  }
}
