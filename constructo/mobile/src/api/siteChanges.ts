/**
 * Site-changes API — the field → designer feedback loop. A site engineer reports
 * an as-built condition that diverges from the design; the designer reviews it,
 * links it to a drawing revision, and resolves it. Backed by the (non-Labs)
 * `/api/v1/site-changes` router.
 */
import { request } from './client'

export type SiteChangeStatus = 'new' | 'linked' | 'resolved'

export interface SiteChange {
  id: string
  company_id: string
  site_id: string
  room: string | null
  title: string
  note: string
  impact: string | null
  photo_url: string | null
  reported_by: string | null
  status: SiteChangeStatus
  linked_drawing_id: string | null
  created_at: string
  resolved_at: string | null
}

const qs = (params: Record<string, string | undefined>): string => {
  const e = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return e.length ? '?' + new URLSearchParams(e).toString() : ''
}

export const siteChangesApi = {
  /** Site changes the caller can see, newest first. */
  list(opts: { siteId?: string; status?: SiteChangeStatus } = {}): Promise<SiteChange[]> {
    return request<SiteChange[]>(`/api/v1/site-changes${qs({ site_id: opts.siteId, status: opts.status })}`)
  },

  get(id: string): Promise<SiteChange> {
    return request<SiteChange>(`/api/v1/site-changes/${id}`)
  },

  /** Report a site-condition change (the field engineer). */
  report(body: {
    site_id: string
    title: string
    note: string
    room?: string
    impact?: string
    photo_url?: string
  }): Promise<SiteChange> {
    return request<SiteChange>('/api/v1/site-changes', { method: 'POST', body: JSON.stringify(body) })
  },

  /** Review: link to a revision, edit the impact note, or resolve (designer). */
  update(
    id: string,
    body: { status?: SiteChangeStatus; impact?: string; linked_drawing_id?: string },
  ): Promise<SiteChange> {
    return request<SiteChange>(`/api/v1/site-changes/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
}
