// Who is in the homeowner's builder channel (T5). The server's members are the
// site crew plus every ACTIVE household member with a user
// (backend app/chat/members.py), so the label is built from the household
// roster — never a fixed "Site team · You · Co-owner".
import type { HomeownerMember, HomeownerSubRole } from '../../api/types'

type Lang = 'en' | 'hi'

const SUB_ROLE_LABEL: Record<HomeownerSubRole, Record<Lang, string>> = {
  primary_owner: { en: 'Owner', hi: 'मालिक' },
  co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
  family: { en: 'Family', hi: 'परिवार' },
  advisor: { en: 'Advisor', hi: 'सलाहकार' },
}

const BASE: Record<Lang, [string, string]> = {
  en: ['Site team', 'You'],
  hi: ['साइट टीम', 'आप'],
}

/** At most this many other members are named; the rest become "+N". */
export const MAX_NAMED = 2

export interface Participant {
  id: string
  name: string
}

/** The other active, joined household members (not you, not invited-only),
 *  named by display name or, failing that, their sub-role. */
export function otherParticipants(
  roster: HomeownerMember[] | null | undefined,
  meId: string | null | undefined,
  lang: Lang,
): Participant[] {
  // Until we know who "you" are, name nobody (you'd be listed as someone else).
  if (!meId) return []
  return (roster ?? [])
    .filter((m) => m.status === 'active' && m.user_id != null && m.user_id !== meId)
    .map((m) => ({
      id: m.id,
      name: m.display_name?.trim() || SUB_ROLE_LABEL[m.sub_role]?.[lang] || SUB_ROLE_LABEL.family[lang],
    }))
}

/** "Site team · You · Priya · Rahul · +1". While the roster is loading or
 *  failed, "Site team · You" — true either way. */
export function participantsLabel(
  roster: HomeownerMember[] | null | undefined,
  meId: string | null | undefined,
  lang: Lang,
): string {
  const others = otherParticipants(roster, meId, lang)
  const parts = [...BASE[lang], ...others.slice(0, MAX_NAMED).map((p) => p.name)]
  if (others.length > MAX_NAMED) parts.push(`+${others.length - MAX_NAMED}`)
  return parts.join(' · ')
}
