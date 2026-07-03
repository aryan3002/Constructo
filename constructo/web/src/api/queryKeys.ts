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
  /** Owner activity stream page (keyed by optional site filter). */
  activity: (siteId?: string) => ['activity', siteId ?? null] as const,
  /**
   * Owner activity hero summary (updates_today / needs_decision_count / sites_total).
   *
   * NOTE: `['activity', 'summary']` does NOT partial-match `qk.activity()`'s
   * `['activity', null]` (or any `qk.activity(siteId)`) under React Query v5's
   * positional array matching — the second element differs (`'summary'` vs
   * `null`/`siteId`), so `invalidateQueries({ queryKey: qk.activity() })` alone
   * will NOT refetch this. Callers that need both fresh (e.g. after creating a
   * site) must invalidate both keys explicitly, same as `useDecide.ts` does for
   * its home/log pair. See activity.test.ts for a verifying test.
   */
  activitySummary: () => ['activity', 'summary'] as const,
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
  drawings: (siteId?: string) => (siteId ? (['drawings', siteId] as const) : (['drawings'] as const)),
  /** Company-wide documents register (W5 Slice 2b). */
  companyDocuments: (includeArchived?: boolean) => ['company_documents', !!includeArchived] as const,
  /** Flat spec list for a site (SpecOut[]). */
  specs: (siteId: string) => ['specs', siteId] as const,
  /** Room-grouped spec desk (DeskOut). */
  specDesk: (siteId: string) => ['spec_desk', siteId] as const,
  /** Site changes feed (D3). Keyed by siteId + optional status filter. */
  siteChanges: (opts?: { siteId?: string; status?: string }) =>
    ['site_changes', opts?.siteId ?? null, opts?.status ?? null] as const,
  /** Single site change detail (D3). */
  siteChange: (id: string) => ['site_change', id] as const,
  /** Design-profiler: most recent profile for a site (D5). */
  designProfile: (siteId: string) => ['design_profile', siteId] as const,
  /** Design-profiler: architect brief rendering for a profile (D5). */
  designBrief: (profileId: string) => ['design_brief', profileId] as const,
  /** Design-profiler: themes for one area (D5). */
  designThemes: (profileId: string, areaId: string) =>
    ['design_themes', profileId, areaId] as const,
} as const
