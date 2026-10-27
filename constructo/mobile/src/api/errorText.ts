/**
 * Plain-language text for a failed request, in the user's language. Screens and
 * the app-wide mutation fallback show this instead of a raw server message.
 */
import { ApiError, TimeoutError } from './client'

type Lang = 'en' | 'hi'

export type ErrorKind =
  | 'offline'
  | 'session'
  | 'owner_only'
  | 'forbidden'
  | 'too_large'
  | 'rate_limited'
  | 'server'
  | 'generic'

const TEXT: Record<Lang, Record<ErrorKind, string>> = {
  en: {
    offline: "Couldn't reach the server. Check your connection and try again.",
    session: 'Your login has ended. Please sign in again.',
    owner_only: 'Only the owner can decide this.',
    forbidden: "You don't have permission to do this.",
    too_large: 'This file is too large to send.',
    rate_limited: 'Too many tries. Please wait a minute and try again.',
    server: 'Something went wrong on our side. Please try again in a moment.',
    generic: "That didn't go through. Please try again.",
  },
  hi: {
    offline: 'सर्वर तक नहीं पहुँच पाए। नेटवर्क जाँचें और फिर कोशिश करें।',
    session: 'आपका लॉगिन खत्म हो गया। फिर से साइन इन करें।',
    owner_only: 'यह फ़ैसला सिर्फ़ मालिक ले सकते हैं।',
    forbidden: 'आपको यह करने की अनुमति नहीं है।',
    too_large: 'यह फ़ाइल भेजने के लिए बहुत बड़ी है।',
    rate_limited: 'बहुत ज़्यादा कोशिशें। एक मिनट रुककर फिर कोशिश करें।',
    server: 'हमारी तरफ़ से कुछ गड़बड़ हुई। थोड़ी देर में फिर कोशिश करें।',
    generic: 'यह नहीं हो पाया। फिर कोशिश करें।',
  },
}

export function errorKind(err: unknown): ErrorKind {
  if (err instanceof ApiError) {
    if (err.code === 'owner_only') return 'owner_only'
    if (err.status === 401) return 'session'
    if (err.status === 429 || err.code === 'rate_limited') return 'rate_limited'
    if (err.status === 413 || err.code === 'media_too_large') return 'too_large'
    if (err.status === 403 || err.code === 'forbidden') return 'forbidden'
    if (err.status === 408) return 'offline'
    if (err.status >= 500) return 'server'
    return 'generic'
  }
  // A deadline, or fetch's own network failure ("Network request failed").
  if (err instanceof TimeoutError || err instanceof TypeError) return 'offline'
  return 'generic'
}

export function errorText(err: unknown, lang: Lang): string {
  return TEXT[lang][errorKind(err)]
}

/** The plain text for one kind (e.g. the owner-only note on a screen). */
export function errorKindText(kind: ErrorKind, lang: Lang): string {
  return TEXT[lang][kind]
}

/** True when the server refused a money decision for a non-owner. */
export function isOwnerOnly(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'owner_only'
}
