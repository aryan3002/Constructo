/** T3: an offline / server-error cold start keeps the cached session (and
 * re-checks when the network returns); a 401 signs out with a note and keeps
 * the queued work. Rendered with react-test-renderer (no screens mounted). */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
let mockToken: string | null = 'jwt-1'
jest.mock('../../store/secure', () => ({
  getToken: async () => mockToken,
  clearToken: async () => {
    mockToken = null
  },
}))
jest.mock('../../push/register', () => ({
  registerDevicePushToken: async () => null,
  registerForPushNotificationsAsync: async () => null,
  persistPushToken: async () => undefined,
  unregisterDevicePushToken: async () => undefined,
}))
jest.mock('../../chat/useChatThread', () => ({ closeSharedSocket: () => undefined }))
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }))
let mockNetListener: ((s: { isConnected: boolean }) => void) | null = null
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (fn: (s: { isConnected: boolean }) => void) => {
      mockNetListener = fn
      return () => undefined
    },
  },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import { enqueueChatSend, listChatOutbox } from '../../chat/outbox'
import { AuthProvider, useAuth } from '../AuthContext'
import { SESSION_ME_KEY, SESSION_USER_KEY } from '../resetSession'

// react-test-renderer ships with jest-expo (no type package installed).
const { act, create } = require('react-test-renderer') as {
  act: (fn: () => Promise<void>) => Promise<void>
  create: (el: ReactElement) => unknown
}

const ME = { id: 'u1', company_id: 'c', name: 'Ravi', phone: '+91', role: 'owner', language: null }
const realFetch = global.fetch
let auth: ReturnType<typeof useAuth> | null = null

function Probe() {
  auth = useAuth()
  return null
}

function mockMe(res: () => Promise<Response>) {
  global.fetch = jest.fn((url: string) =>
    String(url).endsWith('/api/v1/auth/me') ? res() : Promise.reject(new TypeError('offline')),
  ) as unknown as typeof fetch
}

async function mount() {
  await act(async () => {
    create(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

beforeEach(async () => {
  await AsyncStorage.clear()
  mockToken = 'jwt-1'
  mockReplace.mockReset()
  auth = null
})
afterEach(() => {
  global.fetch = realFetch
})

test('offline cold start keeps the cached session, then re-checks online', async () => {
  await AsyncStorage.setItem(SESSION_ME_KEY, JSON.stringify(ME))
  mockMe(() => Promise.reject(new TypeError('Network request failed')))
  await mount()
  expect(auth?.status).toBe('authed')
  expect(auth?.role).toBe('owner')

  mockMe(async () => new Response(JSON.stringify({ ...ME, name: 'Ravi K' }), { status: 200 }))
  await act(async () => {
    mockNetListener?.({ isConnected: true })
    await new Promise((r) => setTimeout(r, 20))
  })
  expect(auth?.me?.name).toBe('Ravi K')
})

test('a 5xx cold start keeps the cached session', async () => {
  await AsyncStorage.setItem(SESSION_ME_KEY, JSON.stringify(ME))
  mockMe(async () => new Response('{}', { status: 503 }))
  await mount()
  expect(auth?.status).toBe('authed')
})

test('a 401 signs out with a note and keeps queued messages', async () => {
  await AsyncStorage.multiSet([
    [SESSION_ME_KEY, JSON.stringify(ME)],
    [SESSION_USER_KEY, 'u1'],
  ])
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'hi', clientMsgId: 'm1' })
  mockMe(async () =>
    new Response(JSON.stringify({ error: { code: 'invalid_token', message: 'x' } }), { status: 401 }),
  )
  await mount()
  expect(auth?.status).toBe('guest')
  expect(auth?.sessionExpired).toBe(true)
  expect(mockToken).toBeNull()
  expect((await listChatOutbox()).map((i) => i.clientMsgId)).toEqual(['m1'])
  expect(await AsyncStorage.getItem(SESSION_ME_KEY)).toBeNull()
})

test('a different user signing in drops the previous user\'s queue', async () => {
  await AsyncStorage.setItem(SESSION_USER_KEY, 'someone-else')
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'old', clientMsgId: 'm0' })
  mockMe(async () => new Response(JSON.stringify(ME), { status: 200 }))
  await mount()
  expect(auth?.status).toBe('authed')
  expect(await listChatOutbox()).toEqual([])
  expect(await AsyncStorage.getItem(SESSION_USER_KEY)).toBe('u1')
})
