/**
 * Helpers for the Requests & Decisions flow (`app/requests.tsx`).
 *
 * Kept framework-free (no React, no RN) so the route file stays focused on
 * rendering. Covers: request lifecycle → status-spine mapping, a compact
 * "raise an issue" payload builder (detail + room + urgency folded into one
 * string since the API only takes title/detail), and a friendly date format.
 */
import type { Status } from '../src/theme/tokens'
import type { RequestStatus } from '../src/api/types'

/** Lifecycle (sent→seen→in_progress→done) → status spine + bilingual label. */
export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { status: Status; en: string; hi: string }
> = {
  sent: { status: 'info', en: 'Sent', hi: 'भेजा गया' },
  seen: { status: 'info', en: 'Seen', hi: 'देखा गया' },
  in_progress: { status: 'warn', en: 'In progress', hi: 'चल रहा है' },
  done: { status: 'ok', en: 'Done', hi: 'पूरा हुआ' },
}

export type Urgency = 'low' | 'normal' | 'urgent'

/** Preset room tags offered as chips in the issue form (bilingual labels). */
export const ROOM_PRESETS: { key: string; en: string; hi: string }[] = [
  { key: 'kitchen', en: 'Kitchen', hi: 'रसोई' },
  { key: 'bathroom', en: 'Bathroom', hi: 'स्नानघर' },
  { key: 'bedroom', en: 'Bedroom', hi: 'शयनकक्ष' },
  { key: 'living', en: 'Living room', hi: 'बैठक' },
  { key: 'exterior', en: 'Exterior', hi: 'बाहरी' },
  { key: 'other', en: 'Other', hi: 'अन्य' },
]

export const URGENCY_PRESETS: { key: Urgency; en: string; hi: string; status: Status }[] = [
  { key: 'low', en: 'Low', hi: 'कम', status: 'info' },
  { key: 'normal', en: 'Normal', hi: 'सामान्य', status: 'ok' },
  { key: 'urgent', en: 'Urgent', hi: 'अत्यावश्यक', status: 'risk' },
]

interface BuildDetailInput {
  detail: string
  roomKey: string | null
  urgency: Urgency
  hasPhoto: boolean
  lang: 'en' | 'hi'
}

/**
 * Fold the form fields into a single `detail` string (the API only accepts
 * `{title, detail}`). Room + urgency are tagged; a captured photo is noted as a
 * TODO since there is no attachment endpoint yet.
 */
export function buildRequestDetail({
  detail,
  roomKey,
  urgency,
  hasPhoto,
  lang,
}: BuildDetailInput): string | undefined {
  const room = roomKey ? ROOM_PRESETS.find((r) => r.key === roomKey) : null
  const urg = URGENCY_PRESETS.find((u) => u.key === urgency)
  const L = (e: string, h: string) => (lang === 'hi' ? h : e)

  const parts: string[] = []
  const body = detail.trim()
  if (body) parts.push(body)
  if (room) parts.push(`${L('Room', 'कमरा')}: ${lang === 'hi' ? room.hi : room.en}`)
  if (urg) parts.push(`${L('Urgency', 'अत्यावश्यकता')}: ${lang === 'hi' ? urg.hi : urg.en}`)
  // TODO: real photo attachment once an upload endpoint exists.
  if (hasPhoto) parts.push(L('[Photo attached]', '[फ़ोटो संलग्न]'))

  const joined = parts.join('\n')
  return joined.length ? joined : undefined
}

/** A short, locale-aware date like "30 May" / readable timestamp. */
export function formatDate(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
    }).format(d)
  } catch {
    return d.toDateString()
  }
}

/** A decision is resolved (and should drop out of the list) once acted on. */
export function isDecisionResolved(state: string): boolean {
  return state !== 'pending'
}
