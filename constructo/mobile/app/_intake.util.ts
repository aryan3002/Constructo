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
  /**
   * A REAL interior photo for the preference tile (handoff §5/§8: real photos,
   * never emoji, never AI/3D renders).
   *
   * STOPGAP: these are royalty-free Unsplash photos referenced by direct URL
   * while we have no licensed/bundled asset set.
   * TODO: replace with licensed/bundled interior photos (ship the assets in-app,
   * don't depend on a third-party CDN at runtime).
   */
  imageUrl: string
}

/**
 * ~8 preset style options. `choice` posted to the backend is the stable `key`.
 * Photos are warm, real interiors that read the style at a glance. The `w=480`
 * + crop params keep payloads small for the 2-up grid tiles.
 */
export const STYLE_OPTIONS: StyleOption[] = [
  {
    key: 'minimal',
    label: { en: 'Minimal & calm', hi: 'सरल और शांत' },
    imageUrl:
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'modern',
    label: { en: 'Modern', hi: 'आधुनिक' },
    imageUrl:
      'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'traditional',
    label: { en: 'Traditional', hi: 'पारंपरिक' },
    imageUrl:
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'warm-wood',
    label: { en: 'Warm wood', hi: 'गर्म लकड़ी' },
    imageUrl:
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'luxe',
    label: { en: 'Luxe', hi: 'भव्य' },
    imageUrl:
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'indoor-plants',
    label: { en: 'Indoor plants', hi: 'इनडोर पौधे' },
    imageUrl:
      'https://images.unsplash.com/photo-1545241047-6083a3684587?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'earthy',
    label: { en: 'Earthy tones', hi: 'मिट्टी के रंग' },
    imageUrl:
      'https://images.unsplash.com/photo-1522444195799-478538b28823?w=480&h=480&fit=crop&q=70',
  },
  {
    key: 'bright',
    label: { en: 'Bright & airy', hi: 'उज्ज्वल और हवादार' },
    imageUrl:
      'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=480&h=480&fit=crop&q=70',
  },
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
