/**
 * Clarifications — pure helpers for the homeowner "Questions for you" card
 * (DPHub) and its answer flow (area screen's AI Notes tab). No React: keeps
 * the open/answered split + count copy testable and shared between the two
 * screens instead of drifting apart.
 */
import type { ProfilerClarification } from '../api/client'

export type ClarLang = 'en' | 'hi'

/** Open clarifications (answer == null), newest-asked first. Does not mutate input. */
export function openClarifications(rows: ProfilerClarification[]): ProfilerClarification[] {
  return rows
    .filter((r) => r.answer == null)
    .slice()
    .sort((a, b) => new Date(b.asked_at).getTime() - new Date(a.asked_at).getTime())
}

export const CLAR_STR = {
  en: {
    cardEyebrow: 'QUESTIONS FOR YOU',
    answerPlaceholder: 'Type your answer…',
    sendAnswer: 'Send answer',
    answeredToast: 'Answered — this sharpens your brief',
    tabTitle: 'Open questions',
  },
  hi: {
    cardEyebrow: 'आपके लिए सवाल',
    answerPlaceholder: 'अपना जवाब लिखें…',
    sendAnswer: 'जवाब भेजें',
    answeredToast: 'जवाब भेजा गया — इससे आपका ब्रीफ़ और साफ़ होगा',
    tabTitle: 'खुले सवाल',
  },
} as const

/** "2 questions for you" / "आपके लिए 2 सवाल" — singular handled in both languages. */
export function clarCountLabel(n: number, lang: ClarLang = 'en'): string {
  if (lang === 'hi') {
    return `आपके लिए ${n} सवाल`
  }
  return n === 1 ? `${n} question for you` : `${n} questions for you`
}
