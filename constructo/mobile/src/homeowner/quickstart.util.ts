/**
 * "Rate 10 designer picks" quick-start deck — pure helpers for
 * design/profiler/quickstart.tsx.
 *
 * `pickQuickstartPresets` selects up to `n` presets from a curated preset
 * catalog, round-robin across packs so a single large pack can't dominate
 * the deck. Deterministic: packs are sorted alphabetically (stable across
 * app restarts/re-fetches — no randomness), and each pack's own catalog
 * order is preserved within its turn. Fewer than `n` available → returns
 * everything, still interleaved the same way.
 */
import type { DesignPreset } from '../api/client'

export function pickQuickstartPresets(presets: DesignPreset[], n = 10): DesignPreset[] {
  if (presets.length === 0) return []

  // Group by pack, preserving each pack's original (catalog) item order.
  const byPack = new Map<string, DesignPreset[]>()
  for (const p of presets) {
    const bucket = byPack.get(p.pack)
    if (bucket) bucket.push(p)
    else byPack.set(p.pack, [p])
  }

  // Alphabetical pack order — deterministic regardless of input ordering.
  const packNames = Array.from(byPack.keys()).sort((a, b) => a.localeCompare(b))
  const cursors = new Map<string, number>(packNames.map((name) => [name, 0]))

  const result: DesignPreset[] = []
  let anyLeft = true
  while (result.length < n && anyLeft) {
    anyLeft = false
    for (const name of packNames) {
      if (result.length >= n) break
      const bucket = byPack.get(name)!
      const idx = cursors.get(name)!
      if (idx < bucket.length) {
        result.push(bucket[idx])
        cursors.set(name, idx + 1)
        anyLeft = true
      }
    }
  }
  return result
}

export const QUICKSTART_STR = {
  en: {
    entryTitle: 'Not sure where to start?',
    entryBody: 'Rate 10 designer picks — 1 minute',
    entryCta: 'Start quick rating',
    progress: (i: number, n: number) => `${i} of ${n}`,
    skip: 'Skip',
    finishedTitle: (n: number) => `${n} rated — your taste is taking shape`,
    finishedBody: 'Check AI Notes to see what we’re reading from your picks.',
    seeArea: 'See my area',
    starHint: 'How much do you like this?',
    // Same copy as [area].tsx's non-contributor notice — rating requires membership.
    readOnlyNotice: 'Only members of this home can rank references.',
  },
  hi: {
    entryTitle: 'कहाँ से शुरू करें, तय नहीं?',
    entryBody: '10 डिज़ाइनर पसंद रेट करें — 1 मिनट',
    entryCta: 'जल्दी रेटिंग शुरू करें',
    progress: (i: number, n: number) => `${i} / ${n}`,
    skip: 'छोड़ें',
    finishedTitle: (n: number) => `${n} रेट किए — आपकी पसंद उभर रही है`,
    finishedBody: 'आपकी पसंद से हम क्या समझ रहे हैं, यह देखने के लिए AI नोट्स देखें।',
    seeArea: 'मेरा क्षेत्र देखें',
    starHint: 'यह आपको कितना पसंद है?',
    readOnlyNotice: 'सिर्फ़ इस घर के सदस्य ही रेटिंग दे सकते हैं।',
  },
} as const

export type QuickstartLang = keyof typeof QUICKSTART_STR
