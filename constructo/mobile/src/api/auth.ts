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

  /** Homeowner join: redeem a join code for a token. Stores the JWT.
   * `name` (optional) is the homeowner's own name, persisted so Members /
   * Settings show a real name instead of a bare phone. */
  async joinAsHomeowner(
    joinCode: string,
    phone: string,
    otp: string,
    name?: string,
  ): Promise<HomeownerJoinResponse> {
    const resp = await request<HomeownerJoinResponse>('/api/v1/homeowner/join', {
      method: 'POST',
      body: JSON.stringify({
        join_code: joinCode,
        phone,
        otp,
        ...(name && name.trim() ? { name: name.trim() } : {}),
      }),
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

  /**
   * Request a step-up OTP. The backend sends a one-time code to the signed-in
   * user's registered phone. In dev the OTP stays `000000`. Fire-and-forget from
   * the caller's perspective — the returned value is informational only.
   */
  stepUpRequestOtp(): Promise<{ sent: boolean; dev_otp: string | null }> {
    return request('/api/v1/auth/step-up/request-otp', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  /**
   * Verify a step-up OTP. Returns a short-lived `step_up_token` (+ `expires_in`
   * seconds). Pass the token as the `X-Step-Up-Token` header on the subsequent
   * sensitive mutation to satisfy the backend gate.
   */
  stepUpVerify(otp: string): Promise<{ step_up_token: string; expires_in: number }> {
    return request('/api/v1/auth/step-up/verify', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    })
  },
}
