// The colour tokens are CSS variables; the Tailwind config wraps them so the
// opacity modifier works. Build the real stylesheet (the app's config and
// sources) and check the classes the status pills and chips use are there.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import type { Config } from 'tailwindcss'
// @ts-expect-error -- the config is plain JS (no declaration file)
import rawConfig from '../../tailwind.config.js'

const config = rawConfig as Config

const root = new URL('../../', import.meta.url).pathname

async function build(): Promise<string> {
  const result = await postcss([
    tailwindcss({
      ...config,
      content: [`${root}index.html`, `${root}src/**/*.{ts,tsx}`],
    }),
  ]).process('@tailwind utilities;', { from: undefined })
  return result.css
}

/** The declarations of one generated class, e.g. rule(css, 'bg-ok/10'). */
function rule(css: string, cls: string): string | null {
  const escaped = cls.replace(/[/.:]/g, (c) => `\\\\${c}`)
  const m = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? m[1] : null
}

describe('built CSS', () => {
  it('generates the opacity variants the pills and chips use', async () => {
    const css = await build()
    const used = ['bg-ok/10', 'bg-warn/10', 'bg-risk/10', 'bg-info/10']
    for (const cls of [...used, 'border-ok/30', 'border-risk/30', 'bg-primary/10', 'ring-primary/40']) {
      const body = rule(css, cls)
      expect(body, cls).not.toBeNull()
      expect(body).toMatch(/color-mix\(in srgb, var\(--[\w-]+\) \d+(\.\d+)?%, transparent\)/)
    }
    expect(rule(css, 'bg-ok/10')).toContain('var(--c-ok) 10%')
  })

  it('keeps a plain var() when there is no modifier', async () => {
    const css = await build()
    expect(rule(css, 'bg-ok')).toContain('var(--c-ok)')
    expect(rule(css, 'bg-ok')).not.toContain('color-mix')
  })

  it('status and action text use the readable deep tones', async () => {
    const css = await build()
    expect(rule(css, 'text-ok')).toContain('var(--ok-fg)')
    expect(rule(css, 'text-risk')).toContain('var(--risk-fg)')
    expect(rule(css, 'text-primary-deep')).toContain('var(--brand-text)')
  })
})
