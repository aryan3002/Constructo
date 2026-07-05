import { designerActions, stateLabel, stateTone } from './brief_actions.util'

test('architect_review offers sign-off and request-changes(note)', () => {
  const acts = designerActions('architect_review')
  expect(acts.map(a => a.action)).toEqual(['architect_sign_off', 'request_changes'])
  expect(acts[1].needsNote).toBe(true)
})
test('revision_requested offers only regenerate — the dead-end exit', () => {
  expect(designerActions('revision_requested').map(a => a.action)).toEqual(['regenerate'])
})
test('contractor_brief_ready and beyond offer materialize', () => {
  expect(designerActions('contractor_brief_ready').map(a => a.action)).toContain('materialize')
  expect(designerActions('approved').map(a => a.action)).toContain('materialize')
  expect(designerActions('locked').map(a => a.action)).toEqual(['materialize'])
})
test('homeowner_review is read-only for the designer', () => {
  expect(designerActions('homeowner_review')).toEqual([])
})

test('stateTone maps every known brief state to its hub-pill tone', () => {
  expect(stateTone('homeowner_review')).toBe('quiet')
  expect(stateTone('architect_review')).toBe('info')
  expect(stateTone('revision_requested')).toBe('warn')
  expect(stateTone('contractor_brief_ready')).toBe('ok')
  expect(stateTone('approved')).toBe('ok')
  expect(stateTone('locked')).toBe('quiet')
})
test('stateTone falls back to quiet for an unknown/future state', () => {
  expect(stateTone('some_future_state')).toBe('quiet')
})

test('stateLabel humanizes every known brief state', () => {
  expect(stateLabel('homeowner_review')).toBe('With homeowner')
  expect(stateLabel('architect_review')).toBe('For your review')
  expect(stateLabel('revision_requested')).toBe('Changes requested')
  expect(stateLabel('contractor_brief_ready')).toBe('Signed off')
  expect(stateLabel('approved')).toBe('Approved')
  expect(stateLabel('locked')).toBe('Locked')
})
test('stateLabel falls back to the raw state string when unknown', () => {
  expect(stateLabel('some_future_state')).toBe('some_future_state')
})
