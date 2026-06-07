import type { AddableUser, Group, GroupMember } from './groups'

describe('Groups shapes', () => {
  it('accepts a group with members', () => {
    const member: GroupMember = {
      user_id: 'u1', name: 'Ravi', role: 'admin', is_homeowner: false,
    }
    const group: Group = {
      id: 'g1', name: 'Tower B crew', site_id: 's1', archived: false, members: [member],
    }
    expect(group.members[0].role).toBe('admin')
    expect(group.archived).toBe(false)
  })

  it('accepts a homeowner member and a null-named group', () => {
    const member: GroupMember = {
      user_id: 'u2', name: null, role: 'member', is_homeowner: true,
    }
    const group: Group = {
      id: 'g2', name: null, site_id: null, archived: true, members: [member],
    }
    expect(group.members[0].is_homeowner).toBe(true)
    expect(group.name).toBeNull()
  })

  it('accepts an addable-user row', () => {
    const u: AddableUser = {
      user_id: 'u3', name: 'Sita', role: 'supervisor', already_member: false,
    }
    expect(u.already_member).toBe(false)
  })
})
