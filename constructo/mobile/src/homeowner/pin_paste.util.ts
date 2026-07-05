/**
 * Pinterest paste-and-done — pure helpers for the "Paste from Pinterest"
 * button and multi-link paste on the Design Profiler's pin sheet
 * (design/profiler/[area].tsx).
 *
 * `extractPinterestUrls` mirrors the backend's host rule exactly
 * (`app/profiler/pinterest.py::is_pinterest_url` — hosts matching
 * `pinterest.*` or `pin.it`) so a blob of clipboard text or a multi-line
 * paste only ever yields links the server will actually accept. Kept
 * network-free and React-free so it's trivially unit-testable.
 */

// Mirrors the backend's _PIN_HOST_RE exactly: host must END WITH
// "pinterest.<tld...>" or "pin.it" (subdomain-aware, substring-safe — a host
// like "notpinterest.com" or "pinterest.evil.com" does NOT match).
const PIN_HOST_RE = /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i

function isPinterestUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return PIN_HOST_RE.test(host)
  } catch {
    return false
  }
}

const MAX_URLS = 10

/**
 * Pull every Pinterest/pin.it URL out of a free-text blob (clipboard paste,
 * multi-line TextInput content, comma-separated list — any mix). Splits on
 * whitespace and commas, drops anything that isn't a parsable pinterest/pin.it
 * URL, dedupes preserving first-seen order, and caps at 10 so one paste can't
 * fire an unbounded run of sequential adds.
 */
export function extractPinterestUrls(text: string): string[] {
  const tokens = text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    if (!isPinterestUrl(token)) continue
    if (seen.has(token)) continue
    seen.add(token)
    result.push(token)
    if (result.length >= MAX_URLS) break
  }
  return result
}

export const PIN_PASTE_STR = {
  en: {
    pasteButton: 'Paste from Pinterest',
    noPinsToast: 'Copy a pin link in Pinterest first, then tap again.',
    resultLine: (ok: number, fails: number) =>
      `${ok} added${fails ? `, ${fails} couldn't be read` : ''}`,
    done: 'Done',
  },
  hi: {
    pasteButton: 'Pinterest से पेस्ट करें',
    noPinsToast: 'पहले Pinterest में पिन लिंक कॉपी करें, फिर दोबारा टैप करें।',
    resultLine: (ok: number, fails: number) =>
      `${ok} जोड़े गए${fails ? `, ${fails} नहीं जोड़े जा सके` : ''}`,
    done: 'हो गया',
  },
} as const

export type PinPasteLang = keyof typeof PIN_PASTE_STR
