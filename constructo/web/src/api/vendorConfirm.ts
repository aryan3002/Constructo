// Public vendor confirm-loop API (Phase 3.8) — NO auth: the token in the URL is
// the capability. Uses raw fetch (not the authed client) so a vendor with no
// session can confirm/dispute a delivery. The server exposes only the quantity
// claim — never prices or other site data.
import { API_BASE } from './config'

export type VendorConfirmStatus = 'pending' | 'confirmed' | 'disputed'

export interface VendorPublicView {
  vendor_name: string
  site_name: string
  material: string | null
  claimed_qty: number | null
  claimed_unit: string | null
  delivered_on: string | null
  status: VendorConfirmStatus
  already_responded: boolean
}

async function pub<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body?.error?.message ?? body?.detail ?? message
    } catch {
      /* non-JSON */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const vendorConfirmApi = {
  view: (token: string) =>
    pub<VendorPublicView>(`/api/v1/vendor-confirm/${encodeURIComponent(token)}`),
  respond: (token: string, body: { confirmed: boolean; qty?: number; note?: string }) =>
    pub<VendorPublicView>(`/api/v1/vendor-confirm/${encodeURIComponent(token)}/respond`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
