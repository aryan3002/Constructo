// Permits / government-approvals API module (Phase B).
//
// CRUD over the permit lifecycle plus a per-site checklist. Reuses the shared
// API_BASE / ApiError / token from the foundation (imported, never modified).

import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'
import type { Paginated } from './types'

export type PermitStatus =
  | 'not_started'
  | 'applied'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired'

export interface Permit {
  id: string
  company_id: string
  site_id: string
  permit_type: string
  authority: string
  status: PermitStatus
  applied_on: string | null
  expected_on: string | null
  decided_on: string | null
  expiry_on: string | null
  reference_no: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CreatePermitRequest {
  site_id: string
  permit_type: string
  authority: string
  status?: PermitStatus
  applied_on?: string | null
  expected_on?: string | null
  decided_on?: string | null
  expiry_on?: string | null
  reference_no?: string | null
  notes?: string | null
}

export type UpdatePermitRequest = Partial<Omit<CreatePermitRequest, 'site_id'>>

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function qs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, v)
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export const permitsApi = {
  list(params: { siteId?: string; status?: PermitStatus; cursor?: string } = {}): Promise<
    Paginated<Permit>
  > {
    return request<Paginated<Permit>>(
      `/api/v1/permits${qs({
        site_id: params.siteId,
        status: params.status,
        cursor: params.cursor,
      })}`,
    )
  },

  checklist(siteId: string, cursor?: string): Promise<Paginated<Permit>> {
    return request<Paginated<Permit>>(
      `/api/v1/permits/checklist${qs({ site_id: siteId, cursor })}`,
    )
  },

  get(id: string): Promise<Permit> {
    return request<Permit>(`/api/v1/permits/${id}`)
  },

  create(body: CreatePermitRequest): Promise<Permit> {
    return request<Permit>('/api/v1/permits', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  update(id: string, body: UpdatePermitRequest): Promise<Permit> {
    return request<Permit>(`/api/v1/permits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  remove(id: string): Promise<void> {
    return request<void>(`/api/v1/permits/${id}`, { method: 'DELETE' })
  },
}
