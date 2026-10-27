/**
 * Pure helpers for the owner's decision screens (Brief + Approvals). Kept out of
 * app/ so they can be unit-tested (files under app/ are routes).
 */
import type { BatchResult } from '../../api/owner'

type Lang = 'en' | 'hi'

/** The toast after "Approve all": how many went through and, when the server
 *  skipped some (already decided, or not yours to decide), how many and why. */
export function batchSummary(res: BatchResult, lang: Lang): string {
  const ok = res.updated.length
  const skipped = res.skipped.length
  if (lang === 'hi') {
    const head = ok === 0 ? 'कोई मंज़ूर नहीं हुआ' : `${ok} मंज़ूर · साइट पर भेजे`
    return skipped === 0
      ? head
      : `${head} · ${skipped} छोड़े गए (अब लंबित नहीं या आपके फ़ैसले के लिए नहीं)`
  }
  const head = ok === 0 ? 'Nothing approved' : `${ok} approved · released to site`
  return skipped === 0
    ? head
    : `${head} · ${skipped} skipped (no longer pending or not yours to decide)`
}
