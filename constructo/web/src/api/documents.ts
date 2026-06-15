/**
 * Company Documents API client (W5 Slice 2b).
 *
 * Endpoints:
 *   GET   /api/v1/documents?site_id=(opt)&include_archived=(opt bool) → CompanyDocument[]
 *   POST  /api/v1/documents/presign  body { filename, content_type, site_id? } → DocPresignTicket
 *   POST  /api/v1/documents          body DocumentCreateBody → CompanyDocument (201)
 *   PATCH /api/v1/documents/{id}     body DocumentUpdateBody → CompanyDocument
 *
 * All write endpoints are role-gated server-side.
 * Reads are available to all authenticated roles.
 */

import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'
import { ApiError } from './client'
import { drawingsApi } from './drawings'

/**
 * Upload a file directly to R2 using a presigned PUT URL.
 * Re-imported from drawings.ts — no duplication.
 */
export const putToR2 = drawingsApi.putToR2.bind(drawingsApi)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocType =
  | 'contract'
  | 'boq'
  | 'noc'
  | 'insurance'
  | 'license'
  | 'other'

export interface CompanyDocument {
  id: string
  company_id: string
  site_id: string | null
  doc_type: DocType
  title: string
  /** Resolved presigned URL or bare R2 key. */
  file_url: string
  expiry_on: string | null
  notes: string | null
  is_active: boolean
  created_by: string
  created_at: string
}

export interface DocPresignTicket {
  key: string
  put_url: string | null
  mode: 'presigned' | 'unavailable'
}

export interface DocumentCreateBody {
  site_id?: string
  doc_type: DocType
  title: string
  /** The R2 key returned by presign (not the put_url). */
  file_url: string
  expiry_on?: string | null
  notes?: string | null
}

export interface DocumentUpdateBody {
  title?: string
  doc_type?: DocType
  expiry_on?: string | null
  notes?: string | null
  is_active?: boolean
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

const MOCK_COMPANY_ID = 'mock-company-1'
const MOCK_CREATED_BY = 'mock-user-1'

/** Module-level roster so mutations persist for the lifetime of the tab. */
const mockRoster: CompanyDocument[] = [
  {
    // Expired: expiry_on is in the past (2026-05-01 is before today 2026-06-14)
    id: 'doc-mock-1',
    company_id: MOCK_COMPANY_ID,
    site_id: null,
    doc_type: 'insurance',
    title: 'Contractor All-Risk Insurance Policy',
    file_url: 'mock-key/insurance-policy-2026.pdf',
    expiry_on: '2026-05-01',
    notes: 'Annual renewal — contact Bajaj Allianz',
    is_active: true,
    created_by: MOCK_CREATED_BY,
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    // Expiring soon: expiry_on within ~10 days of today (2026-06-14)
    id: 'doc-mock-2',
    company_id: MOCK_COMPANY_ID,
    site_id: 'mock-site-1',
    doc_type: 'noc',
    title: 'Municipal NOC – Tripathi Residence',
    file_url: 'mock-key/municipal-noc-site1.pdf',
    expiry_on: '2026-06-20',
    notes: null,
    is_active: true,
    created_by: MOCK_CREATED_BY,
    created_at: '2026-03-10T11:30:00Z',
  },
  {
    // No expiry: evergreen document
    id: 'doc-mock-3',
    company_id: MOCK_COMPANY_ID,
    site_id: 'mock-site-1',
    doc_type: 'contract',
    title: 'Main Construction Agreement – Tripathi Residence',
    file_url: 'mock-key/main-contract-site1.pdf',
    expiry_on: null,
    notes: 'Signed copy; original with PM',
    is_active: true,
    created_by: MOCK_CREATED_BY,
    created_at: '2026-02-20T14:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const documentsApi = {
  /**
   * Fetch the company document register.
   * Pass `siteId` to filter to a single site; omit for all docs in the company.
   * Pass `includeArchived: true` to include is_active=false rows.
   */
  listDocuments(opts?: {
    siteId?: string
    includeArchived?: boolean
  }): Promise<CompanyDocument[]> {
    if (USE_MOCKS) {
      const { siteId, includeArchived = false } = opts ?? {}
      let rows = includeArchived
        ? [...mockRoster]
        : mockRoster.filter((r) => r.is_active)
      if (siteId) rows = rows.filter((r) => r.site_id === siteId)
      return Promise.resolve(rows)
    }
    const params = new URLSearchParams()
    if (opts?.siteId) params.set('site_id', opts.siteId)
    if (opts?.includeArchived) params.set('include_archived', 'true')
    const qs = params.size ? `?${params.toString()}` : ''
    return jsonRequest<CompanyDocument[]>(`/api/v1/documents${qs}`)
  },

  /**
   * Obtain a presigned PUT URL for uploading a document to R2.
   * `mode: 'unavailable'` means R2 is not configured — use a direct upload or skip.
   */
  presign(
    filename: string,
    contentType: string,
    siteId?: string,
  ): Promise<DocPresignTicket> {
    if (USE_MOCKS) {
      return Promise.resolve({ key: 'mock-key', put_url: null, mode: 'unavailable' })
    }
    const body: Record<string, string> = { filename, content_type: contentType }
    if (siteId) body.site_id = siteId
    return jsonRequest<DocPresignTicket>('/api/v1/documents/presign', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Create a new document record.
   * `file_url` should be the R2 key returned by `presign`.
   */
  create(body: DocumentCreateBody): Promise<CompanyDocument> {
    if (USE_MOCKS) {
      const newDoc: CompanyDocument = {
        id: `doc-mock-${mockRoster.length + 1}`,
        company_id: MOCK_COMPANY_ID,
        site_id: body.site_id ?? null,
        doc_type: body.doc_type,
        title: body.title,
        file_url: body.file_url,
        expiry_on: body.expiry_on ?? null,
        notes: body.notes ?? null,
        is_active: true,
        created_by: MOCK_CREATED_BY,
        created_at: '2026-06-14T00:00:00Z',
      }
      mockRoster.push(newDoc)
      return Promise.resolve({ ...newDoc })
    }
    return jsonRequest<CompanyDocument>('/api/v1/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /**
   * Update a document record.
   * Pass `is_active: false` to archive the document.
   */
  update(id: string, patch: DocumentUpdateBody): Promise<CompanyDocument> {
    if (USE_MOCKS) {
      const doc = mockRoster.find((d) => d.id === id)
      if (!doc) throw new ApiError(404, 'Document not found')
      Object.assign(doc, patch)
      return Promise.resolve({ ...doc })
    }
    return jsonRequest<CompanyDocument>(`/api/v1/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
}
