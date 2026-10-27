// One schedule rule for every "On track" (T5). Lives under src/ (never app/).
import {
  localDateKey,
  milestoneSchedule,
  schedulePill,
  scheduleStatus,
} from '../screens/homeowner/schedule.util'

type M = { status: 'done' | 'now' | 'upcoming'; expected_on: string | null; order: number }

// Local noon on 27 Oct 2026 — the phone's date, whatever the runner's TZ.
const today = new Date(2026, 9, 27, 12, 0, 0)

const ms = (nowExpected: string | null): M[] => [
  { status: 'done', expected_on: '2026-05-01', order: 1 },
  { status: 'now', expected_on: nowExpected, order: 2 },
  { status: 'upcoming', expected_on: '2026-12-01', order: 3 },
]

describe('scheduleStatus', () => {
  it('is handed over when every milestone is done (even past the handover date)', () => {
    const all: M[] = ms('2026-06-01').map((m) => ({ ...m, status: 'done' }))
    expect(scheduleStatus({ milestones: all, expectedHandoverOn: '2026-09-15', today })).toBe(
      'handed_over',
    )
  })

  it('is past handover once today is after the handover date', () => {
    expect(
      scheduleStatus({ milestones: ms('2026-12-01'), expectedHandoverOn: '2026-09-15', today }),
    ).toBe('past_handover')
  })

  it('is late when the current stage was expected before today', () => {
    expect(
      scheduleStatus({ milestones: ms('2026-10-26'), expectedHandoverOn: '2027-03-01', today }),
    ).toBe('late')
  })

  it('counts a stage expected today as on track (boundary day)', () => {
    expect(
      scheduleStatus({ milestones: ms('2026-10-27'), expectedHandoverOn: '2027-03-01', today }),
    ).toBe('on_track')
  })

  it('counts handover today as not yet past', () => {
    expect(
      scheduleStatus({ milestones: ms('2026-10-27'), expectedHandoverOn: '2026-10-27', today }),
    ).toBe('on_track')
  })

  it('is on track with only a handover date to judge by', () => {
    expect(
      scheduleStatus({ milestones: ms(null), expectedHandoverOn: '2027-03-01', today }),
    ).toBe('on_track')
    expect(scheduleStatus({ milestones: [], expectedHandoverOn: '2027-03-01', today })).toBe(
      'on_track',
    )
  })

  it('is on track with only the current stage date to judge by', () => {
    expect(scheduleStatus({ milestones: ms('2026-11-10'), expectedHandoverOn: null, today })).toBe(
      'on_track',
    )
  })

  it('is null when there is no date to judge by', () => {
    expect(scheduleStatus({ milestones: ms(null), expectedHandoverOn: null, today })).toBeNull()
    expect(scheduleStatus({ milestones: [], expectedHandoverOn: null, today })).toBeNull()
  })

  it('compares local calendar days, not UTC (00:30 local is still the same day)', () => {
    // 00:30 on 28 Oct local — in IST toISOString() would still say 27 Oct.
    const justAfterMidnight = new Date(2026, 9, 28, 0, 30, 0)
    expect(localDateKey(justAfterMidnight)).toBe('2026-10-28')
    expect(
      scheduleStatus({
        milestones: ms('2026-10-27'),
        expectedHandoverOn: '2027-03-01',
        today: justAfterMidnight,
      }),
    ).toBe('late')
  })
})

describe('milestoneSchedule', () => {
  it('is late once the stage date has passed', () => {
    expect(milestoneSchedule({ expected_on: '2026-10-26' }, today)).toBe('late')
  })
  it('is on track on and before the stage date', () => {
    expect(milestoneSchedule({ expected_on: '2026-10-27' }, today)).toBe('on_track')
    expect(milestoneSchedule({ expected_on: '2026-11-27' }, today)).toBe('on_track')
  })
  it('is null without a date', () => {
    expect(milestoneSchedule({ expected_on: null }, today)).toBeNull()
  })
})

describe('schedulePill', () => {
  it('labels and tones every status in both languages', () => {
    expect(schedulePill('on_track', 'en')).toEqual({ status: 'ok', label: 'On track' })
    expect(schedulePill('late', 'en')).toEqual({ status: 'warn', label: 'Running late' })
    expect(schedulePill('past_handover', 'en')).toEqual({
      status: 'warn',
      label: 'Past handover date',
    })
    expect(schedulePill('handed_over', 'en')).toEqual({ status: 'ok', label: 'Handed over' })
    expect(schedulePill('late', 'hi').label).toBe('देरी चल रही है')
    expect(schedulePill('past_handover', 'hi').label).toBe('सौंपने की तारीख़ निकल गई')
  })
})
