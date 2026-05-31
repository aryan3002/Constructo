/**
 * Field-capture API (Supervisor / Mukadam). A capture is a multipart POST to
 * /api/v1/capture (JWT bearer) carrying an optional media file (photo/voice) +
 * {site_id, type?, text?}. The backend stores the media and drops a
 * RawMessage(source="app") into the real extraction pipeline.
 *
 * Captures are queued in the offline outbox and replayed by `useOutbox`, which
 * calls {@link submitCapture}. Multipart can't go through the JSON `request`
 * helper, so this uses `fetch` directly (and must NOT set Content-Type — fetch
 * sets the multipart boundary).
 */
import { API_BASE } from './config'
import { ApiError, request } from './client'
import type { Paginated, Site } from './types'
import { getToken } from '../store/secure'

export interface CaptureMedia {
  uri: string
  name: string
  mime: string
}

export interface CapturePayload {
  site_id: string
  /** A coarse tag: attendance | delivery | progress | issue | … */
  type?: string | null
  text?: string | null
  media?: CaptureMedia | null
}

export interface CaptureResult {
  raw_message_id: string
  status: string
}

export async function submitCapture(p: CapturePayload): Promise<CaptureResult> {
  const form = new FormData()
  form.append('site_id', p.site_id)
  if (p.type) form.append('type', p.type)
  if (p.text) form.append('text', p.text)
  if (p.media) {
    // React Native FormData file part: { uri, name, type }.
    form.append('media', {
      uri: p.media.uri,
      name: p.media.name,
      type: p.media.mime,
    } as unknown as Blob)
  }

  const token = await getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api/v1/capture`, {
    method: 'POST',
    headers, // intentionally NO Content-Type — RN sets the multipart boundary
    body: form,
  })
  if (!res.ok) {
    let message = res.statusText
    let code = 'http_error'
    try {
      const body = await res.json()
      message = body?.error?.message ?? message
      code = body?.error?.code ?? code
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, message, code)
  }
  return (await res.json()) as CaptureResult
}

/** The sites the caller can capture against (assigned sites; owner/PM = all). */
export async function captureSites(): Promise<Site[]> {
  const page = await request<Paginated<Site>>('/api/v1/sites')
  return page.items
}
