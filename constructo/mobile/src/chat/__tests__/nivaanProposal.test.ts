/** nivaanProposal: derive a proposal/answer view (or null) from a message. */
import { nivaanProposal, isNivaanAnswer } from '../nivaanProposal'
import type { ChatMessage } from '../../api/chat'

const base = {
  id: 'm1', seq: 1, conversation_id: 'c', sender_id: null, sender_side: 'contractor',
  media_type: 'text', created_at: '', body: null, events: [],
} as unknown as ChatMessage

test('a committable proposal row yields a confirmable proposal view', () => {
  const m = {
    ...base, sender_kind: 'nivaan',
    meta: { proposal: { tier: 'commit', kind: 'capture', capture_type: 'material_delivery',
      fields: { material: 'cement', quantity: 50, unit: 'bori' }, summary: '50 bori cement — confirm?',
      evidence_event_ids: [], committable: true } },
  } as ChatMessage
  const p = nivaanProposal(m)
  expect(p).not.toBeNull()
  expect(p!.committable).toBe(true)
  expect(p!.captureType).toBe('material_delivery')
  expect(p!.fields.quantity).toBe(50)
})

test('a missing_proof proposal is not committable', () => {
  const m = {
    ...base, sender_kind: 'nivaan',
    meta: { proposal: { tier: 'money', kind: 'missing_proof', capture_type: 'decision',
      fields: {}, summary: 'No bill on file.', evidence_event_ids: [], committable: false } },
  } as ChatMessage
  expect(nivaanProposal(m)!.committable).toBe(false)
})

test('a nivaan answer row is an answer, not a proposal', () => {
  const m = { ...base, sender_kind: 'nivaan', body: '90 bori cement.', meta: { nivaan: { kind: 'answer' } } } as ChatMessage
  expect(nivaanProposal(m)).toBeNull()
  expect(isNivaanAnswer(m)).toBe(true)
})

test('an ordinary user message is neither', () => {
  const m = { ...base, sender_kind: 'user', body: 'hi' } as ChatMessage
  expect(nivaanProposal(m)).toBeNull()
  expect(isNivaanAnswer(m)).toBe(false)
})
