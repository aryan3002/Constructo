/**
 * Canonical React Query key factory (vault 11/04 §3.1). New code reads keys from
 * here so cache reads + invalidations can never drift apart on a typo'd string.
 *
 * Migration note: OwnerHome's old inline `['owner-home', date]` key was migrated
 * to `qk.home(date)` in W1 (with its one invalidation site, atomically). The
 * reconcile `windowDays` shape is still a *breaking* migration deferred to W2 —
 * see the PR description. Prefer `qk.*` for anything new.
 */
export const qk = {
  me: () => ['me'] as const,
  sites: () => ['sites'] as const,
  site: (id: string) => ['site', id] as const,
  /** OwnerHome brief payload (migrated from `['owner-home', date]` in W1). */
  home: (date: string) => ['home', date] as const,
  brief: (date?: string) => ['brief', date] as const,
  /** Owner Command Center decision log (newest-first company decisions). */
  decisions: () => ['decisions'] as const,
  reconcile: (siteId: string) => ['reconcile', siteId] as const,
  payments: () => ['payments'] as const,
  permits: () => ['permits'] as const,
  approvals: (tab?: string) => ['approvals', tab] as const,
  search: (query: string) => ['search', query] as const,
} as const
