// Status and action text reads at WCAG AA (4.5:1) on the background it sits
// on, in the default (light) skin and the "neev" skin. Pills are a 10% tint of
// the status colour over a card or the page (`bg-ok/10`); toasts use the
// `-bg` tint. Values are read from theme.css, so a token change re-checks.
import { describe, expect, it } from 'vitest'
import css from './theme.css?raw'

/** The custom properties declared in the block whose selector starts with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`no block ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

type RGB = [number, number, number]
function hex(v: string): RGB {
  const h = v.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}
function mix(fg: RGB, alpha: number, bg: RGB): RGB {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB
}
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SKINS: Record<string, string> = {
  default: "[data-theme='light']",
  neev: "[data-theme='neev']",
}

describe.each(Object.entries(SKINS))('contrast — %s skin', (_name, selector) => {
  const t = tokens(selector)
  const c = (k: string) => hex(t[k])

  it.each(['ok', 'warn', 'risk', 'info'])('%s status text on its pill and toast', (s) => {
    const fg = c(`${s}-fg`)
    for (const surface of ['surface-card', 'surface']) {
      const pill = mix(c(`${s}-solid`), 0.1, c(surface))
      expect(ratio(fg, pill), `${s}-fg on ${s}/10 over ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(ratio(fg, c(`${s}-bg`)), `${s}-fg on ${s}-bg`).toBeGreaterThanOrEqual(4.5)
  })

  it('done text on its tint', () => {
    expect(ratio(c('done-fg'), c('done-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('action text (links, text buttons) and muted text on cards and the page', () => {
    for (const fg of ['brand-text', 'text-muted']) {
      for (const bg of ['surface-card', 'surface']) {
        expect(ratio(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('primary button label on the brand fill', () => {
    expect(ratio(c('text-on-brand'), c('brand'))).toBeGreaterThanOrEqual(4.5)
  })
})
