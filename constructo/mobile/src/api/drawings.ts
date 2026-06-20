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

/** A direct-to-R2 upload ticket for a new sheet. `mode === 'presigned'` → PUT the
 *  bytes to `put_url`; `'unavailable'` (local/dev storage) → no upload path. */
export interface DrawingPresign {
  key: string
  put_url: string | null
  mode: 'presigned' | 'unavailable'
}

export const drawingsApi = {
  /** Released drawings for a site, newest first. */
  list(siteId: string): Promise<Drawing[]> {
    return request<Drawing[]>(
      `/api/v1/publish/drawings?site_id=${encodeURIComponent(siteId)}`,
    )
  },

  /** Mint a direct-to-R2 upload ticket for a new sheet (site-scoped). */
  presign(body: { site_id: string; filename: string; content_type: string }): Promise<DrawingPresign> {
    return request<DrawingPresign>('/api/v1/publish/drawings/presign', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Publish a sheet row once its file is uploaded (file_url = the stored key). */
  create(body: {
    site_id: string
    title: string
    version: string
    file_url: string
    kind?: DrawingKind
    change_note?: string
    supersedes_id?: string
  }): Promise<Drawing> {
    return request<Drawing>('/api/v1/publish/drawings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}

/** A picked local file (from expo-image-picker / -document-picker). */
export interface PickedFile {
  uri: string
  name: string
  contentType: string
}

/**
 * Upload a local file to R2 and publish it as a drawing/plan sheet. Two-step,
 * mirroring the chat media path: presign → PUT the bytes → create the row.
 * Throws 'uploads_unavailable' when the backend has no cloud storage (local
 * dev), so the caller can show an honest message instead of a silent failure.
 */
export async function uploadDrawing(opts: {
  siteId: string
  file: PickedFile
  title: string
  version: string
  kind?: DrawingKind
  changeNote?: string
}): Promise<Drawing> {
  const presign = await drawingsApi.presign({
    site_id: opts.siteId,
    filename: opts.file.name,
    content_type: opts.file.contentType,
  })
  if (presign.mode !== 'presigned' || !presign.put_url) {
    throw new Error('uploads_unavailable')
  }
  const blob = await (await fetch(opts.file.uri)).blob()
  const putRes = await fetch(presign.put_url, {
    method: 'PUT',
    headers: { 'Content-Type': opts.file.contentType },
    body: blob,
  })
  if (!putRes.ok) throw new Error('upload_failed')
  return drawingsApi.create({
    site_id: opts.siteId,
    title: opts.title,
    version: opts.version,
    file_url: presign.key,
    kind: opts.kind,
    change_note: opts.changeNote,
  })
}
