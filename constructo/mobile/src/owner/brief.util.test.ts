/**
 * Tests for Brief screen pure helpers (Slice B):
 *   - buildRanked    — flattens + sorts risks by severity
 *   - scopeRanked    — client-side SiteSwitcher filter
 *   - scopeSites     — mirrors scopeRanked for the roll-up strip
 *   - siteWorstStatus — worst status across a site's risks
 *
 * Files under app/ are evaluated as Expo Router routes, so tests live here in
 * src/ and import the util directly.
 */
import {
  buildRanked,
  scopeRanked,
  scopeSites,
  siteWorstStatus,
} from '../../app/(contractor)/owner/_brief.util'
import type { BriefSite, Risk } from '../api/owner'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRisk = (
  site_id: string,
  severity: Risk['severity'],
  message = 'test risk',
): Risk => ({
  site_id,
  kind: 'generic',
  severity,
  message,
  evidence_event_ids: [],
})

const makeSite = (id: string, risks: Risk[]): BriefSite => ({
  site_id: id,
  name: `Site ${id}`,
  top_risks: risks,
  counts: { attendance: 5, deliveries: 2, issues: 1 },
})

const SITE_A = makeSite('site-a', [makeRisk('site-a', 'low'), makeRisk('site-a', 'high')])
const SITE_B = makeSite('site-b', [makeRisk('site-b', 'med'), makeRisk('site-b', 'med')])
const SITE_C = makeSite('site-c', []) // calm site

// ---------------------------------------------------------------------------
// buildRanked
// ---------------------------------------------------------------------------

describe('buildRanked', () => {
  it('flattens risks from all sites', () => {
    const ranked = buildRanked([SITE_A, SITE_B])
    expect(ranked).toHaveLength(4)
  })

  it('sorts high severity first', () => {
    const ranked = buildRanked([SITE_A, SITE_B])
    expect(ranked[0].risk.severity).toBe('high')
    expect(ranked[1].risk.severity).toBe('med')
    expect(ranked[2].risk.severity).toBe('med')
    expect(ranked[3].risk.severity).toBe('low')
  })

  it('keys each risk as "siteId:index"', () => {
    const ranked = buildRanked([SITE_A])
    expect(ranked.some((r) => r.key.startsWith('site-a:'))).toBe(true)
  })

  it('returns empty array for a site with no risks', () => {
    expect(buildRanked([SITE_C])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// scopeRanked — the SiteSwitcher filter
// ---------------------------------------------------------------------------

describe('scopeRanked', () => {
  const ranked = buildRanked([SITE_A, SITE_B])

  it('returns all risks when selectedSiteId is null (All sites)', () => {
    expect(scopeRanked(ranked, null)).toHaveLength(4)
  })

  it('narrows to only the selected site risks', () => {
    const scoped = scopeRanked(ranked, 'site-a')
    expect(scoped).toHaveLength(2)
    expect(scoped.every((r) => r.site.site_id === 'site-a')).toBe(true)
  })

  it('returns empty array when selectedSiteId matches no site', () => {
    expect(scopeRanked(ranked, 'site-z')).toHaveLength(0)
  })

  it('site-b scope contains only site-b risks', () => {
    const scoped = scopeRanked(ranked, 'site-b')
    expect(scoped).toHaveLength(2)
    expect(scoped.every((r) => r.site.site_id === 'site-b')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// scopeSites
// ---------------------------------------------------------------------------

describe('scopeSites', () => {
  const sites = [SITE_A, SITE_B, SITE_C]

  it('returns all sites when null', () => {
    expect(scopeSites(sites, null)).toHaveLength(3)
  })

  it('returns only the matching site', () => {
    expect(scopeSites(sites, 'site-b')).toHaveLength(1)
    expect(scopeSites(sites, 'site-b')[0].site_id).toBe('site-b')
  })
})

// ---------------------------------------------------------------------------
// siteWorstStatus
// ---------------------------------------------------------------------------

describe('siteWorstStatus', () => {
  it('returns "ok" for a site with no risks', () => {
    expect(siteWorstStatus(SITE_C)).toBe('ok')
  })

  it('returns "risk" when any risk is high severity', () => {
    // SITE_A has low + high
    expect(siteWorstStatus(SITE_A)).toBe('risk')
  })

  it('returns "warn" for med severity (no high)', () => {
    // SITE_B has med + med
    expect(siteWorstStatus(SITE_B)).toBe('warn')
  })

  it('returns "info" for low-only site', () => {
    const s = makeSite('low-only', [makeRisk('low-only', 'low')])
    expect(siteWorstStatus(s)).toBe('info')
  })
})
