import { describe, it, expect } from 'vitest'
// index.html sits at the web root (two levels up). Vite ?raw → its text.
import html from '../../index.html?raw'

describe('no-FOUC script honours the neev skin hint', () => {
  it('reads the cstk.skin hint', () => {
    expect(html).toContain('cstk.skin')
  })
  it('can pre-apply neev / neev-dark before paint', () => {
    expect(html).toContain('neev-dark')
  })
})
