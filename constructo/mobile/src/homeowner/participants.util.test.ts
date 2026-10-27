// Messages participants come from the household roster (T5). Under src/ only.
import type { HomeownerMember } from '../api/types'
import { otherParticipants, participantsLabel } from '../screens/homeowner/participants.util'

const member = (over: Partial<HomeownerMember>): HomeownerMember => ({
  id: over.id ?? 'm',
  site_id: 's',
  user_id: 'u',
  display_name: null,
  sub_role: 'family',
  notif_prefs: {},
  phone: null,
  join_code: 'X',
  status: 'active',
  created_at: '2026-10-01T00:00:00Z',
  invite_link: '',
  ...over,
})

const me = member({ id: 'm-me', user_id: 'me', display_name: 'Anita', sub_role: 'primary_owner' })

describe('participantsLabel', () => {
  it('has no "Co-owner" when the household has no co-owner', () => {
    expect(participantsLabel([me], 'me', 'en')).toBe('Site team · You')
  })

  it('excludes invited members who have not joined', () => {
    const invited = member({ id: 'i', user_id: null, status: 'invited', display_name: 'Ravi' })
    expect(participantsLabel([me, invited], 'me', 'en')).toBe('Site team · You')
  })

  it('excludes you, matched by user id', () => {
    const other = member({ id: 'o', user_id: 'u2', display_name: 'Ravi', sub_role: 'co_owner' })
    expect(participantsLabel([me, other], 'me', 'en')).toBe('Site team · You · Ravi')
  })

  it('falls back to the sub-role label when there is no name', () => {
    const co = member({ id: 'c', user_id: 'u2', sub_role: 'co_owner' })
    const adv = member({ id: 'a', user_id: 'u3', sub_role: 'advisor', display_name: '  ' })
    expect(participantsLabel([me, co, adv], 'me', 'en')).toBe('Site team · You · Co-owner · Advisor')
    expect(participantsLabel([me, co], 'me', 'hi')).toBe('साइट टीम · आप · सह-मालिक')
  })

  it('names at most two others, then +N', () => {
    const roster = [
      me,
      member({ id: '1', user_id: 'u1', display_name: 'Ravi' }),
      member({ id: '2', user_id: 'u2', display_name: 'Meera' }),
      member({ id: '3', user_id: 'u3', display_name: 'Kabir' }),
      member({ id: '4', user_id: 'u4', display_name: 'Isha' }),
    ]
    expect(participantsLabel(roster, 'me', 'en')).toBe('Site team · You · Ravi · Meera · +2')
    expect(otherParticipants(roster, 'me', 'en')).toHaveLength(4)
  })

  it('says "Site team · You" while loading or on error', () => {
    expect(participantsLabel(undefined, 'me', 'en')).toBe('Site team · You')
    expect(participantsLabel(null, null, 'hi')).toBe('साइट टीम · आप')
    // Before "me" is known, nobody else is named (you'd be counted as another).
    expect(participantsLabel([me], null, 'en')).toBe('Site team · You')
  })
})
