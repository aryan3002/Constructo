/**
 * Disputes API client for Constructo web (Phase D).
 *
 * Per-event dispute lifecycle (contested capture cards): raise (any crew),
 * resolve (owner/pm), withdraw (raiser). Mirrors the backend contract in
 * `app/disputes/router.py`. Same local `request<T>` convention as `api/chat.ts`.
 */
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

export type DisputeStatus = 'open' | 'resolved' | 'withdrawn'

export interface Dispute {
  id: string
  event_id: string
  site_id: string
  raised_by: string | null
  raised_by_role: string | null
  reason: string
  proposed_fields: Record<string, unknown> | null
  status: DisputeStatus
  resolved_by: string | null
  resolution_note: string | null
  resolved_fields: Record<string, unknown> | null
  resolved_event_id: string | null
  created_at: string
  resolved_at: string | null
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

export const disputesApi = {
  /** All disputes (any status) for an event, oldest-first. */
  list(eventId: string): Promise<Dispute[]> {
    return request<Dispute[]>(`/api/v1/events/${eventId}/disputes`)
  },

  /** Raise a dispute against an event (any crew). */
  raise(
    eventId: string,
    body: { reason: string; proposed_fields?: Record<string, unknown> },
  ): Promise<Dispute> {
    return request<Dispute>(`/api/v1/events/${eventId}/disputes`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Resolve an open dispute (owner/pm). `resolved_fields` supersedes the event. */
  resolve(
    disputeId: string,
    body: { resolution_note?: string; resolved_fields?: Record<string, unknown> },
  ): Promise<Dispute> {
    return request<Dispute>(`/api/v1/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Withdraw an open dispute (only the raiser). */
  withdraw(disputeId: string): Promise<Dispute> {
    return request<Dispute>(`/api/v1/disputes/${disputeId}/withdraw`, { method: 'POST' })
  },
}
