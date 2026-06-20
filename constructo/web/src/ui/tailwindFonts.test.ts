import { describe, it, expect } from 'vitest'
// tailwind.config.js is at the web root (two levels up from src/ui).
// @ts-expect-error - JS config file lacks type declarations
import config from '../../tailwind.config.js'

describe('Tailwind fontFamily binds to CSS vars (mode/skin-aware)', () => {
  const ff = (config as unknown as { theme: { extend: { fontFamily: Record<string, string[]> } } })
    .theme.extend.fontFamily
  it('display → --font-display', () => expect(ff.display).toEqual(['var(--font-display)']))
  it('body → --font-body', () => expect(ff.body).toEqual(['var(--font-body)']))
  it('mono → --font-mono', () => expect(ff.mono).toEqual(['var(--font-mono)']))
})
