/**
 * A money decision assigned to a supervisor shows "Only the owner can decide
 * this." instead of a reply that the server would refuse (T8).
 */
import { ApiError } from '../../api/client'
import { errorText } from '../../api/errorText'
import { ownerOnlyNote } from './asks.util'

describe('ownerOnlyNote', () => {
  it('blocks replies to money kinds', () => {
    expect(ownerOnlyNote({ kind: 'approval' }, 'en')).toBe('Only the owner can decide this.')
    expect(ownerOnlyNote({ kind: 'hold_payment' }, 'hi')).toBe('यह फ़ैसला सिर्फ़ मालिक ले सकते हैं।')
  })

  it('lets the supervisor answer everything else', () => {
    expect(ownerOnlyNote({ kind: 'generic' }, 'en')).toBeNull()
    expect(ownerOnlyNote({ kind: 'homeowner_question' }, 'en')).toBeNull()
  })

  it('uses the same words as an owner_only refusal', () => {
    const refusal = errorText(new ApiError(403, 'Only the owner can approve money', 'owner_only'), 'en')
    expect(ownerOnlyNote({ kind: 'approval' }, 'en')).toBe(refusal)
  })
})
