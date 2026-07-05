import { describe, expect, it } from 'vitest'
import { actionLabel, designerActions } from './briefActions'

describe('designerActions', () => {
  it('architect_review offers sign-off and request-changes(note)', () => {
    const acts = designerActions('architect_review')
    expect(acts.map((a) => a.action)).toEqual(['architect_sign_off', 'request_changes'])
    expect(acts[1].needsNote).toBe(true)
  })

  it('revision_requested offers only regenerate — the dead-end exit', () => {
    expect(designerActions('revision_requested').map((a) => a.action)).toEqual(['regenerate'])
  })

  it('contractor_brief_ready and beyond offer materialize', () => {
    expect(designerActions('contractor_brief_ready').map((a) => a.action)).toContain('materialize')
    expect(designerActions('approved').map((a) => a.action)).toContain('materialize')
    expect(designerActions('locked').map((a) => a.action)).toEqual(['materialize'])
  })

  it('homeowner_review is read-only for the designer', () => {
    expect(designerActions('homeowner_review')).toEqual([])
  })
})

describe('actionLabel', () => {
  it('maps the 5 known approval actions', () => {
    expect(actionLabel('send_to_architect')).toBe('Brief sent to designer')
    expect(actionLabel('request_changes')).toBe('Changes requested')
    expect(actionLabel('architect_sign_off')).toBe('Designer signed off')
    expect(actionLabel('approve')).toBe('Approved by owner')
    expect(actionLabel('contractor_received')).toBe('Received by contractor')
  })

  it('falls back to the raw action string for unknown actions', () => {
    expect(actionLabel('some_future_action')).toBe('some_future_action')
  })
})
