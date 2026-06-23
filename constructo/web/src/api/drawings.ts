/**
 * Drawings Register API client (W5 Slice 2a).
 *
 * Endpoints:
 *   GET  /api/v1/publish/drawings/register  → DrawingRegisterRow[]
 *   POST /api/v1/publish/drawings/presign   → PresignTicket
 *   POST /api/v1/publish/drawings           → DrawingRegisterRow (201)
 *
 * All write endpoints are role-gated server-side (pm | architect | supervisor).
 * Reads are available to all authenticated roles.
 */

import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'
import { ApiError } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawingKind =
  | 'plan'
  | 'elevation'
  | 'section'
  | 'structural'
  | 'electrical'
  | 'plumbing'
  | 'other'

/** Canonical ordered list of drawing kinds — drives the upload Type selector. */
export const DRAWING_KINDS: DrawingKind[] = [
  'plan',
  'elevation',
  'section',
  'structural',
  'electrical',
  'plumbing',
  'other',
]

export interface DrawingRegisterRow {
  id: string
  site_id: string
  title: string
  version: string
  kind: DrawingKind
  change_note: string | null
  published_at: string
  supersedes_id: string | null
  site_name: string
  is_current: boolean
  /** Resolved presigned URL or bare R2 key. */
  file_url: string
}

export interface PresignTicket {
  key: string
  put_url: string | null
  mode: 'presigned' | 'unavailable'
}

export interface PublishDrawingBody {
  site_id: string
  title: string
  version: string
  /** The R2 key returned by presign (not the put_url). */
  file_url: string
  kind: DrawingKind
  change_note?: string | null
  plain_summary_en?: string | null
  plain_summary_hi?: string | null
  supersedes_id?: string | null
}

/**
 * Classify an upload-flow error so the UI can show the real reason instead of a
 * generic message. `putToR2` throws an `ApiError` whose message starts with
 * "R2 upload failed" (R2 returned non-2xx); a CORS / offline failure on the
 * direct browser PUT (or presign) surfaces as a `TypeError` ("Failed to fetch").
 * Anything else is a backend rejection (presign / publish) whose `detail` we surface.
 *
 * - `kind: 'upload'` → the file never reached storage (connection / CORS / R2).
 * - `kind: 'save'`   → storage was fine but the server rejected the record; `detail` has why.
 */
export function describeUploadError(err: unknown): { kind: 'upload' | 'save'; detail: string } {
  if (err instanceof ApiError && !err.message.startsWith('R2 upload failed')) {
    return { kind: 'save', detail: err.message }
  }
  // R2 PUT non-2xx (ApiError "R2 upload failed"), a fetch network/CORS TypeError,
  // or any unknown throwable → treat as an upload-side failure.
  return { kind: 'upload', detail: '' }
}

// ---------------------------------------------------------------------------
// Internal JSON helper
// ---------------------------------------------------------------------------

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Mock roster (offline / VITE_USE_MOCKS=true)
// ---------------------------------------------------------------------------

/** Module-level roster so mutations persist for the lifetime of the tab. */
const mockRoster: DrawingRegisterRow[] = [
  {
    id: 'drw-mock-1',
    site_id: 'mock-site-1',
    title: 'Ground Floor Plan',
    version: 'v1',
    kind: 'plan',
    change_note: 'Initial issue',
    published_at: '2026-05-15T10:00:00Z',
    supersedes_id: null,
    site_name: 'Tripathi Residence',
    is_current: false,
    file_url: 'mock-key/ground-floor-plan-v1.pdf',
  },
  {
    id: 'drw-mock-2',
    site_id: 'mock-site-1',
    title: 'Ground Floor Plan',
    version: 'v2',
    kind: 'plan',
    change_note: 'Revised after owner approval — kitchen enlarged',
    published_at: '2026-06-01T14:30:00Z',
    supersedes_id: 'drw-mock-1',
    site_name: 'Tripathi Residence',
    is_current: true,
    file_url: 'mock-key/ground-floor-plan-v2.pdf',
  },
  {
    id: 'drw-mock-3',
    site_id: 'mock-site-1',
    title: 'North Elevation',
    version: 'v1',
    kind: 'elevation',
    change_note: null,
    published_at: '2026-06-10T09:15:00Z',
    supersedes_id: null,
    site_name: 'Tripathi Residence',
    is_current: true,
    file_url: 'mock-key/north-elevation-v1.pdf',
  },
]

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const drawingsApi = {
  /**
   * Fetch the drawings register.
   * Pass `siteId` to filter to a single site; omit for all sites in the company.
   */
  listRegister(siteId?: string): Promise<DrawingRegisterRow[]> {
    if (USE_MOCKS) {
      const rows = siteId
        ? mockRoster.filter((r) => r.site_id === siteId)
        : [...mockRoster]
      return Promise.resolve(rows)
    }
    const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : ''
    return jsonRequest<DrawingRegisterRow[]>(
      `/api/v1/publish/drawings/register${qs}`,
    )
  },

  /**
   * Obtain a presigned PUT URL for uploading a drawing to R2.
   * `mode: 'unavailable'` means R2 is not configured — use a direct upload or skip.
   */
  presign(
    siteId: string,
    filename: string,
    contentType: string,
  ): Promise<PresignTicket> {
    if (USE_MOCKS) {
      return Promise.resolve({ key: 'mock-key', put_url: null, mode: 'unavailable' })
    }
    return jsonRequest<PresignTicket>('/api/v1/publish/drawings/presign', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, filename, content_type: contentType }),
    })
  },

  /**
   * Publish a new drawing revision to the register.
   * Pass `supersedes_id` to mark the prior version as superseded.
   */
  publish(body: PublishDrawingBody): Promise<DrawingRegisterRow> {
    if (USE_MOCKS) {
      const now = new Date().toISOString()
      const newRow: DrawingRegisterRow = {
        id: `drw-mock-${Date.now()}`,
        site_id: body.site_id,
        title: body.title,
        version: body.version,
        kind: body.kind,
        change_note: body.change_note ?? null,
        published_at: now,
        supersedes_id: body.supersedes_id ?? null,
        site_name: 'Mock Site',
        is_current: true,
        file_url: body.file_url,
      }
      // Mark the superseded row as no longer current.
      if (body.supersedes_id) {
        const prior = mockRoster.find((r) => r.id === body.supersedes_id)
        if (prior) prior.is_current = false
      }
      mockRoster.push(newRow)
      return Promise.resolve({ ...newRow })
    }
    return jsonRequest<DrawingRegisterRow>('/api/v1/publish/drawings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Upload a file directly to R2 using a presigned PUT URL.
   * No bearer token — the URL itself is the credential.
   * Throws `ApiError` on non-ok.
   */
  async putToR2(url: string, file: File): Promise<void> {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!res.ok) {
      throw new ApiError(res.status, `R2 upload failed: ${res.statusText}`)
    }
  },
}
