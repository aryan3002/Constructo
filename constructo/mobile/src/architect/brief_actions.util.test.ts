import { designerActions } from './brief_actions.util'

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
