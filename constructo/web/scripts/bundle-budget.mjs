// Bundle-budget gate (vault 11/04 §8.2, §12 — W0 CI hardening).
// Fails CI if the gzipped entry JS chunk exceeds the budget, so a careless
// dependency can't silently bloat the console's first load.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT_KB = 250
const DIR = 'dist/assets'

let entries
try {
  entries = readdirSync(DIR).filter((f) => /^index-.*\.js$/.test(f))
} catch {
  console.error(`bundle-budget: ${DIR} not found — run \`npm run build\` first.`)
  process.exit(1)
}
if (entries.length === 0) {
  console.error(`bundle-budget: no entry chunk (index-*.js) in ${DIR}.`)
  process.exit(1)
}

let worstKb = 0
let worstFile = ''
for (const f of entries) {
  const kb = gzipSync(readFileSync(join(DIR, f))).length / 1024
  console.log(`  ${f}  ${kb.toFixed(1)} KB gz`)
  if (kb > worstKb) {
    worstKb = kb
    worstFile = f
  }
}

if (worstKb > LIMIT_KB) {
  console.error(
    `bundle-budget: FAIL — ${worstFile} is ${worstKb.toFixed(1)} KB gz > ${LIMIT_KB} KB budget.`,
  )
  process.exit(1)
}
console.log(`bundle-budget: OK — entry ${worstKb.toFixed(1)} KB gz <= ${LIMIT_KB} KB.`)
