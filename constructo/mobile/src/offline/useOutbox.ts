/**
 * Sync engine for the offline {@link outbox}. Watches connectivity (NetInfo),
 * drains the queue when the device comes back online, and exposes status for
 * the {@link SyncStatus} indicator. Drained items replay through the API
 * client; a failed item stays queued for the next attempt.
 */
import { useCallback, useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

import { ApiError, request } from '../api/client'
import { submitCapture } from '../api/capture'
import { list, remove, type OutboxItem } from './outbox'

/** A 4xx (except 408 timeout / 429 rate-limit) is a PERMANENT rejection — the
 *  item can never succeed as-is (too large / forbidden / invalid), so retrying
 *  it forever would wedge everything queued behind it. */
function isPermanentFailure(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.status >= 400 &&
    e.status < 500 &&
    e.status !== 408 &&
    e.status !== 429
  )
}

export type SyncState = 'idle' | 'syncing' | 'offline'

export interface OutboxStatus {
  online: boolean
  state: SyncState
  pending: number
  /** Force a drain attempt (e.g. a "retry now" tap). */
  flush: () => Promise<void>
}

export function useOutbox(): OutboxStatus {
  const [online, setOnline] = useState(true)
  const [state, setState] = useState<SyncState>('idle')
  const [pending, setPending] = useState(0)

  const refreshCount = useCallback(async () => {
    setPending((await list()).length)
  }, [])

  const flush = useCallback(async () => {
    const items: OutboxItem[] = await list()
    if (items.length === 0) {
      setState('idle')
      return
    }
    setState('syncing')
    for (const item of items) {
      try {
        if (item.capture) {
          // Multipart field capture → the real /capture extraction loop.
          await submitCapture(item.capture)
        } else {
          await request(item.path, {
            method: item.method,
            body: item.body != null ? JSON.stringify(item.body) : undefined,
          })
        }
        await remove(item.id)
      } catch (e) {
        if (isPermanentFailure(e)) {
          // This item will NEVER sync (e.g. 413 too-large / 403 not-assigned /
          // 422). Drop it so it can't wedge every capture queued behind it, and
          // keep draining the rest. (Follow-up: surface dropped items for review
          // + downscale oversized media before enqueue.)
          await remove(item.id)
          continue
        }
        // Transient (network / 5xx / timeout): stop and retry the whole tail next time.
        break
      }
    }
    await refreshCount()
    setState('idle')
  }, [refreshCount])

  useEffect(() => {
    void refreshCount()
    const unsubscribe = NetInfo.addEventListener((s) => {
      const isOnline = Boolean(s.isConnected)
      setOnline(isOnline)
      if (isOnline) void flush()
      else setState('offline')
    })
    return () => unsubscribe()
  }, [flush, refreshCount])

  return { online, state, pending, flush }
}
