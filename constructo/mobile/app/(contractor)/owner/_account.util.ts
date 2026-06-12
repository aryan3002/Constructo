/**
 * Pure helpers for the Account hub (more.tsx).
 * Exported here so they can be unit-tested without rendering React components.
 */
import type { Language } from '../../../src/api/types'

// ---------------------------------------------------------------------------
// Role labels — en/hi — for every contractor role.
// ---------------------------------------------------------------------------
export const ROLE_LABEL: Record<string, { en: string; hi: string }> = {
  owner: { en: 'Owner', hi: 'मालिक' },
  pm: { en: 'Project Manager', hi: 'प्रोजेक्ट मैनेजर' },
  accountant: { en: 'Accountant', hi: 'लेखाकार' },
  procurement: { en: 'Procurement', hi: 'खरीद' },
  supervisor: { en: 'Supervisor', hi: 'सुपरवाइज़र' },
  architect: { en: 'Architect', hi: 'आर्किटेक्ट' },
  labor_contractor: { en: 'Mukadam', hi: 'मुक़द्दम' },
}

/**
 * Build the "role · company" subtitle shown under the user's name.
 *
 * Renders `company_name` — never `company_id` — to avoid leaking a raw UUID
 * in the UI. When `company_name` is absent (e.g. legacy token), the line is
 * just the role label.
 */
export function buildProfileSubtitle(opts: {
  role: string | undefined | null
  companyName: string | undefined | null
  lang: Language
}): string {
  const { role, companyName, lang } = opts
  const roleLabel = role ? (ROLE_LABEL[role]?.[lang] ?? role) : '—'
  return [roleLabel, companyName].filter(Boolean).join(' · ')
}

/** Route constants used by SettingsRow onPress targets. */
export const ROUTES = {
  team: '/(contractor)/owner/team',
  search: '/(contractor)/owner/search',
  foresight: '/(contractor)/owner/foresight',
  permits: '/(contractor)/owner/permits',
} as const
