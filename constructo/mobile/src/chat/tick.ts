/** Delivery-tick presentation (Task B-T1). Pure mapping so the glyph + the
 * "read" highlight decision are unit-testable without rendering. ✓ = sent,
 * ✓✓ = delivered, ✓✓ in the accent colour = read. The homeowner room is
 * delivered-only, so 'read' never arrives there — no special case needed. */
import type { DeliveryState } from './threadState'

export function tickGlyph(state: DeliveryState | undefined): string {
  if (state === 'sent') return '✓'
  if (state === 'delivered' || state === 'read') return '✓✓'
  return ''
}

export function isReadTick(state: DeliveryState | undefined): boolean {
  return state === 'read'
}
