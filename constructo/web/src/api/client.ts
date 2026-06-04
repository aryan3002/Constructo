import { API_BASE, USE_MOCKS } from './config'
import { getToken, setToken } from './auth'
import type {
  CreateWhatsappGroupRequest,
  LoginRequest,
  LoginResponse,
  OwnerBrief,
  Paginated,
  RunBriefRequest,
  RunBriefResponse,
  Site,
  SiteBaseline,
  SiteEvent,
  Vendor,
  WhatsappGroup,
} from './types'
import {
  MOCK_COMPANY_ID,
  mockBrief,
  mockEventsBySite,
  mockGroups,
  mockSites,
} from '../mocks/fixtures'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms))

/** Dev-only per-site baseline store so the no-backend admin tour reads + saves. */
const mockBaselines: Record<string, SiteBaseline> = {}

/** Dev-only vendor master so the no-backend admin tour lists + edits. */
const mockVendors: Vendor[] = [
  { id: 'vendor-1', company_id: MOCK_COMPANY_ID, name: 'Ambuja Cement Depot', category: 'material', gstin: '27AAACA1234A1Z5', phone: '+919800011111', notes: null, is_active: true, created_at: '2026-02-01T00:00:00Z' },
  { id: 'vendor-2', company_id: MOCK_COMPANY_ID, name: 'Sharma Labour Supply', category: 'labour', gstin: null, phone: '+919800022222', notes: null, is_active: true, created_at: '2026-02-03T00:00:00Z' },
  { id: 'vendor-3', company_id: MOCK_COMPANY_ID, name: 'Metro Crane Rentals', category: 'equipment', gstin: '29AABCM5678B1Z3', phone: '+919800033333', notes: null, is_active: false, created_at: '2026-01-15T00:00:00Z' },
]

// ---------------------------------------------------------------------------
// Public API surface. Each method returns mock data when VITE_USE_MOCKS=true.
// ---------------------------------------------------------------------------

export const api = {
  companyId: MOCK_COMPANY_ID,

  async login(body: LoginRequest): Promise<LoginResponse> {
    if (USE_MOCKS) {
      await delay()
      if (!body.phone) throw new ApiError(400, 'Phone is required')
      const resp: LoginResponse = { token: `mock-token-${body.phone}` }
      setToken(resp.token)
      return resp
    }
    const resp = await request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setToken(resp.token)
    return resp
  },

  async listSites(): Promise<Paginated<Site>> {
    if (USE_MOCKS) {
      await delay()
      return { items: mockSites, next_cursor: null }
    }
    return request<Paginated<Site>>('/api/v1/sites')
  },

  async getSite(id: string): Promise<Site> {
    if (USE_MOCKS) {
      await delay()
      const site = mockSites.find((s) => s.id === id)
      if (!site) throw new ApiError(404, 'Site not found')
      return site
    }
    return request<Site>(`/api/v1/sites/${id}`)
  },

  async getBrief(date: string): Promise<OwnerBrief | null> {
    if (USE_MOCKS) {
      await delay()
      return mockBrief(date)
    }
    const page = await request<Paginated<OwnerBrief>>(
      `/api/v1/briefs?date=${encodeURIComponent(date)}`,
    )
    return page.items[0] ?? null
  },

  async runBrief(body: RunBriefRequest): Promise<RunBriefResponse> {
    if (USE_MOCKS) {
      await delay(600)
      const date = body.date ?? new Date().toISOString().slice(0, 10)
      const brief = mockBrief(date)
      return { payload: brief.payload, text: brief.text, brief_id: brief.id }
    }
    return request<RunBriefResponse>('/api/v1/briefs/run', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // Events endpoint MAY not exist on the backend yet. Fall back to mocks on 404.
  async listSiteEvents(
    siteId: string,
    date: string,
  ): Promise<{ events: SiteEvent[]; usedMock: boolean }> {
    if (USE_MOCKS) {
      await delay()
      return { events: mockEventsBySite[siteId] ?? [], usedMock: true }
    }
    try {
      const page = await request<Paginated<SiteEvent>>(
        `/api/v1/sites/${siteId}/events?date=${encodeURIComponent(date)}`,
      )
      return { events: page.items, usedMock: false }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { events: mockEventsBySite[siteId] ?? [], usedMock: true }
      }
      throw err
    }
  },

  async listGroups(): Promise<Paginated<WhatsappGroup>> {
    if (USE_MOCKS) {
      await delay()
      return { items: [...mockGroups], next_cursor: null }
    }
    return request<Paginated<WhatsappGroup>>('/api/v1/whatsapp-groups')
  },

  async createGroup(
    body: CreateWhatsappGroupRequest,
  ): Promise<WhatsappGroup> {
    if (USE_MOCKS) {
      await delay()
      const created: WhatsappGroup = {
        id: `wg-${Date.now()}`,
        company_id: MOCK_COMPANY_ID,
        created_at: new Date().toISOString(),
        ...body,
      }
      mockGroups.push(created)
      return created
    }
    return request<WhatsappGroup>('/api/v1/whatsapp-groups', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // ---- site baselines (W4.4) ----

  async getBaseline(siteId: string): Promise<SiteBaseline> {
    if (USE_MOCKS) {
      await delay()
      return (
        mockBaselines[siteId] ?? {
          site_id: siteId,
          expected_daily_headcount: null,
          notes: null,
          updated_at: new Date(0).toISOString(),
        }
      )
    }
    return request<SiteBaseline>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/baseline`,
    )
  },

  async setBaseline(
    siteId: string,
    body: { expected_daily_headcount: number | null; notes?: string | null },
  ): Promise<SiteBaseline> {
    if (USE_MOCKS) {
      await delay()
      const next: SiteBaseline = {
        site_id: siteId,
        expected_daily_headcount: body.expected_daily_headcount,
        notes: body.notes ?? mockBaselines[siteId]?.notes ?? null,
        updated_at: new Date().toISOString(),
      }
      mockBaselines[siteId] = next
      return next
    }
    return request<SiteBaseline>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/baseline`,
      { method: 'PUT', body: JSON.stringify(body) },
    )
  },

  // ---- vendors (W4.5) ----

  async listVendors(includeArchived = false): Promise<Vendor[]> {
    if (USE_MOCKS) {
      await delay()
      return mockVendors
        .filter((v) => includeArchived || v.is_active)
        .map((v) => ({ ...v }))
    }
    const q = includeArchived ? '?include_archived=true' : ''
    return request<Vendor[]>(`/api/v1/vendors${q}`)
  },

  async createVendor(body: {
    name: string
    category?: string | null
    gstin?: string | null
    phone?: string | null
    notes?: string | null
  }): Promise<Vendor> {
    if (USE_MOCKS) {
      await delay()
      const created: Vendor = {
        id: `vendor-${mockVendors.length + 1}`,
        company_id: MOCK_COMPANY_ID,
        name: body.name,
        category: body.category ?? null,
        gstin: body.gstin ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        is_active: true,
        created_at: new Date().toISOString(),
      }
      mockVendors.push(created)
      return { ...created }
    }
    return request<Vendor>('/api/v1/vendors', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async updateVendor(
    id: string,
    patch: Partial<
      Pick<Vendor, 'name' | 'category' | 'gstin' | 'phone' | 'notes' | 'is_active'>
    >,
  ): Promise<Vendor> {
    if (USE_MOCKS) {
      await delay()
      const v = mockVendors.find((x) => x.id === id)
      if (!v) throw new ApiError(404, 'Vendor not found')
      Object.assign(v, patch)
      return { ...v }
    }
    return request<Vendor>(`/api/v1/vendors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
}
