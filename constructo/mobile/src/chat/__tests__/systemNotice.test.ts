/** systemNotice: derive a centered notice line (or null) from a message. */
import { systemNotice } from '../systemNotice'
import type { ChatMessage } from '../../api/chat'

const base = { id: 'm1', seq: 1, conversation_id: 'c', sender_id: 'u', sender_side: 'contractor', media_type: 'text', created_at: '', body: null } as unknown as ChatMessage

test('a blocked-contested message yields the freeze notice', () => {
  const m = { ...base, meta: { blocked: { reason: 'contested' } } } as ChatMessage
  expect(systemNotice(m)).toMatch(/disputed/i)
})

test('a sender_kind=system message shows its body as the notice', () => {
  const m = { ...base, sender_kind: 'system', body: 'Asha was added to the group' } as ChatMessage
  expect(systemNotice(m)).toBe('Asha was added to the group')
})

test('an ordinary user message has no notice', () => {
  expect(systemNotice(base)).toBeNull()
})
