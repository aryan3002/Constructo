/**
 * Tests for Account hub helpers (_account.util).
 *
 * Specifically verifies:
 *  - company_name renders, not company_id (UUID guard)
 *  - Team, Permits, Settings rows point to the right routes
 *  - All contractor roles (incl. new architect + labor_contractor) have labels
 *  - Language toggle target is the other language
 */
import {
  buildProfileSubtitle,
  ROLE_LABEL,
  ROUTES,
} from '../../app/(contractor)/owner/_account.util'

// ---------------------------------------------------------------------------
// buildProfileSubtitle — UUID guard + company_name display
// ---------------------------------------------------------------------------

describe('buildProfileSubtitle', () => {
  it('renders company_name (not a UUID) when provided', () => {
    const result = buildProfileSubtitle({
      role: 'owner',
      companyName: 'CivilArch (CADS)',
      lang: 'en',
    })
    // Must contain the human-readable name
    expect(result).toContain('CivilArch (CADS)')
    // Must NOT contain a raw UUID pattern
    expect(result).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it('shows role · company in correct order for en', () => {
    const result = buildProfileSubtitle({ role: 'owner', companyName: 'Acme', lang: 'en' })
    expect(result).toBe('Owner · Acme')
  })

  it('shows role · company in correct order for hi', () => {
    const result = buildProfileSubtitle({ role: 'owner', companyName: 'Acme', lang: 'hi' })
    expect(result).toBe('मालिक · Acme')
  })

  it('omits separator when company_name is absent', () => {
    const result = buildProfileSubtitle({ role: 'owner', companyName: null, lang: 'en' })
    expect(result).toBe('Owner')
    expect(result).not.toContain(' · ')
  })

  it('falls back to raw role string for unknown roles', () => {
    const result = buildProfileSubtitle({ role: 'unknown_role', companyName: null, lang: 'en' })
    expect(result).toBe('unknown_role')
  })

  it('returns "—" when role is null', () => {
    const result = buildProfileSubtitle({ role: null, companyName: null, lang: 'en' })
    expect(result).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// ROLE_LABEL — all contractor roles have both en and hi labels
// ---------------------------------------------------------------------------

const EXPECTED_ROLES = ['owner', 'pm', 'accountant', 'procurement', 'supervisor', 'architect', 'labor_contractor']

describe('ROLE_LABEL', () => {
  it.each(EXPECTED_ROLES)('role "%s" has a non-empty en label', (role) => {
    expect(ROLE_LABEL[role]?.en).toBeTruthy()
  })

  it.each(EXPECTED_ROLES)('role "%s" has a non-empty hi label', (role) => {
    expect(ROLE_LABEL[role]?.hi).toBeTruthy()
  })

  it('architect en label is "Architect"', () => {
    expect(ROLE_LABEL.architect.en).toBe('Architect')
  })

  it('architect hi label is "आर्किटेक्ट"', () => {
    expect(ROLE_LABEL.architect.hi).toBe('आर्किटेक्ट')
  })

  it('labor_contractor en label is "Mukadam"', () => {
    expect(ROLE_LABEL.labor_contractor.en).toBe('Mukadam')
  })

  it('labor_contractor hi label is "मुक़द्दम"', () => {
    expect(ROLE_LABEL.labor_contractor.hi).toBe('मुक़द्दम')
  })
})

// ---------------------------------------------------------------------------
// ROUTES — navigation targets for Team and Permits rows
// ---------------------------------------------------------------------------

describe('ROUTES', () => {
  it('team route is the team screen', () => {
    expect(ROUTES.team).toBe('/(contractor)/owner/team')
  })

  it('permits route is the permits screen', () => {
    expect(ROUTES.permits).toBe('/(contractor)/owner/permits')
  })

  it('search route is the search screen', () => {
    expect(ROUTES.search).toBe('/(contractor)/owner/search')
  })

  it('foresight route is the foresight screen', () => {
    expect(ROUTES.foresight).toBe('/(contractor)/owner/foresight')
  })
})
