/**
 * Vendor Confirm-Loop (Phase 3.8) — the crew side: generate a no-install confirm
 * link for a delivery/invoice so the vendor can confirm or dispute the quantity.
 * The token is the capability; the public page lives at WEB_BASE + confirm_path.
 */
import { request } from './client'

export type VendorConfirmStatus = 'pending' | 'confirmed' | 'disputed'

export interface VendorConfirmation {
  id: string
  site_id: string
  token: string
  vendor_name: string
  material: string | null
  claimed_qty: number | null
  claimed_unit: string | null
  status: VendorConfirmStatus
  response_qty: number | null
  response_note: string | null
  verified: boolean
  confirm_path: string
}

export const vendorConfirmApi = {
  /** Create a confirm link for a vendor delivery (crew, site-scoped). */
  create(body: {
    site_id: string
    vendor_name: string
    event_id?: string
    material?: string
    claimed_qty?: number
    claimed_unit?: string
    delivered_on?: string
  }) {
    return request<VendorConfirmation>('/api/v1/vendor-confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** A site's confirmations (newest first). */
  list(siteId: string) {
    return request<VendorConfirmation[]>(
      `/api/v1/vendor-confirm?site_id=${encodeURIComponent(siteId)}`,
    )
  },
}
