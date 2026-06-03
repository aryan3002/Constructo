/**
 * Local helpers for the Design Intake flow (app/intake.tsx).
 * Owned by the intake flow only — not a shared module.
 */
import type { ImageSourcePropType } from 'react-native'

import type { DesignProfile } from '../src/api/types'

export type Lang = 'en' | 'hi'

/** A preset visual-style option shown in the step-1 preference grid. */
export interface StyleOption {
  key: string
  label: Record<Lang, string>
  /**
   * A REAL interior photo for the preference tile (handoff §5/§8: real photos,
   * never emoji, never AI/3D renders). BUNDLED in-app (assets/styles/) so the
   * grid renders instantly and offline with no third-party CDN dependency.
   * Source: Unsplash (Unsplash License — free for commercial use). Swap the
   * files in assets/styles/ to recurate without touching code.
   */
  image: ImageSourcePropType
}

/**
 * ~8 preset style options. `choice` posted to the backend is the stable `key`.
 * Photos are warm, real interiors that read the style at a glance, bundled as
 * 480×480 assets.
 */
export const STYLE_OPTIONS: StyleOption[] = [
  {
    key: 'minimal',
    label: { en: 'Minimal & calm', hi: 'सरल और शांत' },
    image: require('../assets/styles/minimal.jpg'),
  },
  {
    key: 'modern',
    label: { en: 'Modern', hi: 'आधुनिक' },
    image: require('../assets/styles/modern.jpg'),
  },
  {
    key: 'traditional',
    label: { en: 'Traditional', hi: 'पारंपरिक' },
    image: require('../assets/styles/traditional.jpg'),
  },
  {
    key: 'warm-wood',
    label: { en: 'Warm wood', hi: 'गर्म लकड़ी' },
    image: require('../assets/styles/warm-wood.jpg'),
  },
  {
    key: 'luxe',
    label: { en: 'Luxe', hi: 'भव्य' },
    image: require('../assets/styles/luxe.jpg'),
  },
  {
    key: 'indoor-plants',
    label: { en: 'Indoor plants', hi: 'इनडोर पौधे' },
    image: require('../assets/styles/indoor-plants.jpg'),
  },
  {
    key: 'earthy',
    label: { en: 'Earthy tones', hi: 'मिट्टी के रंग' },
    image: require('../assets/styles/earthy.jpg'),
  },
  {
    key: 'bright',
    label: { en: 'Bright & airy', hi: 'उज्ज्वल और हवादार' },
    image: require('../assets/styles/bright.jpg'),
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
