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

// ---- Money decisions: confirm before money moves (T8) ----------------------

/** Kinds only the owner may decide (the server's `_OWNER_ONLY_KINDS`). Their
 *  amount and payee live in the title/detail, e.g. "Approve ACC cement invoice
 *  (₹72,000)?". */
export const MONEY_KINDS: readonly string[] = ['approval', 'hold_payment']

export function isMoneyDecision(d: { kind: string }): boolean {
  return MONEY_KINDS.includes(d.kind)
}

export type DecideAction = 'approve' | 'reject'

export interface ConfirmCopy {
  heading: string
  /** The decision's own words (they carry the amount and payee). */
  lines: string[]
  /** What happens when the owner confirms. */
  consequence: string
  undoNote: string
  confirmLabel: string
  cancelLabel: string
}

const CONFIRM_STR = {
  en: {
    approveHeading: 'Approve this?',
    rejectHeading: 'Hold this?',
    site: (s: string) => `Site: ${s}`,
    approvePayment: 'The payment hold is cleared and the team can pay.',
    rejectPayment: 'The payment stays on hold and goes back to the team.',
    approve: 'This approves it and the team is told to go ahead.',
    reject: 'This holds it and sends it back to the team to revise.',
    undoNote: 'You can undo for 5 seconds after confirming.',
    confirmApprove: 'Approve',
    confirmReject: 'Hold',
    cancel: 'Cancel',
    batchHeading: (n: number) => `Approve ${n} item${n === 1 ? '' : 's'}?`,
    batchCount: (n: number, money: number) =>
      `${n} item${n === 1 ? '' : 's'} selected · ${money} involve${money === 1 ? 's' : ''} money.`,
    batchConsequence: 'Each one is approved and the team is told to go ahead.',
    confirmBatch: (n: number) => `Approve ${n}`,
  },
  hi: {
    approveHeading: 'इसे मंज़ूर करें?',
    rejectHeading: 'इसे रोकें?',
    site: (s: string) => `साइट: ${s}`,
    approvePayment: 'पेमेंट की रोक हट जाएगी और टीम भुगतान कर सकेगी।',
    rejectPayment: 'पेमेंट रुका रहेगा और टीम को वापस जाएगा।',
    approve: 'यह मंज़ूर होगा और टीम को आगे बढ़ने को कहा जाएगा।',
    reject: 'यह रुकेगा और टीम को संशोधन के लिए वापस जाएगा।',
    undoNote: 'पक्का करने के बाद 5 सेकंड तक वापस ले सकते हैं।',
    confirmApprove: 'मंज़ूर',
    confirmReject: 'रोकें',
    cancel: 'रद्द करें',
    batchHeading: (n: number) => `${n} मंज़ूर करें?`,
    batchCount: (n: number, money: number) => `${n} चुने गए · ${money} में पैसे का मामला है।`,
    batchConsequence: 'हर एक मंज़ूर होगा और टीम को आगे बढ़ने को कहा जाएगा।',
    confirmBatch: (n: number) => `${n} मंज़ूर करें`,
  },
} as const

/** The confirm for approving or holding one decision, or null when it moves no
 *  money (generic, homeowner_question) and needs no confirm. */
export function decisionConfirm(
  d: { kind: string; title: string; detail: string | null },
  action: DecideAction,
  siteName: string | null,
  lang: Lang,
): ConfirmCopy | null {
  if (!isMoneyDecision(d)) return null
  const t = CONFIRM_STR[lang]
  const payment = d.kind === 'hold_payment'
  const lines = [d.title]
  if (d.detail) lines.push(d.detail)
  if (siteName) lines.push(t.site(siteName))
  return {
    heading: action === 'approve' ? t.approveHeading : t.rejectHeading,
    lines,
    consequence:
      action === 'approve'
        ? payment ? t.approvePayment : t.approve
        : payment ? t.rejectPayment : t.reject,
    undoNote: t.undoNote,
    confirmLabel: action === 'approve' ? t.confirmApprove : t.confirmReject,
    cancelLabel: t.cancel,
  }
}

/** The confirm for "Approve all", or null when none of the selection moves money. */
export function batchConfirm(items: { kind: string }[], lang: Lang): ConfirmCopy | null {
  const money = items.filter(isMoneyDecision).length
  if (money === 0) return null
  const t = CONFIRM_STR[lang]
  return {
    heading: t.batchHeading(items.length),
    lines: [t.batchCount(items.length, money)],
    consequence: t.batchConsequence,
    undoNote: t.undoNote,
    confirmLabel: t.confirmBatch(items.length),
    cancelLabel: t.cancel,
  }
}

// ---- The undo window after confirming (T8) ---------------------------------

export interface UndoCopy {
  /** Shown with the Undo button while the action waits, e.g. "Approved". */
  message: string
  undoLabel: string
  /** Prefixed to the error text when the send fails. */
  failMessage: string
}

/** Toast copy for a held money action; `count` > 1 for Approve all. */
export function undoCopy(action: DecideAction, lang: Lang, count = 1): UndoCopy {
  if (lang === 'hi') {
    return {
      message: action === 'approve' ? (count > 1 ? `${count} मंज़ूर` : 'मंज़ूर') : 'रोका',
      undoLabel: 'वापस लें',
      failMessage: action === 'approve' ? 'मंज़ूर नहीं हुआ।' : 'रोका नहीं गया।',
    }
  }
  return {
    message: action === 'approve' ? (count > 1 ? `${count} approved` : 'Approved') : 'Held',
    undoLabel: 'Undo',
    failMessage: action === 'approve' ? 'Not approved.' : 'Not held.',
  }
}
