/**
 * Sites API client (Owner Command Center, D1). Self-contained `request<T>`
 * fetch helper mirroring `api/groups.ts` — imports API_BASE / ApiError /
 * getToken by reference so it never depends on the mock-aware `client.ts`
 * `api` object.
 *
 * `create` POSTs /api/v1/sites and returns the full SiteOut. Contrast with the
 * legacy `authApi.createSite` (`api/auth.ts`), which hits the same endpoint but
 * types the response as only `{id, name}` and has a USE_MOCKS short-circuit —
 * this client is for the new "+ New project" modal (D3) and returns everything
 * the backend actually sends back.
 *
 * `SiteOut` is typed precisely off the backend's `app/sites/schemas.py::SiteOut`
 * (id/company_id/name/type/location/status — NO `created_at`, and
 * type/location/status are all nullable). It is intentionally NOT an alias of
 * the web-wide `Site` type in `./types`, which requires `created_at` and
 * non-null `type`/`location`/`status` that this endpoint does not return.
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

export interface SiteOut {
  id: string
  company_id: string
  name: string
  type: string | null
  location: string | null
  status: string | null
}

export interface SiteCreateBody {
  name: string
  type: string
  location?: string
}

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
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const sitesApi = {
  /** Owner (or PM) creates a site. `location` is optional; trimmed and omitted
   *  from the request body entirely if blank/whitespace-only. */
  create(body: SiteCreateBody): Promise<SiteOut> {
    const loc = body.location?.trim()
    const payload: SiteCreateBody = { name: body.name, type: body.type }
    if (loc) payload.location = loc
    return request<SiteOut>('/api/v1/sites', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}
