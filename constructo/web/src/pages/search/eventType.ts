// Maps a backend SiteEventType to a Status (color + icon language) and an i18n
// label key. Kept in the search feature's own scope. Labels are NOT hardcoded
// here — they resolve to existing i18n keys at render time.

import type { Status } from '../../ui'
import type { SiteEventType } from '../../api/types'
import type { TranslationKey } from '../../i18n'

export const EVENT_TYPE_STATUS: Record<SiteEventType, Status> = {
  attendance: 'info',
  material_delivery: 'ok',
  progress_update: 'ok',
  issue: 'risk',
  invoice_received: 'info',
  drawing_shared: 'info',
  approval: 'ok',
  payment_request: 'warn',
  unknown: 'info',
}

// Reuse the existing nav/common namespace where a label already exists; fall
// back to a humanised version of the raw type for any unmapped value.
const TYPE_LABEL_KEY: Partial<Record<SiteEventType, TranslationKey>> = {
  // No dedicated event-type i18n keys exist in the shared bundle yet, so the
  // page humanises the raw type string. This map is here as the extension point
  // if/when those keys land — intentionally empty to avoid inventing keys.
}

export function eventTypeStatus(type: SiteEventType): Status {
  return EVENT_TYPE_STATUS[type] ?? 'info'
}

/** A human label for an event type. Humanises the raw enum (e.g.
 *  "material_delivery" -> "Material delivery") — script-neutral, so it reads
 *  acceptably under both locales until dedicated keys exist. */
export function eventTypeLabel(type: SiteEventType): string {
  void TYPE_LABEL_KEY
  const words = type.split('_')
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}
