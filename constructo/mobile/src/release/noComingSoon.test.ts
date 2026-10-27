/// <reference types="node" />
// Apple 2.1: a store build must not show placeholder content. Fails if a
// "coming soon" string (English or Hindi) appears in any user-facing string —
// string literals, template text and JSX text under app/ and src/. Comments,
// tests and docs are not scanned.
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

import { en } from '../i18n/en'
import { hi } from '../i18n/hi'

const ROOT = path.join(__dirname, '..', '..')

const COMING_SOON = [
  /coming\s+soon/i,
  /जल्द\s*(?:ही\s*)?(?:आ\s*रह|आएग|आएँग|आएंग|आ\s*जाएग)/,
]

// The procurement role's landing page is a launch-roles decision, left as is.
const ALLOWED = new Set<string>([
  en.contractor.comingSoonTitle,
  en.contractor.comingSoonBody,
  hi.contractor.comingSoonTitle,
  hi.contractor.comingSoonBody,
])

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

function userStrings(file: string): string[] {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text)
    else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text))
    } else if (ts.isJsxText(node)) out.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(src)
  return out
}

const FILES = ['app', 'src'].flatMap((d) => walk(path.join(ROOT, d)))

describe('no "coming soon" placeholders in the app', () => {
  it('scans the app source', () => {
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('has none outside the allowed procurement landing', () => {
    const hits = FILES.flatMap((f) =>
      userStrings(f)
        .filter((s) => !ALLOWED.has(s) && COMING_SOON.some((re) => re.test(s)))
        .map((s) => `${path.relative(ROOT, f)}: ${s.trim().slice(0, 80)}`),
    )
    expect(hits).toEqual([])
  })

  it('recognises the English and Hindi wordings', () => {
    for (const s of ['Voice — coming soon', 'आवाज़ — जल्द आ रहा है', 'जल्द आ रही है', 'जल्द आएगा']) {
      expect(COMING_SOON.some((re) => re.test(s))).toBe(true)
    }
  })
})
