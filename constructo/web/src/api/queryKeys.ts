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
  /** The caller's company (Setup & Admin → Company Profile, W4.1). */
  company: () => ['company'] as const,
  /** Company billing tracking (Setup & Admin → Billing, W4.8). */
  billing: () => ['billing'] as const,
  /** Company team roster (Setup & Admin → Team & roles, W4.3). */
  team: () => ['team'] as const,
  sites: () => ['sites'] as const,
  site: (id: string) => ['site', id] as const,
  /** A site's baseline (Setup & Admin → Site baselines, W4.4). */
  baseline: (siteId: string) => ['baseline', siteId] as const,
  /** Vendor master (Setup & Admin → Vendors, W4.5). */
  vendors: (includeArchived = false) => ['vendors', includeArchived] as const,
  /** Material catalog (Setup & Admin → Materials, W4.6). */
  materials: (includeArchived = false) => ['materials', includeArchived] as const,
  /** OwnerHome brief payload (migrated from `['owner-home', date]` in W1). */
  home: (date: string) => ['home', date] as const,
  brief: (date?: string) => ['brief', date] as const,
  /** Owner Command Center decision log (newest-first company decisions). */
  decisions: () => ['decisions'] as const,
  reconcile: (siteId: string) => ['reconcile', siteId] as const,
  payments: () => ['payments'] as const,
  financials: (siteId: string) => ['financials', siteId] as const,
  permits: () => ['permits'] as const,
  approvals: (tab?: string) => ['approvals', tab] as const,
  /** Notification feed + the bell's unread badge (W3.3). The two share the
   *  `['notifications']` prefix so a single invalidate refetches both. */
  notifications: () => ['notifications', 'feed'] as const,
  notificationsUnread: () => ['notifications', 'unread'] as const,
  /** Company notification & SLA settings (Setup & Admin, W4.7). */
  notificationSettings: () => ['notifications', 'settings'] as const,
  search: (query: string) => ['search', query] as const,
  reports: () => ['reports'] as const,
} as const
