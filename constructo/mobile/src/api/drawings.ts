/**
 * Published-drawings API — the released drawing/plan sheets the Site Engineer
 * pulls on site. Backed by the (non-Labs) `/api/v1/publish/drawings` router.
 *
 * The backend stores append-only versions: a revision row points at the prior
 * one via `supersedes_id`. There is no "status" column — a drawing is
 * *superseded* iff some other row supersedes it, *latest* otherwise. We compute
 * that client-side with {@link withSupersession} so the screen can warn "don't
 * build from this" and offer the latest revision.
 */
import { request } from './client'

export type DrawingKind =
  | 'plan'
  | 'elevation'
  | 'section'
  | 'structural'
  | 'electrical'
  | 'plumbing'
  | 'other'

export interface Drawing {
  id: string
  site_id: string
  title: string
  version: string
  file_url: string
  kind: DrawingKind
  published_by: string | null
  published_at: string
  plain_summary_en: string | null
  plain_summary_hi: string | null
  change_note: string | null
  supersedes_id: string | null
}

/** A drawing decorated with its derived superseded/latest state. */
export interface DrawingView extends Drawing {
  /** True when a newer revision supersedes this row. */
  superseded: boolean
  /** The newest revision of the same sheet (self when latest). */
  latest: Drawing
}

/**
 * Decorate a site's drawings with superseded/latest state. A row is superseded
 * iff another row's `supersedes_id` points at it; the "latest" of a chain is the
 * row no one supersedes. We resolve latest by following same-title rows (the
 * sheet identity) to the newest non-superseded one.
 */
export function withSupersession(rows: Drawing[]): DrawingView[] {
  const supersededIds = new Set(
    rows.map((d) => d.supersedes_id).filter((v): v is string => v != null),
  )
  // Latest of a sheet = the newest (rows are newest-first) non-superseded row
  // sharing the same title.
  const latestByTitle = new Map<string, Drawing>()
  for (const d of rows) {
    if (!supersededIds.has(d.id) && !latestByTitle.has(d.title)) {
      latestByTitle.set(d.title, d)
    }
  }
  return rows.map((d) => ({
    ...d,
    superseded: supersededIds.has(d.id),
    latest: latestByTitle.get(d.title) ?? d,
  }))
}

export const drawingsApi = {
  /** Released drawings for a site, newest first. */
  list(siteId: string): Promise<Drawing[]> {
    return request<Drawing[]>(
      `/api/v1/publish/drawings?site_id=${encodeURIComponent(siteId)}`,
    )
  },
}
