// Maps the dashboard's resolved proof rows (`DashEvidence`) into the presentational
// `EvidenceItem` shape the EvidenceCard renders. This is what turns a bare
// "Linked evidence · e4d99e9f-…" row into real proof: the event summary
// ("100 bori cement aaya ACC se"), a typed icon, and the date.
//
// Backwards-safe: when the API hasn't resolved a row (older payload, or an event
// that couldn't be looked up) we fall back to the plain event id so nothing
// silently disappears.
import type { DashEvidence } from '../api/dashboard'
import type { SiteEventType } from '../api/types'
import type { EvidenceItem, EvidenceKind } from '../ui/EvidenceCard'
import type { TFunction, TranslationKey } from '../i18n'
import { formatDate } from './format'

/** Pick the proof icon that best fits each event type. */
const EVENT_KIND: Record<SiteEventType, EvidenceKind> = {
  attendance: 'message',
  material_delivery: 'challan',
  progress_update: 'message',
  issue: 'message',
  invoice_received: 'challan',
  drawing_shared: 'challan',
  approval: 'message',
  payment_request: 'challan',
  unknown: 'message',
}

function shortId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 8)}` : `#${id}`
}

function typeLabel(t: TFunction, eventType: string | null): string | undefined {
  if (!eventType) return undefined
  return t(`evidence.type.${eventType}` as TranslationKey)
}

/**
 * Build the proof rows shown under a claim. Prefers resolved `evidence`
 * (summary/type/date); falls back to the raw `ids` only when nothing resolved.
 */
export function toEvidenceItems(
  evidence: DashEvidence[] | undefined,
  ids: string[],
  t: TFunction,
): EvidenceItem[] {
  const resolved = evidence ?? []
  if (resolved.length > 0) {
    return resolved.map((e) => {
      const eventType = (e.event_type as SiteEventType | null) ?? null
      const kind = eventType ? EVENT_KIND[eventType] ?? 'message' : 'message'
      const summary = e.summary?.trim()
      return {
        kind,
        // Human sentence is the headline; when missing, keep a clear label.
        label: summary || t('brief.evidence.linked'),
        // Under the sentence show the event type; if we have no summary at all,
        // surface a short id so the row is still identifiable.
        detail: summary ? typeLabel(t, e.event_type) : shortId(e.id),
        meta: e.occurred_on ? formatDate(e.occurred_on) : undefined,
      }
    })
  }
  return ids.map((id) => ({
    kind: 'message' as const,
    label: t('brief.evidence.linked'),
    detail: shortId(id),
  }))
}
