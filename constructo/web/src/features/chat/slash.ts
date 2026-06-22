/**
 * Slash-command parser — deterministic, offline, LLM-free structured capture
 * (Capture Rail 1.1, web Phase B). Ported verbatim from the mobile parser
 * (`constructo/mobile/src/capture/slash.ts`) — pure TS, no framework deps. A
 * power user types `/del cement 50 bori ABC` faster than the sentence it
 * replaces; we parse it 100% client-side and post via the existing
 * `capture_type`/`fields` fast path (confidence 1.0, no model call). The
 * canonical `capture_type` strings here are the aliases the backend's
 * `_CAPTURE_TYPE_ALIASES` already understands.
 *
 * Grammar (forgiving, space-separated):
 *   /att 24                      → attendance, headcount 24
 *   /att 12 mason 8 helper       → attendance, headcount 20, by_trade {mason,helper}
 *   /del cement 50 bori ABC      → delivery,  material/qty/unit/vendor
 *   /pay 45000 ramesh            → payment,   amount/to
 *   /inv 85000 sharma            → invoice,   amount/vendor
 */

export interface ParsedCapture {
  capture_type: string
  fields: Record<string, unknown>
}

export interface SlashError {
  error: 'usage'
  command: string
}

/** The commands we support, for the composer hint + help. */
export const SLASH_COMMANDS = ['att', 'del', 'pay', 'inv'] as const
export type SlashCommand = (typeof SLASH_COMMANDS)[number]

export const SLASH_USAGE: Record<SlashCommand, string> = {
  att: '/att 12 mason 8 helper',
  del: '/del cement 50 bori ABC',
  pay: '/pay 45000 ramesh',
  inv: '/inv 85000 sharma',
}

/** Display metadata for the composer's slash menu (web only — desktop affordance). */
export interface SlashMenuItem {
  cmd: SlashCommand
  label: string
  usage: string
}

export const SLASH_MENU: SlashMenuItem[] = [
  { cmd: 'att', label: 'Log attendance', usage: SLASH_USAGE.att },
  { cmd: 'del', label: 'Log a delivery', usage: SLASH_USAGE.del },
  { cmd: 'pay', label: 'Log a payment', usage: SLASH_USAGE.pay },
  { cmd: 'inv', label: 'Log an invoice', usage: SLASH_USAGE.inv },
]

/** True when the text is a slash-command attempt (leading `/`, non-empty). */
export function isSlash(text: string): boolean {
  return /^\/\S/.test(text.trim())
}

function num(token: string): number | null {
  // Tolerate `50,000` / `45000` / `12.5`. Reject pure non-numerics.
  const cleaned = token.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

/**
 * Parse a slash-command into a structured capture.
 * Returns `null` when it isn't a slash-command, a {@link SlashError} when the
 * command is recognized but malformed, or a {@link ParsedCapture} on success.
 */
export function parseSlash(text: string): ParsedCapture | SlashError | null {
  const trimmed = text.trim()
  if (!isSlash(trimmed)) return null

  const [head, ...rest] = trimmed.slice(1).split(/\s+/)
  const cmd = head.toLowerCase()
  const toks = rest.filter(Boolean)

  switch (cmd) {
    case 'att':
    case 'attendance':
      return parseAttendance(toks)
    case 'del':
    case 'delivery':
      return parseDelivery(toks)
    case 'pay':
    case 'payment':
      return parsePayment(toks)
    case 'inv':
    case 'invoice':
      return parseInvoice(toks)
    default:
      // Not one of ours — let it send as plain text rather than swallow it.
      return null
  }
}

function parseAttendance(toks: string[]): ParsedCapture | SlashError {
  // (count [trade])* — a number binds to the trade word that follows it; a bare
  // number with no trade still counts toward the headcount.
  const byTrade: Record<string, number> = {}
  let headcount = 0
  let pendingCount: number | null = null
  let any = false
  for (const t of toks) {
    const n = num(t)
    if (n !== null) {
      if (pendingCount !== null) headcount += pendingCount // bare number
      pendingCount = n
      any = true
    } else if (pendingCount !== null) {
      const trade = t.toLowerCase()
      byTrade[trade] = (byTrade[trade] ?? 0) + pendingCount
      headcount += pendingCount
      pendingCount = null
    }
  }
  if (pendingCount !== null) headcount += pendingCount // trailing bare number
  if (!any) return { error: 'usage', command: 'att' }
  const fields: Record<string, unknown> = { headcount }
  if (Object.keys(byTrade).length) fields.by_trade = byTrade
  return { capture_type: 'attendance', fields }
}

function parseDelivery(toks: string[]): ParsedCapture | SlashError {
  // <material...> <qty> <unit?> <vendor...>
  const qtyIdx = toks.findIndex((t) => num(t) !== null)
  if (qtyIdx < 1) return { error: 'usage', command: 'del' }
  const material = toks.slice(0, qtyIdx).join(' ')
  const quantity = num(toks[qtyIdx])!
  const unit = toks[qtyIdx + 1]
  const vendor = toks.slice(qtyIdx + 2).join(' ')
  const fields: Record<string, unknown> = { material, quantity }
  if (unit) fields.unit = unit
  if (vendor) fields.vendor = vendor
  return { capture_type: 'delivery', fields }
}

function parsePayment(toks: string[]): ParsedCapture | SlashError {
  const amount = toks.length ? num(toks[0]) : null
  if (amount === null) return { error: 'usage', command: 'pay' }
  const to = toks.slice(1).join(' ')
  const fields: Record<string, unknown> = { amount }
  if (to) fields.to = to
  return { capture_type: 'payment', fields }
}

function parseInvoice(toks: string[]): ParsedCapture | SlashError {
  const amount = toks.length ? num(toks[0]) : null
  if (amount === null) return { error: 'usage', command: 'inv' }
  const vendor = toks.slice(1).join(' ')
  const fields: Record<string, unknown> = { amount }
  if (vendor) fields.vendor = vendor
  return { capture_type: 'invoice', fields }
}
