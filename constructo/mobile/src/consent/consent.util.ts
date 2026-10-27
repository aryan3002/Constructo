/**
 * The one-time AI consent gate (S7, Apple 5.1.2(i)). A signed-in person who
 * hasn't agreed sees the consent screen before anything else; agreeing is
 * recorded on the server (`users.ai_consent_at`), once per person.
 */
import type { Me, Role } from '../api/types'

export function needsAiConsent(status: 'loading' | 'authed' | 'guest', me: Me | null): boolean {
  return status === 'authed' && !!me && !me.ai_consent_at
}

/** The consent screen wears the person's own surface: Calm Cockpit
 *  (Daylight) for owner, engineer, architect and homeowner; Neev otherwise. */
export function consentTheme(role: Role | null | undefined): 'daylight' | 'neev' {
  return role === 'owner' || role === 'supervisor' || role === 'architect' || role === 'homeowner'
    ? 'daylight'
    : 'neev'
}
