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

// ---------------------------------------------------------------------------
// Transcript-back: after a voice capture lands, fetch what the AI HEARD so the
// human can confirm/correct quantities before it commits (CA1 "AI proposes,
// human commits"). The /capture POST returns only a raw_message_id (extraction
// may run async), so we poll the site's events feed for the event whose
// source_message_ids contains that id, and read back its summary + numerals.
// ---------------------------------------------------------------------------

/** The numeral the AI extracted at a money/quantity moment — confirmable. */
export interface ExtractedNumeral {
  /** 'headcount' (attendance) | 'quantity' (delivery) | 'amount' (invoice). */
  key: 'headcount' | 'quantity' | 'amount'
  value: number
  /** Material/unit/vendor context to render next to the number, if any. */
  unit?: string | null
}

/** What the AI heard + extracted for one capture, for the confirm chip. */
export interface CaptureExtraction {
  event_id: string
  /** The transcript/summary the AI produced — "what was heard". */
  heard: string
  confidence: number
  needs_clarification: boolean
  /** The single confirmable numeral, when the event carries one. */
  numeral: ExtractedNumeral | null
}

interface SiteEventRow {
  id: string
  summary: string
  fields: Record<string, unknown>
  confidence: number
  needs_clarification: boolean
  source_message_ids: string[]
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function pickNumeral(fields: Record<string, unknown>): ExtractedNumeral | null {
  const head = asNum(fields.headcount)
  if (head != null) return { key: 'headcount', value: head }
  const qty = asNum(fields.quantity)
  if (qty != null) {
    const unit = typeof fields.unit === 'string' ? fields.unit : null
    return { key: 'quantity', value: qty, unit }
  }
  const amt = asNum(fields.amount)
  if (amt != null) {
    const cur = typeof fields.currency === 'string' ? fields.currency : null
    return { key: 'amount', value: amt, unit: cur }
  }
  return null
}

/**
 * Poll a site's events for the one created from `rawMessageId` and return what
 * the AI heard. Resolves to `null` if it hasn't landed within the budget (the
 * optimistic "queued" state stays — we never block or invent a transcript).
 *
 * Offline-tolerant: any request failure ends the poll quietly (returns null),
 * so a flaky network never throws into the capture UI.
 */
export async function fetchCaptureExtraction(
  siteId: string,
  rawMessageId: string,
  { attempts = 6, intervalMs = 1500 }: { attempts?: number; intervalMs?: number } = {},
): Promise<CaptureExtraction | null> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const page = await request<Paginated<SiteEventRow>>(
        `/api/v1/sites/${encodeURIComponent(siteId)}/events`,
      )
      const match = page.items.find((e) =>
        (e.source_message_ids ?? []).includes(rawMessageId),
      )
      if (match) {
        return {
          event_id: match.id,
          heard: match.summary,
          confidence: match.confidence,
          needs_clarification: match.needs_clarification,
          numeral: pickNumeral(match.fields ?? {}),
        }
      }
    } catch {
      return null // network/permission issue — fall back to optimistic state
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return null
}
