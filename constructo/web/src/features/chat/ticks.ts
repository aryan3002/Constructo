import type { CursorOut } from '../../api/chat'
export type DeliveryState = 'sent' | 'delivered' | 'read'
/** Cursor-derived tick for an OWN message at `seq`. Excludes the caller's own cursor. */
export function computeDeliveryState(
  seq: number, cursors: CursorOut[], myUserId: string | null,
): DeliveryState {
  const others = cursors.filter((c) => c.user_id !== myUserId)
  if (others.length === 0) return 'sent'
  if (others.every((c) => c.last_read_seq >= seq)) return 'read'
  if (others.every((c) => c.last_delivered_seq >= seq)) return 'delivered'
  return 'sent'
}
