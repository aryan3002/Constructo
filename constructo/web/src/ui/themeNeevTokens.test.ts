import { describe, it, expect } from 'vitest'
// Vite ?raw import → the file's text as a string (typed via vite/client).
import css from './theme.css?raw'

describe('Neev token blocks exist', () => {
  it('defines a light neev block with sand canvas + sage brand', () => {
    expect(css).toMatch(/\[data-theme='neev'\]/)
    expect(css).toContain('#FCFAF3') // sand-50 canvas
    expect(css).toContain('#3E7D58') // sage brand
  })
  it('defines a warm neev-dark block', () => {
    expect(css).toMatch(/\[data-theme='neev-dark'\]/)
  })
  it('overrides the display font to Eczar on neev', () => {
    expect(css).toContain("--font-display: 'Eczar'")
  })
})
