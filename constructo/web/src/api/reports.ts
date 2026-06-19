/**
 * Reports API client (W5 Slice 1).
 *
 * Both PDF endpoints are role-gated server-side:
 *   dprPackPdf   → owner | accountant | pm
 *   progressPdf  → owner | accountant
 *
 * PDFs do NOT require a step-up OTP — the regular bearer token is sufficient.
 * The caller fetches the Blob and triggers the browser download.
 */

import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'
import { ApiError } from './client'

// Minimal valid 1-page PDF for offline/mock mode.
const MOCK_PDF = Uint8Array.from(
  atob(
    'JVBERi0xLjEKJcKlwrEKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMjAwXT4+CmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg==',
  ),
  (c) => c.charCodeAt(0),
)

async function getPdf(path: string): Promise<Blob> {
  if (USE_MOCKS) return new Blob([MOCK_PDF], { type: 'application/pdf' })
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.blob()
}

export const reportsApi = {
  /**
   * DPR pack PDF for a single site on a given calendar date.
   * Gate: owner | accountant | pm.
   */
  dprPackPdf: (siteId: string, date: string): Promise<Blob> =>
    getPdf(
      `/api/v1/reports/dpr.pdf?site_id=${encodeURIComponent(siteId)}&date=${encodeURIComponent(date)}`,
    ),

  /**
   * Site-progress PDF covering a date range (siteId=null → all sites).
   * Gate: owner | accountant.
   */
  progressPdf: (siteId: string | null, from: string, to: string): Promise<Blob> =>
    getPdf(
      `/api/v1/reports/progress.pdf?${siteId ? `site_id=${encodeURIComponent(siteId)}&` : ''}date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`,
    ),
}
