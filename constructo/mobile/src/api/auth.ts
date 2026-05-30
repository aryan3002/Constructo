/**
 * Auth network calls. Mirrors the web `authApi` surface but stores the JWT in
 * the device keychain (secure-store) rather than localStorage.
 *
 * Two entry points:
 *   - contractor / staff:  phone + OTP  (`/auth/login`)
 *   - homeowner:           join code + phone + OTP (`/homeowner/join`)
 */
import { request } from './client'
import { setToken } from '../store/secure'
import type { HomeownerJoinResponse, Language, Me } from './types'

export const authApi = {
  /** Request a login code (no-op in dev; OTP stays 000000). Powers "resend". */
  requestOtp(phone: string): Promise<{ sent: boolean; dev_otp: string | null }> {
    return request('/api/v1/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
  },

  /** Contractor/staff phone+OTP login. Stores and returns the JWT. */
  async login(phone: string, otp: string): Promise<string> {
    const resp = await request<{ token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    })
    await setToken(resp.token)
    return resp.token
  },

  /** Homeowner join: redeem a join code for a token. Stores the JWT. */
  async joinAsHomeowner(
    joinCode: string,
    phone: string,
    otp: string,
  ): Promise<HomeownerJoinResponse> {
    const resp = await request<HomeownerJoinResponse>('/api/v1/homeowner/join', {
      method: 'POST',
      body: JSON.stringify({ join_code: joinCode, phone, otp }),
    })
    await setToken(resp.token)
    return resp
  },

  me(): Promise<Me> {
    return request('/api/v1/auth/me')
  },

  updateLanguage(language: Language): Promise<Me> {
    return request('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ language }),
    })
  },
}
