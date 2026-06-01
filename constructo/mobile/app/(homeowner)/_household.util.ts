/**
 * Local helpers for the Household screen (app/(homeowner)/household.tsx).
 * Owned by the household flow only — not a shared module.
 */
import type { HomeownerSubRole } from '../../src/api/types'

export type Lang = 'en' | 'hi'

/** Sub-roles a primary/co-owner can assign when inviting household members.
 *  `primary_owner` is excluded — never minted here (already exists). */
export type InvitableSubRole = 'co_owner' | 'family' | 'advisor'

export const INVITABLE_ROLES: InvitableSubRole[] = ['co_owner', 'family', 'advisor']

export const ROLE_LABEL: Record<InvitableSubRole, Record<Lang, string>> = {
  co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
  family: { en: 'Family', hi: 'परिवार' },
  advisor: { en: 'Advisor', hi: 'सलाहकार' },
}

export const ROLE_DESC: Record<InvitableSubRole, Record<Lang, string>> = {
  co_owner: {
    en: 'Can approve costs — same authority as you',
    hi: 'खर्च मंज़ूर कर सकते हैं — आपके जैसी अधिकारिता',
  },
  family: {
    en: 'Can view, comment, and flag concerns',
    hi: 'देख सकते हैं, टिप्पणी कर सकते हैं, और चिंता जता सकते हैं',
  },
  advisor: {
    en: 'Can view and advise on design choices',
    hi: 'डिज़ाइन विकल्पों पर देख और सलाह दे सकते हैं',
  },
}

/** The maximum number of household members (Primary + invited), per backend constant. */
export const MAX_HOUSEHOLD = 6

export interface MemberDraft {
  name: string
  phone: string
  sub_role: InvitableSubRole
}

export function emptyDraft(): MemberDraft {
  return { name: '', phone: '+91', sub_role: 'family' }
}

/** Validate a draft before sending. Returns an error message or null. */
export function validateDraft(draft: MemberDraft, lang: Lang): string | null {
  if (draft.name.trim().length === 0) {
    return lang === 'hi' ? 'नाम आवश्यक है' : 'Name is required'
  }
  const digits = draft.phone.replace(/\D/g, '')
  if (digits.length < 10) {
    return lang === 'hi' ? 'वैध फ़ोन नंबर डालें' : 'Enter a valid phone number'
  }
  return null
}

/** Human-readable label for a HomeownerSubRole (all four, for the roster). */
export function subRoleLabel(role: HomeownerSubRole, lang: Lang): string {
  const map: Record<HomeownerSubRole, Record<Lang, string>> = {
    primary_owner: { en: 'Primary Owner', hi: 'मुख्य मालिक' },
    co_owner: { en: 'Co-owner', hi: 'सह-मालिक' },
    family: { en: 'Family', hi: 'परिवार' },
    advisor: { en: 'Advisor', hi: 'सलाहकार' },
  }
  return map[role]?.[lang] ?? role
}

/** Status label for invited vs active members. */
export function statusLabel(status: 'invited' | 'active', lang: Lang): string {
  if (status === 'active') return lang === 'hi' ? 'सक्रिय' : 'Active'
  return lang === 'hi' ? 'आमंत्रित, अभी शामिल नहीं' : 'Invited, not yet joined'
}
