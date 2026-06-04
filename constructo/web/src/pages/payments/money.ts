// Re-export shim — the ₹ formatters now live in the shared `lib/money.ts`
// (vault 11/01 §5, 04 §13 consolidation). Kept so existing imports + the
// co-located money.test.ts keep resolving; prefer importing from `lib/money`.
export { formatRupees, formatRupeesCompact } from '../../lib/money'
