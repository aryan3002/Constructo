// Notification bell data layer (W3.3) — the bell goes live.
//
// The designed real-time path is an SSE stream (`/events/stream`), but that
// endpoint is absent today, so the bell ships on the explicit polling FLOOR the
// W3 DoD allows: `unreadCount()` every 30s, *visibility-aware* (the timer pauses
// while the tab is backgrounded and one fresh read fires the moment the owner
// returns). SSE is a later, drop-in upgrade — swap the query for a subscription
// and nothing above this layer changes.
//
// Reading happens against the live notification feed; `markRead` is optimistic
// (the badge ticks down and the row greys instantly), then both caches are
// invalidated so the server reconciles the truth.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvalsApi, type AppNotification } from '../../api/approvals'
import { qk } from '../../api/queryKeys'

/** How often the bell re-checks the unread count while the tab is foregrounded. */
export const UNREAD_POLL_MS = 30_000

/**
 * `useUnreadCount()` — the live unread badge. Polls every 30s only while the tab
 * is visible (`refetchIntervalInBackground: false`) and refetches immediately on
 * window focus so a returning owner never stares at a stale count. Returns the
 * raw query so callers can read `data`/`isLoading` as they like. `enabled`
 * gates the poll so surfaces without a bell (no header) never hit the network.
 */
export function useUnreadCount(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  return useQuery({
    queryKey: qk.notificationsUnread(),
    queryFn: () => approvalsApi.unreadCount(),
    enabled,
    // Visibility-aware: stop the timer when the tab is hidden, resume on return.
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    // Global default is `false`; the bell is the one surface that *should* catch
    // up the instant the owner switches back to the tab.
    refetchOnWindowFocus: true,
  })
}

/** The notification feed itself (panel contents). Newest-first per the backend. */
export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications(),
    queryFn: () => approvalsApi.notifications(),
  })
}

interface MarkReadContext {
  prevFeed?: AppNotification[]
  prevUnread?: number
}

/**
 * `useMarkNotificationRead()` — optimistically stamp a single notification read:
 * grey the row (`read_at`) and decrement the badge, rolling both back on error,
 * then invalidate so the server count wins on settle.
 */
export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const feedKey = qk.notifications()
  const unreadKey = qk.notificationsUnread()

  return useMutation<void, Error, string, MarkReadContext>({
    mutationFn: (id) => approvalsApi.markRead(id),
    async onMutate(id) {
      await qc.cancelQueries({ queryKey: feedKey })
      await qc.cancelQueries({ queryKey: unreadKey })

      const prevFeed = qc.getQueryData<AppNotification[]>(feedKey)
      const prevUnread = qc.getQueryData<number>(unreadKey)

      // Only the *unread→read* transition moves the badge.
      const wasUnread = prevFeed?.some((n) => n.id === id && n.read_at === null)

      if (prevFeed) {
        qc.setQueryData<AppNotification[]>(
          feedKey,
          prevFeed.map((n) =>
            n.id === id && n.read_at === null
              ? { ...n, read_at: new Date().toISOString() }
              : n,
          ),
        )
      }
      if (wasUnread && typeof prevUnread === 'number') {
        qc.setQueryData<number>(unreadKey, Math.max(0, prevUnread - 1))
      }

      return { prevFeed, prevUnread }
    },
    onError(_err, _id, ctx) {
      if (ctx?.prevFeed !== undefined) qc.setQueryData(feedKey, ctx.prevFeed)
      if (ctx?.prevUnread !== undefined) qc.setQueryData(unreadKey, ctx.prevUnread)
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: feedKey })
      qc.invalidateQueries({ queryKey: unreadKey })
    },
  })
}

/**
 * `useMarkAllNotificationsRead()` — there is no batch endpoint yet, so this fans
 * `markRead` out across the given unread ids in parallel, then invalidates once.
 * The caller passes the ids (the panel already knows which rows are unread); that
 * avoids re-reading the feed cache *after* `onMutate` has optimistically greyed
 * it. Optimistically zeroes the badge and greys those rows.
 */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  const feedKey = qk.notifications()
  const unreadKey = qk.notificationsUnread()

  return useMutation<void, Error, string[], MarkReadContext>({
    async mutationFn(ids) {
      await Promise.all(ids.map((id) => approvalsApi.markRead(id)))
    },
    async onMutate(ids) {
      await qc.cancelQueries({ queryKey: feedKey })
      await qc.cancelQueries({ queryKey: unreadKey })

      const prevFeed = qc.getQueryData<AppNotification[]>(feedKey)
      const prevUnread = qc.getQueryData<number>(unreadKey)
      const stamp = new Date().toISOString()
      const idSet = new Set(ids)

      if (prevFeed) {
        qc.setQueryData<AppNotification[]>(
          feedKey,
          prevFeed.map((n) =>
            idSet.has(n.id) && n.read_at === null ? { ...n, read_at: stamp } : n,
          ),
        )
      }
      if (typeof prevUnread === 'number') {
        qc.setQueryData<number>(unreadKey, Math.max(0, prevUnread - ids.length))
      }

      return { prevFeed, prevUnread }
    },
    onError(_err, _v, ctx) {
      if (ctx?.prevFeed !== undefined) qc.setQueryData(feedKey, ctx.prevFeed)
      if (ctx?.prevUnread !== undefined) qc.setQueryData(unreadKey, ctx.prevUnread)
    },
    onSettled() {
      qc.invalidateQueries({ queryKey: feedKey })
      qc.invalidateQueries({ queryKey: unreadKey })
    },
  })
}
