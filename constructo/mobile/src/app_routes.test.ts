/// <reference types="node" />
// Guards app/ against helper files. expo-router registers every .ts/.tsx under
// app/ as a route, and only skips files without a default export in
// development — so in a release build a helper file becomes a tab or screen
// that renders `undefined` and blanks the app. An underscore prefix does NOT
// make a file private; only `_layout` is special. Helpers live in src/.
// Lives under src/ (NOT app/) — a test under app/ would itself be a route.
import fs from 'fs'
import path from 'path'

const APP_DIR = path.join(__dirname, '..', 'app')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return /\.(ts|tsx|js|jsx)$/.test(e.name) ? [p] : []
  })
}

const files = walk(APP_DIR)
const rel = (p: string) => path.relative(APP_DIR, p)

describe('app/ contains only routes', () => {
  it('finds route files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('has no underscore-prefixed files other than _layout', () => {
    const bad = files.filter((f) => {
      const name = path.basename(f).replace(/\.(ts|tsx|js|jsx)$/, '')
      return name.startsWith('_') && name !== '_layout'
    })
    expect(bad.map(rel)).toEqual([])
  })

  it('gives every file a default export', () => {
    const hasDefault = /export\s+default\b|export\s*\{[^}]*\bdefault\b[^}]*\}/
    const bad = files.filter((f) => !hasDefault.test(fs.readFileSync(f, 'utf8')))
    expect(bad.map(rel)).toEqual([])
  })
})
