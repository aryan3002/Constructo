/**
 * Pure helpers for the Brief screen. Extracted for testability (Expo Router
 * evaluates files in app/ as routes — tests must live in src/ and import
 * from here, NOT from brief.tsx directly).
 */
import { severityToStatus, type Status } from '../../../src/theme/tokens'
import type { BriefSite, Risk } from '../../../src/api/owner'

/** All ranked risks across all sites, sorted by severity (high → low). */
export interface RankedRisk {
  risk: Risk
  site: BriefSite
  key: string
}

const SEV_RANK: Record<string, number> = { high: 0, med: 1, low: 2 }

/** Flatten + rank risks from all sites. */
export function buildRanked(sites: BriefSite[]): RankedRisk[] {
  const ranked: RankedRisk[] = []
  for (const site of sites) {
    for (let i = 0; i < site.top_risks.length; i++) {
      const risk = site.top_risks[i]
      ranked.push({ risk, site, key: `${site.site_id}:${i}` })
    }
  }
  return ranked.sort((a, b) => (SEV_RANK[a.risk.severity] ?? 9) - (SEV_RANK[b.risk.severity] ?? 9))
}

/**
 * Scope ranked risks to a single site. `null` = all sites (no filter).
 * This is the client-side filtering that powers the SiteSwitcher.
 */
export function scopeRanked(ranked: RankedRisk[], selectedSiteId: string | null): RankedRisk[] {
  if (selectedSiteId == null) return ranked
  return ranked.filter((r) => r.site.site_id === selectedSiteId)
}

/** Scope sites list to the selected site. `null` = all sites. */
export function scopeSites(sites: BriefSite[], selectedSiteId: string | null): BriefSite[] {
  if (selectedSiteId == null) return sites
  return sites.filter((s) => s.site_id === selectedSiteId)
}

/** Worst status across a site's risks. */
export function siteWorstStatus(site: BriefSite): Status {
  let worst: Status = 'ok'
  const order: Status[] = ['ok', 'info', 'warn', 'risk']
  for (const r of site.top_risks) {
    const s = severityToStatus(r.severity)
    if (order.indexOf(s) > order.indexOf(worst)) worst = s
  }
  return worst
}
