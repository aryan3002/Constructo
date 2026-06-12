/**
 * Tests for Slice D — Team & roles screen.
 *
 * Covers:
 *   1. owner.invite()       → hits POST /api/v1/invites with correct body
 *   2. owner.inviteClient() → hits POST /api/v1/homeowner/members with
 *                             sub_role='primary_owner' + display_name
 *   3. owner.updateMember() → hits PATCH /api/v1/users/{id} with role patch
 *   4. owner.updateMember() → hits PATCH /api/v1/users/{id} with is_active patch
 *   5. buildJoinLink()      → builds the correct web join URL
 *   6. isSelf()             → correctly identifies the signed-in user's own row
 *   7. Self-row guard       → self-row actions are disabled in rendered output
 *      (pure logic: isSelf returns true only when ids match)
 *   8. Invite branch        → contractor role ≠ 'client' → invite() called (not inviteClient)
 *   9. Client branch        → role === 'client' → inviteClient() called (not invite)
 *  10. Role-change confirm  → updateMember called with role patch only
 *  11. Deactivate confirm   → updateMember called with is_active:false
 *  12. Reactivate confirm   → updateMember called with is_active:true
 *  13. Member.is_active     → Member type accepts is_active boolean
 */

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports that pull in
// AsyncStorage or native modules (RN jest doesn't auto-mock native modules).
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))

// AuthContext is only pulled in by the screen import; we only need the pure
// helpers (buildJoinLink, isSelf) from team.tsx — no React context needed.
jest.mock('../auth/AuthContext', () => ({
  useAuth: jest.fn(() => ({ me: null, signOut: jest.fn() })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// I18nProvider — used by the screen; mock so no React needed.
jest.mock('../i18n/I18nProvider', () => ({
  useT: jest.fn(() => ({ t: (k: string) => k, lang: 'en', setLang: jest.fn() })),
}))

// ThemeProvider — used by the screen.
jest.mock('../theme/ThemeProvider', () => ({
  useTheme: jest.fn(() => ({
    theme: {
      name: 'neev',
      colors: {
        bg: '#fff', card: '#fff', line: '#ccc', text: '#000', textMute: '#888',
        accent: '#f0a500', onAccent: '#000', risk: '#e5484d',
      },
      radii: { card: 8, chip: 6, control: 8 },
      shadowCard: {},
    },
  })),
}))

// expo-router Stack is used in the screen; mock it away.
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
}))

import { owner } from '../api/owner'
import type { Member } from '../api/owner'
import type { Role } from '../api/types'
import { buildJoinLink, isSelf } from '../../app/(contractor)/owner/team'
import { WEB_BASE } from '../api/config'

// ---------------------------------------------------------------------------
// Mock the request helper so no real HTTP calls are made.
// ---------------------------------------------------------------------------

jest.mock('../store/secure', () => ({
  getToken: jest.fn().mockResolvedValue('test-token'),
}))

const mockFetch = jest.fn()
;(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch

function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1 & 2. owner.invite / owner.inviteClient
// ---------------------------------------------------------------------------

describe('owner.invite', () => {
  it('POSTs to /api/v1/invites with phone, role, and name', async () => {
    const fakeInvite = {
      id: 'inv-1',
      company_id: 'co-1',
      phone: '+919876543210',
      role: 'supervisor',
      name: 'Ravi',
      status: 'pending',
      token: 'tok-abc',
      created_at: '2026-06-12T00:00:00Z',
    }
    mockOk(fakeInvite)

    const result = await owner.invite({ phone: '+919876543210', role: 'supervisor', name: 'Ravi' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/invites')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ phone: '+919876543210', role: 'supervisor', name: 'Ravi' })
    expect(result.token).toBe('tok-abc')
  })

  it('POSTs without name when omitted', async () => {
    mockOk({ id: 'inv-2', token: 'tok-def', status: 'pending', phone: '+91', role: 'pm', company_id: 'c', name: null, created_at: '' })
    await owner.invite({ phone: '+91', role: 'pm' })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.name).toBeUndefined()
  })
})

describe('owner.inviteClient', () => {
  it('POSTs to /api/v1/homeowner/members with sub_role=primary_owner and display_name', async () => {
    const fakeResult = {
      id: 'mem-1',
      site_id: 'site-1',
      phone: '+919000000001',
      display_name: 'Priya Sharma',
      join_code: 'JOIN123',
      invite_link: 'constructo://join?code=JOIN123',
      status: 'invited',
    }
    mockOk(fakeResult)

    const result = await owner.inviteClient({
      site_id: 'site-1',
      phone: '+919000000001',
      name: 'Priya Sharma',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/homeowner/members')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.sub_role).toBe('primary_owner')
    expect(body.display_name).toBe('Priya Sharma')
    expect(body.site_id).toBe('site-1')
    expect(body.phone).toBe('+919000000001')
    expect(result.join_code).toBe('JOIN123')
  })

  it('sends display_name (not name) and omits empty phone', async () => {
    mockOk({ id: 'm2', site_id: 's', phone: null, display_name: 'Anita', join_code: 'X', invite_link: '', status: 'invited' })
    await owner.inviteClient({ site_id: 'site-2', name: 'Anita' })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.display_name).toBe('Anita')
    expect(body.phone).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3 & 4. owner.updateMember
// ---------------------------------------------------------------------------

describe('owner.updateMember', () => {
  it('PATCHes /api/v1/users/{id} with role', async () => {
    const fakeMember: Member = {
      id: 'user-1',
      company_id: 'co-1',
      name: 'Vikas',
      phone: null,
      role: 'accountant',
      is_active: true,
    }
    mockOk(fakeMember)

    const result = await owner.updateMember('user-1', { role: 'accountant' })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/users/user-1')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ role: 'accountant' })
    expect(result.role).toBe('accountant')
  })

  it('PATCHes /api/v1/users/{id} with is_active:false to deactivate', async () => {
    const fakeMember: Member = {
      id: 'user-2',
      company_id: 'co-1',
      name: 'Suresh',
      phone: null,
      role: 'supervisor',
      is_active: false,
    }
    mockOk(fakeMember)

    await owner.updateMember('user-2', { is_active: false })

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ is_active: false })
  })

  it('PATCHes /api/v1/users/{id} with is_active:true to reactivate', async () => {
    const fakeMember: Member = {
      id: 'user-3',
      company_id: 'co-1',
      name: 'Deepa',
      phone: null,
      role: 'pm',
      is_active: true,
    }
    mockOk(fakeMember)

    await owner.updateMember('user-3', { is_active: true })

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ is_active: true })
  })
})

// ---------------------------------------------------------------------------
// 5. buildJoinLink
// ---------------------------------------------------------------------------

describe('buildJoinLink', () => {
  it('builds the correct join URL from the token', () => {
    const link = buildJoinLink('my-token-123')
    expect(link).toBe(`${WEB_BASE}/join/my-token-123`)
  })

  it('does not double-slash in the path (WEB_BASE has no trailing slash)', () => {
    const link = buildJoinLink('abc')
    // WEB_BASE strips trailing slashes, so the join path must not have //join
    expect(link).not.toContain('//join')
    // path ends with /join/abc
    expect(link).toMatch(/\/join\/abc$/)
  })
})

// ---------------------------------------------------------------------------
// 6. isSelf
// ---------------------------------------------------------------------------

describe('isSelf', () => {
  const member: Member = {
    id: 'user-99',
    company_id: 'co-1',
    name: 'Owner',
    phone: null,
    role: 'owner',
    is_active: true,
  }

  it('returns true when member.id matches meId', () => {
    expect(isSelf(member, 'user-99')).toBe(true)
  })

  it('returns false when member.id does not match meId', () => {
    expect(isSelf(member, 'user-01')).toBe(false)
  })

  it('returns false when meId is undefined', () => {
    expect(isSelf(member, undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. Self-row guard — logic-level: self-row tap is effectively disabled
// ---------------------------------------------------------------------------

describe('self-row guard (logic)', () => {
  it('isSelf returns true for own row, preventing onPress from firing', () => {
    const me = { id: 'owner-id' }
    const ownRow: Member = { id: 'owner-id', company_id: 'c', name: 'Me', phone: null, role: 'owner', is_active: true }
    const otherRow: Member = { id: 'other-id', company_id: 'c', name: 'Other', phone: null, role: 'pm', is_active: true }

    // Own row is self — Pressable disabled={self} so onPress is never called.
    expect(isSelf(ownRow, me.id)).toBe(true)
    expect(isSelf(otherRow, me.id)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 8 & 9. Invite branch logic
// ---------------------------------------------------------------------------

type InviteRoleTest = Role | 'client'

/** Simulates InviteSheet's branching: contractor role → invite(), client → inviteClient(). */
async function simulateInviteBranch(role: InviteRoleTest) {
  if (role === 'client') {
    return owner.inviteClient({ site_id: 'site-1' })
  }
  return owner.invite({ phone: '+91', role })
}

describe('invite branch selection', () => {
  it('contractor role calls owner.invite (not inviteClient)', async () => {
    mockOk({ id: 'i1', token: 'tok', status: 'pending', phone: '+91', role: 'supervisor', company_id: 'c', name: null, created_at: '' })
    await simulateInviteBranch('supervisor')
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/invites')
    expect(url).not.toContain('/homeowner/members')
  })

  it('client role calls owner.inviteClient (not invite)', async () => {
    mockOk({ id: 'm1', site_id: 's', phone: null, display_name: null, join_code: 'CODE', invite_link: '', status: 'invited' })
    await simulateInviteBranch('client')
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/homeowner/members')
    expect(url).not.toContain('/api/v1/invites')
  })
})

// ---------------------------------------------------------------------------
// 10. Role-change path
// ---------------------------------------------------------------------------

describe('role-change patch', () => {
  it('sends only the role field, not is_active', async () => {
    mockOk({ id: 'u', company_id: 'c', name: 'N', phone: null, role: 'accountant', is_active: true })
    await owner.updateMember('u', { role: 'accountant' })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(Object.keys(body)).toEqual(['role'])
  })
})

// ---------------------------------------------------------------------------
// 11 & 12. Deactivate / reactivate path
// ---------------------------------------------------------------------------

describe('deactivate/reactivate patches', () => {
  it('deactivate sends only is_active:false', async () => {
    mockOk({ id: 'u', company_id: 'c', name: 'N', phone: null, role: 'pm', is_active: false })
    await owner.updateMember('u', { is_active: false })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.is_active).toBe(false)
    expect(body.role).toBeUndefined()
  })

  it('reactivate sends only is_active:true', async () => {
    mockOk({ id: 'u', company_id: 'c', name: 'N', phone: null, role: 'pm', is_active: true })
    await owner.updateMember('u', { is_active: true })
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.is_active).toBe(true)
    expect(body.role).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 13. Member type carries is_active
// ---------------------------------------------------------------------------

describe('Member type', () => {
  it('accepts is_active:true', () => {
    const m: Member = {
      id: 'x',
      company_id: 'c',
      name: 'Alice',
      phone: null,
      role: 'pm',
      is_active: true,
    }
    expect(m.is_active).toBe(true)
  })

  it('accepts is_active:false (deactivated member)', () => {
    const m: Member = {
      id: 'y',
      company_id: 'c',
      name: 'Bob',
      phone: null,
      role: 'supervisor',
      is_active: false,
    }
    expect(m.is_active).toBe(false)
  })
})
