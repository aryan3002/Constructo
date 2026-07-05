/** Splits a profile's clarification Q&A into the two lists the designer's
 *  "Homeowner Q&A" section renders: answers already in (to fold into the next
 *  brief) and questions still waiting on the homeowner. Both newest-first —
 *  the most recently asked/answered row is the one the designer cares about. */
import type { ProfilerClarification } from '../api/client'

export interface SplitClarifications {
  answered: ProfilerClarification[]
  waiting: ProfilerClarification[]
}

const byNewest = (a: ProfilerClarification, b: ProfilerClarification) =>
  new Date(b.asked_at).getTime() - new Date(a.asked_at).getTime()

export function splitClarifications(rows: ProfilerClarification[]): SplitClarifications {
  const answered = rows.filter((r) => r.answer != null).sort(byNewest)
  const waiting = rows.filter((r) => r.answer == null).sort(byNewest)
  return { answered, waiting }
}
