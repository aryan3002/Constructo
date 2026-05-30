jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import { clear, enqueue, list, remove, size } from './outbox'

describe('offline outbox', () => {
  beforeEach(async () => {
    await clear()
  })

  it('enqueues, lists and removes a replayable action', async () => {
    expect(await size()).toBe(0)

    const item = await enqueue({
      label: 'Flag an issue',
      path: '/api/v1/homeowner/requests',
      method: 'POST',
      body: { title: 'Leak' },
    })
    expect(item.id).toMatch(/^ob_/)
    expect(item.createdAt).toBeGreaterThan(0)

    const all = await list()
    expect(all).toHaveLength(1)
    expect(all[0].label).toBe('Flag an issue')

    await remove(item.id)
    expect(await size()).toBe(0)
  })

  it('preserves FIFO order across enqueues', async () => {
    await enqueue({ label: 'first', path: '/a', method: 'POST' })
    await enqueue({ label: 'second', path: '/b', method: 'POST' })
    const all = await list()
    expect(all.map((i) => i.label)).toEqual(['first', 'second'])
  })
})
