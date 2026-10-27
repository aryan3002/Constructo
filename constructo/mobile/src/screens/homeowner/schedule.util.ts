// One schedule rule for every "On track" on the homeowner screens (T5): Home's
// hero chip and milestones pill, and the Updates header and current-stage
// pills all read from here, so they can never contradict each other.
//
// Dates are compared as LOCAL calendar days (the phone's date). Backend dates
// are bare `YYYY-MM-DD`; never run them through toISOString(), which is UTC
// and is a day off for most of the evening in India.
import type { Milestone } from '../../api/types'

export type ScheduleStatus = 'handed_over' | 'past_handover' | 'late' | 'on_track'
export type MilestoneSchedule = 'late' | 'on_track'

/** The phone's calendar date as `YYYY-MM-DD`. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** A backend date (`YYYY-MM-DD`, or a full timestamp) as a local day key. */
function dayKey(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : localDateKey(d)
}

/** The one target handover date Home and Updates both show and judge by: the
 *  property's expected handover, else the last stage's expected date. Using
 *  different dates for the label and the pill could print "Target handover ·
 *  15 Dec" next to "Past handover date". */
export function targetHandoverOn(
  propertyHandover: string | null | undefined,
  milestones: Pick<Milestone, 'expected_on' | 'order'>[],
): string | null {
  if (propertyHandover) return propertyHandover
  const last = [...milestones].sort((a, b) => a.order - b.order).pop()
  return last?.expected_on ?? null
}

/** Late when the stage's expected date has passed; on track when it hasn't
 *  (expected today still counts as on track); null when it has no date. */
export function milestoneSchedule(
  m: Pick<Milestone, 'expected_on'>,
  today: Date = new Date(),
): MilestoneSchedule | null {
  const e = dayKey(m.expected_on)
  if (!e) return null
  return e < localDateKey(today) ? 'late' : 'on_track'
}

/** The build's schedule status, or null when there's no date to judge by
 *  (then no pill is shown at all). */
export function scheduleStatus({
  milestones,
  expectedHandoverOn,
  today = new Date(),
}: {
  milestones: Pick<Milestone, 'status' | 'expected_on' | 'order'>[]
  expectedHandoverOn: string | null | undefined
  today?: Date
}): ScheduleStatus | null {
  if (milestones.length > 0 && milestones.every((m) => m.status === 'done')) {
    return 'handed_over'
  }
  const t = localDateKey(today)
  const handover = dayKey(expectedHandoverOn)
  if (handover && t > handover) return 'past_handover'
  const current = [...milestones].sort((a, b) => a.order - b.order).find((m) => m.status === 'now')
  const currentStatus = current ? milestoneSchedule(current, today) : null
  if (currentStatus === 'late') return 'late'
  if (currentStatus || handover) return 'on_track'
  return null
}

export const SCHEDULE_META: Record<
  ScheduleStatus,
  { tone: 'ok' | 'warn'; en: string; hi: string }
> = {
  on_track: { tone: 'ok', en: 'On track', hi: 'समय पर' },
  late: { tone: 'warn', en: 'Running late', hi: 'देरी चल रही है' },
  past_handover: { tone: 'warn', en: 'Past handover date', hi: 'सौंपने की तारीख़ निकल गई' },
  handed_over: { tone: 'ok', en: 'Handed over', hi: 'सौंप दिया गया' },
}

/** Pill props for a status, in the given language. */
export function schedulePill(
  s: ScheduleStatus | MilestoneSchedule,
  lang: 'en' | 'hi',
): { status: 'ok' | 'warn'; label: string } {
  const meta = SCHEDULE_META[s]
  return { status: meta.tone, label: meta[lang] }
}
