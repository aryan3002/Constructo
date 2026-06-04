/**
 * Canonical React Query key factory (vault 11/04 §3.1). New code reads keys from
 * here so cache reads + invalidations can never drift apart on a typo'd string.
 *
 * Migration note: existing pages still use a few inline keys (notably
 * `['owner-home', date]` in OwnerHome and the `reconcile(siteId, windowDays)`
 * shape). Those are a *breaking* migration (rename + every invalidation site,
 * atomically) and are intentionally deferred to the engine follow-up — see the
 * PR description. Until then, prefer `qk.*` for anything new.
 */
export const qk = {
  me: () => ['me'] as const,
  sites: () => ['sites'] as const,
  site: (id: string) => ['site', id] as const,
  /** Target shape for OwnerHome (currently `['owner-home', date]` — migrate later). */
  home: (date: string) => ['home', date] as const,
  brief: (date?: string) => ['brief', date] as const,
  reconcile: (siteId: string) => ['reconcile', siteId] as const,
  payments: () => ['payments'] as const,
  permits: () => ['permits'] as const,
  approvals: (tab?: string) => ['approvals', tab] as const,
  search: (query: string) => ['search', query] as const,
} as const
