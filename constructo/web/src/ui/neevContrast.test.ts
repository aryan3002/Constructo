import { describe, it, expect } from 'vitest'
// Read the real token values so this test fails if a future edit breaks AA.
import css from './theme.css?raw'

function lin(c: number) {
  c /= 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function lum(hex: string) {
  const h = hex.replace('#', '')
  return (
    0.2126 * lin(parseInt(h.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(h.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(h.slice(4, 6), 16))
  )
}
function ratio(a: string, b: string) {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Parse the `#rrggbb` custom properties out of one `[data-theme=…]` block. */
function block(theme: string): Record<string, string> {
  const m = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`no [data-theme='${theme}'] block found`)
  const out: Record<string, string> = {}
  // Capture EVERY `--name: #hex` in the block — several share one line.
  for (const mm of m[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[mm[1]] = mm[2]
  }
  return out
}

const neev = block('neev')
const dark = block('neev-dark')

// [foreground token, background token, min ratio]. Normal text = 4.5 (WCAG AA).
const PAIRS: Array<[string, string, number]> = [
  ['--text-primary', '--surface', 4.5],
  ['--text-secondary', '--surface-card', 4.5],
  ['--text-muted', '--surface-card', 4.5],
  ['--text-muted', '--surface', 4.5],
  ['--brand-text', '--surface-card', 4.5],
  ['--celebrate-text', '--surface', 4.5],
  ['--text-on-brand', '--brand', 4.5],
  ['--ok-fg', '--ok-bg', 4.5],
  ['--warn-fg', '--warn-bg', 4.5],
  ['--risk-fg', '--risk-bg', 4.5],
  ['--info-fg', '--surface', 4.5],
]

describe('neev light — WCAG AA text contrast', () => {
  it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(neev[fg]).toBeTruthy()
    expect(neev[bg]).toBeTruthy()
    expect(ratio(neev[fg], neev[bg])).toBeGreaterThanOrEqual(min)
  })
})

describe('neev-dark — WCAG AA text contrast', () => {
  it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(dark[fg]).toBeTruthy()
    expect(dark[bg]).toBeTruthy()
    expect(ratio(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min)
  })
})
