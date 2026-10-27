import { useMe } from '../auth/useCan'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  pm: 'PM',
  architect: 'Architect',
  supervisor: 'Supervisor',
  accountant: 'Accountant',
  procurement: 'Procurement',
  labor_contractor: 'Mukadam',
  contractor: 'Mukadam',
}

/** Up to two initials from a person's name ("Asha Rao" → "AR"), or null.
 *  Only words that start with a letter count, so "Rajesh Gupta (Owner)" is "RG". */
export function personInitials(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  if (words.length === 0) return null
  const first = [...words[0]]
  const letters = words.length === 1 ? first.slice(0, 2) : [first[0], [...words[words.length - 1]][0]]
  return letters.join('').toUpperCase()
}

/**
 * The avatar badge for the signed-in person: their name and real initials,
 * falling back to the role ("PM") until a name is set.
 */
export function useRoleBadge(): { name: string; initials: string } | undefined {
  const { data: me } = useMe()
  if (!me) return undefined
  const roleLabel = ROLE_LABELS[me.role] ?? me.role
  const name = me.name?.trim() || roleLabel
  return { name, initials: personInitials(me.name) ?? roleLabel.slice(0, 2).toUpperCase() }
}
