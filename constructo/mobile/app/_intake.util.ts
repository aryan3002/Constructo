/**
 * Local helpers for the Design Intake flow (app/intake.tsx).
 * Owned by the intake flow only — not a shared module.
 */
import type { DesignProfile } from '../src/api/types'

export type Lang = 'en' | 'hi'

/** A preset visual-style option shown in the step-1 preference grid. */
export interface StyleOption {
  key: string
  label: Record<Lang, string>
  /** A small glyph/emoji used as a calm visual cue on the card. */
  glyph: string
}

/** ~8 preset style options. `choice` posted to the backend is the stable `key`. */
export const STYLE_OPTIONS: StyleOption[] = [
  { key: 'minimal', glyph: '◻️', label: { en: 'Minimal & calm', hi: 'सरल और शांत' } },
  { key: 'modern', glyph: '🪟', label: { en: 'Modern', hi: 'आधुनिक' } },
  { key: 'traditional', glyph: '🏛️', label: { en: 'Traditional', hi: 'पारंपरिक' } },
  { key: 'warm-wood', glyph: '🪵', label: { en: 'Warm wood', hi: 'गर्म लकड़ी' } },
  { key: 'luxe', glyph: '✨', label: { en: 'Luxe', hi: 'भव्य' } },
  { key: 'indoor-plants', glyph: '🪴', label: { en: 'Indoor plants', hi: 'इनडोर पौधे' } },
  { key: 'earthy', glyph: '🌾', label: { en: 'Earthy tones', hi: 'मिट्टी के रंग' } },
  { key: 'bright', glyph: '☀️', label: { en: 'Bright & airy', hi: 'उज्ज्वल और हवादार' } },
]

/**
 * The AI design profile arrives as a free-form `Record<string, unknown>`. Pull
 * the human-readable summary text out of it defensively (the server keys it
 * under `profile`, but tolerate a few shapes).
 */
export function profileText(p: DesignProfile | undefined): string {
  if (!p) return ''
  const obj = p.profile as Record<string, unknown> | undefined
  if (!obj) return ''
  const candidate = obj.profile ?? obj.summary ?? obj.text
  if (typeof candidate === 'string') return candidate
  // Fallback: if the whole thing is a string, or stringify a plain object.
  if (typeof p.profile === 'string') return p.profile as unknown as string
  return ''
}

/** Pull an optional tone string from the AI profile, if present. */
export function profileTone(p: DesignProfile | undefined): string {
  if (!p) return ''
  const obj = p.profile as Record<string, unknown> | undefined
  const tone = obj?.tone
  return typeof tone === 'string' ? tone : ''
}
