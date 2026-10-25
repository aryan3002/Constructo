// Tests for the chat-push routing decision (app/_layout.tsx). Lives under src/
// (NOT app/) — Expo Router treats every app/ file as a route.
import { chatPushRoute } from './chat_route.util'

describe('chatPushRoute', () => {
  it('opens each role in its own navigator', () => {
    expect(chatPushRoute('owner', 'c1')).toEqual({ pathname: '/(contractor)/owner/chat/[id]', params: { id: 'c1' } })
    expect(chatPushRoute('pm', 'c1')).toEqual({ pathname: '/(contractor)/pm/chat/[id]', params: { id: 'c1' } })
    expect(chatPushRoute('architect', 'c1')).toEqual({
      pathname: '/(contractor)/architect/chat/[id]',
      params: { id: 'c1' },
    })
    expect(chatPushRoute('supervisor', 'c1')).toEqual({ pathname: '/(contractor)/supervisor/chat' })
    expect(chatPushRoute('homeowner', 'c1')).toEqual({
      pathname: '/(homeowner)/messages/[id]',
      params: { id: 'c1', kind: 'homeowner' },
    })
  })

  it('never sends a non-owner into the owner screens', () => {
    for (const role of ['pm', 'architect', 'supervisor', 'accountant', 'labor_contractor', 'procurement', 'homeowner'] as const) {
      expect(chatPushRoute(role, 'c1')?.pathname ?? '').not.toContain('/owner/')
    }
  })

  it('has no thread for roles without a chat screen, or before auth resolves', () => {
    expect(chatPushRoute('accountant', 'c1')).toBeNull()
    expect(chatPushRoute('labor_contractor', 'c1')).toBeNull()
    expect(chatPushRoute(null, 'c1')).toBeNull()
  })
})
