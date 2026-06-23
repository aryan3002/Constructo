/**
 * Smart-suggest — a single live chip that floats up as you type free text,
 * pre-filled, so the 90% fast-flow gets one-tap structure (Capture Rail 1.1,
 * web Phase B). Ported verbatim from the mobile helper
 * (`constructo/mobile/src/capture/suggest.ts`) — deterministic + offline (no
 * model). Accept → book a card; ignore → the text sends as a plain bubble.
 * Proportional gating: only the cheap-to-fix, low-fraud captures — attendance &
 * delivery. Money is never auto-suggested; it goes through an explicit slash-cmd.
 *
 * Polarity guard: "cement khatam / chahiye / order karo" is a NEED, not a
 * delivery — it must never fire a "delivery logged" chip.
 */

export interface CaptureSuggestion {
  capture_type: string
  fields: Record<string, unknown>
  /** Pre-filled chip label, e.g. "Log delivery? cement 50 bori". */
  label: string
}

type Lang = 'en' | 'hi'

// A need/negation kills the suggestion (you don't log what hasn't arrived).
const POLARITY_BLOCK =
  /\b(khatam|khatm|chahiye|chaahiye|mangwa|manga|order|nahi|nahin|kam pad|low|finish(ed)?|need(ed)?|out of|over)\b/i

const MATERIAL =
  /\b(cement|concrete|steel|sariya|sariyaa|saria|rebar|sand|reti|baalu|brick|bricks|eint|int|gitti|aggregate|tile|tiles|paint|putty|pipe|wood|ply)\b/i
const DELIVERY_UNIT = /\b(bori|bag|bags|ton|tons|tonne|truck|trip|nos|piece|pcs|bundle|kg|cft|sqft)\b/i
const LABOR =
  /\b(mistri|mistry|mazdoor|mazdur|majdoor|aadmi|aadmi|labour|labor|labourer|worker|workers|helper|mason|beldar|painter|haazri|hazri|hazri|log aaye|aaye)\b/i

/** First standalone number in the text (handles `50,000`). */
function firstNumber(text: string): number | null {
  const m = text.match(/\d[\d,]*(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[0].toLowerCase() : null
}

const L = {
  en: { delivery: 'Log delivery?', attendance: 'Log attendance?', workers: 'workers' },
  hi: { delivery: 'डिलीवरी दर्ज करें?', attendance: 'हाज़िरी दर्ज करें?', workers: 'मज़दूर' },
} as const

/**
 * Return the single strongest capture suggestion for `text`, or `null`. Order:
 * delivery (material + qty) beats attendance (labor + count), because a material
 * keyword is a stronger structured signal than a bare headcount.
 */
export function suggestCapture(text: string, lang: Lang = 'en'): CaptureSuggestion | null {
  const t = text.trim()
  if (t.length < 3 || POLARITY_BLOCK.test(t)) return null
  const n = firstNumber(t)

  const material = firstMatch(t, MATERIAL)
  if (material && n !== null) {
    const unit = firstMatch(t, DELIVERY_UNIT)
    const fields: Record<string, unknown> = { material, quantity: n }
    if (unit) fields.unit = unit
    const label = `${L[lang].delivery} ${[material, n, unit].filter(Boolean).join(' ')}`
    return { capture_type: 'delivery', fields, label }
  }

  if (LABOR.test(t) && n !== null) {
    return {
      capture_type: 'attendance',
      fields: { headcount: n },
      label: `${L[lang].attendance} ${n} ${L[lang].workers}`,
    }
  }

  return null
}
