// Search API layer (owned by the search feature).
//
// Reuses the shared client primitives by IMPORT ONLY (API_BASE / ApiError /
// getToken) — it does not modify them. Mirrors the backend
// POST /api/v1/search contract (snake_case on the wire).

import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'
import type { SiteEventType } from './types'

export interface SearchRequest {
  q: string
  site_id?: string
  event_type?: SiteEventType
  date_from?: string // YYYY-MM-DD
  date_to?: string // YYYY-MM-DD
  limit?: number
}

export interface SearchEvidence {
  source_message_ids: string[]
  confidence: number
  needs_clarification: boolean
}

export interface SearchHit {
  event_id: string
  site_id: string
  site_name: string
  event_type: SiteEventType
  occurred_on: string
  summary: string
  fields: Record<string, unknown>
  score: number
  evidence: SearchEvidence
  created_at: string
}

export interface ParsedQuery {
  semantic_text: string
  event_type: SiteEventType | null
  date_from: string | null
  date_to: string | null
  site_name_hint: string | null
}

export interface SearchResponse {
  query: ParsedQuery
  hits: SearchHit[]
  // false => the API is not confident enough to answer (no scope / nothing
  // cleared the relevance floor); the UI shows a "not sure" state instead of
  // presenting weak guesses as fact.
  answerable: boolean
}

/** POST /api/v1/search. Throws {@link ApiError} on a non-2xx response. */
export async function search(body: SearchRequest): Promise<SearchResponse> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}/api/v1/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const errBody = await res.json()
      detail = errBody?.detail ?? errBody?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }

  return (await res.json()) as SearchResponse
}
