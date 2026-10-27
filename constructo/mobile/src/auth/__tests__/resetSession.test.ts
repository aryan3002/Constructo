/** T2: signing out forgets the person on this phone — query cache, per-user
 * storage, chat caches + outbox, offline captures, the socket and the push
 * token. An expired login (keepQueued) keeps the unsent work. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
const mockClearToken = jest.fn(async () => undefined)
jest.mock('../../store/secure', () => ({
  getToken: async () => 'jwt-1',
  clearToken: () => mockClearToken(),
}))
const mockUnregister = jest.fn(async (_t: string | null) => undefined)
jest.mock('../../push/register', () => ({
  unregisterDevicePushToken: (t: string | null) => mockUnregister(t),
}))
const mockLogout = jest.fn(async (_t: string) => undefined)
jest.mock('../../api/auth', () => ({
  authApi: { logout: (t: string) => mockLogout(t) },
}))
const mockCloseSocket = jest.fn()
jest.mock('../../chat/useChatThread', () => ({ closeSharedSocket: () => mockCloseSocket() }))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'

import { loadThreadCache, mergeMessages } from '../../chat/cache'
import { enqueueChatSend, listChatOutbox } from '../../chat/outbox'
import { enqueue, list } from '../../offline/outbox'
import type { ChatMessage } from '../../api/chat'
import { resetSession, SESSION_USER_KEY } from '../resetSession'

async function seed(qc: QueryClient) {
  qc.setQueryData(['owner', 'home'], { secret: 1 })
  await AsyncStorage.multiSet([
    ['constructo.onboarded', '1'],
    ['constructo.site_id', 's1'],
    ['constructo.sub_role', 'primary_owner'],
    ['constructo.ask.session.s1', '[]'],
    ['homeowner.photos.pinned.v1', '[]'],
    ['constructo.lang', 'hi'],
    [SESSION_USER_KEY, 'u1'],
  ])
  await mergeMessages('conv-1', [{ id: 'm1', seq: 1 } as ChatMessage])
  await enqueueChatSend({ address: { conversation_id: 'conv-1' }, body: 'hi', clientMsgId: 'c1' })
  await enqueue({ label: 'x', path: '/api/v1/x', method: 'POST' })
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.clearAllMocks()
})

test('sign-out clears everything user-scoped', async () => {
  const qc = new QueryClient()
  await seed(qc)
  await resetSession({ queryClient: qc })

  expect(qc.getQueryData(['owner', 'home'])).toBeUndefined()
  expect(mockClearToken).toHaveBeenCalled()
  expect(mockCloseSocket).toHaveBeenCalled()
  expect(mockUnregister).toHaveBeenCalledWith('jwt-1')
  // The server-side sign-out runs after the push unregister, with the same JWT.
  await new Promise((r) => setTimeout(r, 0))
  expect(mockLogout).toHaveBeenCalledWith('jwt-1')
  expect(mockUnregister.mock.invocationCallOrder[0]).toBeLessThan(
    mockLogout.mock.invocationCallOrder[0],
  )
  expect(await loadThreadCache('conv-1')).toEqual([])
  expect(await listChatOutbox()).toEqual([])
  expect(await list()).toEqual([])
  // Only the device-level language preference survives.
  expect(await AsyncStorage.getAllKeys()).toEqual(['constructo.lang'])
})

test('an expired login keeps the queued messages and captures', async () => {
  const qc = new QueryClient()
  await seed(qc)
  await resetSession({ queryClient: qc, keepQueued: true })
  await new Promise((r) => setTimeout(r, 0))
  expect(mockLogout).not.toHaveBeenCalled()

  expect(qc.getQueryData(['owner', 'home'])).toBeUndefined()
  expect(await loadThreadCache('conv-1')).toEqual([])
  expect((await listChatOutbox()).map((i) => i.clientMsgId)).toEqual(['c1'])
  expect(await list()).toHaveLength(1)
  expect(await AsyncStorage.getItem(SESSION_USER_KEY)).toBe('u1')
  expect(await AsyncStorage.getItem('constructo.site_id')).toBeNull()
})

test('a money decision in its undo window is sent before the login ends', async () => {
  const { schedulePending, pendingCount } = require('../../owner/pendingDecisions')
  const send = jest.fn(async () => {
    // Still signed in when it goes out.
    expect(mockClearToken).not.toHaveBeenCalled()
    expect(mockLogout).not.toHaveBeenCalled()
  })
  schedulePending({ ids: ['d1'], send, message: 'Approved', undoLabel: 'Undo', failMessage: 'x' })
  await resetSession({ queryClient: new QueryClient() })
  expect(send).toHaveBeenCalledTimes(1)
  expect(pendingCount()).toBe(0)
})
