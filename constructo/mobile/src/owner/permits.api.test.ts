/**
 * Tests for Slice E — Permits screen.
 *
 * Covers:
 *   === API client (permitsApi) ===
 *   1.  listPermits()             → GET /api/v1/permits  (no filter)
 *   2.  listPermits(siteId)       → GET /api/v1/permits?site_id=...
 *   3.  listPermits(siteId, stat) → GET /api/v1/permits?site_id=...&status=...
 *   4.  createPermit()            → POST /api/v1/permits with correct body
 *   5.  updatePermit()            → PATCH /api/v1/permits/{id} with patch
 *
 *   === permitPillConfig (pure) ===
 *   6.  approved → ok "Approved"
 *   7.  under_review → info "Under review"
 *   8.  applied → info "Applied"
 *   9.  not_started → quiet "Not started"
 *  10.  rejected → risk "Rejected"
 *  11.  expired → risk "Expired"
 *  12.  approved + expiringSoon=true → warn "Expiring soon"
 *  13.  not_started + expiringSoon=true → quiet "Not started" (expiring-soon only applies to approved)
 *
 *   === isExpiringSoon (pure) ===
 *  14.  approved + expiry_on 29 days away → true
 *  15.  approved + expiry_on exactly 30 days away → true  (≤ 30 days)
 *  16.  approved + expiry_on 31 days away → false
 *  17.  approved + expiry_on null → false
 *  18.  approved + expiry_on already past → true  (negative = also within "30 days" = overdue)
 *  19.  under_review + expiry_on 5 days away → false  (rule: only approved)
 *
 *   === permitUrgency (pure) ===
 *  20.  rejected → tier 0
 *  21.  expired → tier 0
 *  22.  approved + expiring soon → tier 1
 *  23.  under_review → tier 2
 *  24.  applied → tier 2
 *  25.  not_started → tier 3
 *  26.  approved (safe) → tier 4
 *
 *   === sortPermits (pure) ===
 *  27.  sorted list: rejected first, then expiring-soon, then under_review, then approved-safe
 *  28.  same tier → sorted by permit_type alphabetically
 *
 *   === permitKeyDate (pure) ===
 *  29.  approved permit → expiry_on preferred
 *  30.  under_review → expected_on preferred
 *  31.  not_started, no dates → null
 */

// ---------------------------------------------------------------------------
// Mock native modules before any imports that touch them.
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../store/secure', () => ({
  getToken: jest.fn().mockResolvedValue('test-token'),
}))

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const mockFetch = jest.fn()
;(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch

function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

afterEach(() => jest.clearAllMocks())

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { permitsApi } from '../api/permits'
import type { Permit } from '../api/permits'
import {
  permitPillConfig,
  isExpiringSoon,
  permitUrgency,
  sortPermits,
  permitKeyDate,
} from './permits.util'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'permit-1',
    company_id: 'co-1',
    site_id: 'site-1',
    permit_type: 'Building plan approval',
    authority: 'Municipal Corporation',
    status: 'not_started',
    applied_on: null,
    expected_on: null,
    decided_on: null,
    expiry_on: null,
    reference_no: null,
    notes: null,
    created_by: 'user-1',
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

/** Returns an ISO date string N days from the given base date. */
function daysFromNow(n: number, base: Date = new Date('2026-06-12')): string {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const TODAY = new Date('2026-06-12')

// ---------------------------------------------------------------------------
// 1–5 — API client
// ---------------------------------------------------------------------------

describe('permitsApi.listPermits', () => {
  const fakePage = { items: [], next_cursor: null }

  it('1. GETs /api/v1/permits with no query params', async () => {
    mockOk(fakePage)
    await permitsApi.listPermits()
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toMatch(/\/api\/v1\/permits$/)
  })

  it('2. GETs /api/v1/permits?site_id=... when siteId is passed', async () => {
    mockOk(fakePage)
    await permitsApi.listPermits('site-abc')
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('site_id=site-abc')
  })

  it('3. GETs with both site_id and status', async () => {
    mockOk(fakePage)
    await permitsApi.listPermits('site-xyz', 'approved')
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('site_id=site-xyz')
    expect(url).toContain('status=approved')
  })
})

describe('permitsApi.createPermit', () => {
  it('4. POSTs /api/v1/permits with correct body', async () => {
    const created = makePermit({ id: 'new-1', permit_type: 'Fire NOC', authority: 'Fire Dept', status: 'not_started' })
    mockOk(created)

    const result = await permitsApi.createPermit({
      site_id: 'site-1',
      permit_type: 'Fire NOC',
      authority: 'Fire Dept',
      status: 'not_started',
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/permits')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.site_id).toBe('site-1')
    expect(body.permit_type).toBe('Fire NOC')
    expect(body.authority).toBe('Fire Dept')
    expect(result.id).toBe('new-1')
  })
})

describe('permitsApi.updatePermit', () => {
  it('5. PATCHes /api/v1/permits/{id} with the patch body', async () => {
    const updated = makePermit({ id: 'permit-5', status: 'approved' })
    mockOk(updated)

    const result = await permitsApi.updatePermit('permit-5', { status: 'approved' })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/permits/permit-5')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body as string)
    expect(body.status).toBe('approved')
    expect(result.status).toBe('approved')
  })
})

// ---------------------------------------------------------------------------
// 6–13 — permitPillConfig
// ---------------------------------------------------------------------------

describe('permitPillConfig', () => {
  it('6. approved → ok "Approved"', () => {
    const c = permitPillConfig('approved', false)
    expect(c.status).toBe('ok')
    expect(c.label).toBe('Approved')
  })

  it('7. under_review → info "Under review"', () => {
    const c = permitPillConfig('under_review')
    expect(c.status).toBe('info')
    expect(c.label).toBe('Under review')
  })

  it('8. applied → info "Applied"', () => {
    const c = permitPillConfig('applied')
    expect(c.status).toBe('info')
    expect(c.label).toBe('Applied')
  })

  it('9. not_started → quiet "Not started"', () => {
    const c = permitPillConfig('not_started')
    expect(c.status).toBe('quiet')
    expect(c.label).toBe('Not started')
  })

  it('10. rejected → risk "Rejected"', () => {
    const c = permitPillConfig('rejected')
    expect(c.status).toBe('risk')
    expect(c.label).toBe('Rejected')
  })

  it('11. expired → risk "Expired"', () => {
    const c = permitPillConfig('expired')
    expect(c.status).toBe('risk')
    expect(c.label).toBe('Expired')
  })

  it('12. approved + expiringSoon=true → warn "Expiring soon"', () => {
    const c = permitPillConfig('approved', true)
    expect(c.status).toBe('warn')
    expect(c.label).toBe('Expiring soon')
  })

  it('13. not_started + expiringSoon=true → quiet (rule: only approved can expiring-soon)', () => {
    const c = permitPillConfig('not_started', true)
    expect(c.status).toBe('quiet')
    expect(c.label).toBe('Not started')
  })
})

// ---------------------------------------------------------------------------
// 14–19 — isExpiringSoon
// ---------------------------------------------------------------------------

describe('isExpiringSoon', () => {
  it('14. approved + expiry 29 days away → true', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(29, TODAY) })
    expect(isExpiringSoon(p, TODAY)).toBe(true)
  })

  it('15. approved + expiry exactly 30 days away → true (≤ 30)', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(30, TODAY) })
    expect(isExpiringSoon(p, TODAY)).toBe(true)
  })

  it('16. approved + expiry 31 days away → false', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(31, TODAY) })
    expect(isExpiringSoon(p, TODAY)).toBe(false)
  })

  it('17. approved + expiry_on null → false', () => {
    const p = makePermit({ status: 'approved', expiry_on: null })
    expect(isExpiringSoon(p, TODAY)).toBe(false)
  })

  it('18. approved + expiry already past → true (overdue = within 30d threshold)', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(-5, TODAY) })
    expect(isExpiringSoon(p, TODAY)).toBe(true)
  })

  it('19. under_review + expiry_on 5 days away → false (rule: only approved)', () => {
    const p = makePermit({ status: 'under_review', expiry_on: daysFromNow(5, TODAY) })
    expect(isExpiringSoon(p, TODAY)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 20–26 — permitUrgency
// ---------------------------------------------------------------------------

describe('permitUrgency', () => {
  it('20. rejected → tier 0', () => {
    expect(permitUrgency(makePermit({ status: 'rejected' }), TODAY)).toBe(0)
  })

  it('21. expired → tier 0', () => {
    expect(permitUrgency(makePermit({ status: 'expired' }), TODAY)).toBe(0)
  })

  it('22. approved + expiring soon → tier 1', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(10, TODAY) })
    expect(permitUrgency(p, TODAY)).toBe(1)
  })

  it('23. under_review → tier 2', () => {
    expect(permitUrgency(makePermit({ status: 'under_review' }), TODAY)).toBe(2)
  })

  it('24. applied → tier 2', () => {
    expect(permitUrgency(makePermit({ status: 'applied' }), TODAY)).toBe(2)
  })

  it('25. not_started → tier 3', () => {
    expect(permitUrgency(makePermit({ status: 'not_started' }), TODAY)).toBe(3)
  })

  it('26. approved (safe, expiry 90 days away) → tier 4', () => {
    const p = makePermit({ status: 'approved', expiry_on: daysFromNow(90, TODAY) })
    expect(permitUrgency(p, TODAY)).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 27–28 — sortPermits
// ---------------------------------------------------------------------------

describe('sortPermits', () => {
  it('27. sorts rejected first, then expiring-soon, then under_review, then approved-safe', () => {
    const permits = [
      makePermit({ id: 'p4', status: 'approved', expiry_on: daysFromNow(90, TODAY), permit_type: 'A' }),
      makePermit({ id: 'p3', status: 'under_review', permit_type: 'B' }),
      makePermit({ id: 'p2', status: 'approved', expiry_on: daysFromNow(5, TODAY), permit_type: 'C' }),
      makePermit({ id: 'p1', status: 'rejected', permit_type: 'D' }),
    ]
    const sorted = sortPermits(permits, TODAY)
    expect(sorted.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('28. same-tier permits are sorted by permit_type alphabetically', () => {
    const permits = [
      makePermit({ id: 'p2', status: 'not_started', permit_type: 'Zoning' }),
      makePermit({ id: 'p1', status: 'not_started', permit_type: 'Building' }),
    ]
    const sorted = sortPermits(permits, TODAY)
    expect(sorted[0].permit_type).toBe('Building')
    expect(sorted[1].permit_type).toBe('Zoning')
  })
})

// ---------------------------------------------------------------------------
// 29–31 — permitKeyDate
// ---------------------------------------------------------------------------

describe('permitKeyDate', () => {
  it('29. approved permit → returns expiry_on', () => {
    const p = makePermit({ status: 'approved', expiry_on: '2027-03-01', expected_on: '2026-07-01' })
    expect(permitKeyDate(p)).toBe('2027-03-01')
  })

  it('30. under_review → returns expected_on when present', () => {
    const p = makePermit({ status: 'under_review', expected_on: '2026-08-15', expiry_on: null })
    expect(permitKeyDate(p)).toBe('2026-08-15')
  })

  it('31. not_started with no dates → null', () => {
    const p = makePermit({ status: 'not_started' })
    expect(permitKeyDate(p)).toBeNull()
  })
})
