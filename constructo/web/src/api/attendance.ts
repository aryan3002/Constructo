// Attendance API layer for the field-role screens (supervisor + mukadam).
//
// Reuses the shared client primitives (API_BASE, ApiError, getToken) by IMPORT
// only — it never edits them. All requests are auth-gated with the stored token
// and return the backend's snake_case JSON shapes verbatim.
//
// Offline-tolerant by design: `captureAttendance` carries a `client_capture_id`
// so the supervisor screen's sync-queue can retry safely (the backend is
// idempotent on that id) without ever creating a duplicate day's count.

import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'
import type { Paginated } from './types'

export interface AttendanceEvent {
  id: string
  site_id: string
  occurred_on: string
  headcount: number | null
  by_trade: Record<string, number> | null
  summary: string
  confidence: number
  needs_clarification: boolean
  source: string
  proof_media_urls: string[]
  client_capture_id: string | null
  version: number
  created_at: string
}

export interface CaptureAttendanceRequest {
  headcount: number
  occurred_on?: string
  by_trade?: Record<string, number>
  note?: string
  source?: string
  proof_media_urls?: string[]
  client_capture_id?: string
}

export type AttendanceStatus = 'ok' | 'warn' | 'risk' | 'info'

export interface PlannedVsActual {
  site_id: string
  occurred_on: string
  expected: number | null
  actual: number
  variance: number | null
  status: AttendanceStatus
  capture_count: number
}

export interface MyPayment {
  id: string
  site_id: string | null
  amount: string
  currency: string
  paid_on: string
  method: string | null
  status: 'recorded' | 'confirmed' | 'disputed' | string
  notes: string | null
  created_at: string
}

async function authedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export const attendanceApi = {
  capture(siteId: string, body: CaptureAttendanceRequest): Promise<AttendanceEvent> {
    return authedRequest<AttendanceEvent>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/attendance`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  list(siteId: string, date?: string): Promise<Paginated<AttendanceEvent>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : ''
    return authedRequest<Paginated<AttendanceEvent>>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/attendance${q}`,
    )
  },

  summary(siteId: string, date?: string): Promise<PlannedVsActual> {
    const q = date ? `?date=${encodeURIComponent(date)}` : ''
    return authedRequest<PlannedVsActual>(
      `/api/v1/sites/${encodeURIComponent(siteId)}/attendance/summary${q}`,
    )
  },

  myPayments(): Promise<Paginated<MyPayment>> {
    return authedRequest<Paginated<MyPayment>>('/api/v1/me/payments')
  },
}
