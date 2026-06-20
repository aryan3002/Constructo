import { describe, it, expect } from 'vitest'
// Vite ?raw import → the file's text as a string (typed via vite/client), so
// this test stays type-checked by tsc and needs no Node globals.
import fontsCss from './fonts.css?raw'

describe('Neev fonts are loaded', () => {
  it('imports Eczar (serif display) weights', () => {
    expect(fontsCss).toContain('@fontsource/eczar')
  })
  it('imports IBM Plex Mono (numerals) weights', () => {
    expect(fontsCss).toContain('@fontsource/ibm-plex-mono')
  })
})
