/**
 * MessageFeed — the homeowner thread's message list (the only consumer of this
 * component). An INVERTED FlatList: newest row at the visual bottom, sticky by
 * construction, with cheap scroll-up. Renders bubbles, capture cards, screen-
 * supplied custom rows, plus derived day separators and same-sender grouping
 * (names/avatars + clustered timestamps) from the pure `annotateFeed` helper.
 */
import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native'

import { SPACE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { Avatar, Small } from '../ui'
import type { ChatMessage } from '../api/chat'
import { CaptureCard, MessageBubble } from './MessageView'
import { annotateFeed, type AnnotateRow, type ChatFeedItem } from './feed'
import type { DeliveryState } from './threadState'

/** A row in the rendered feed — a derived bubble/card, or a screen-injected node. */
export type FeedRow = ChatFeedItem | { kind: 'custom'; key: string; node: ReactNode }

/** A synthetic day separator inserted between calendar days. */
type RenderRow = FeedRow | { kind: 'day'; key: string; label: string }

const AVATAR = 28

/** Default day label (English): Today / Yesterday / "8 Jun". The homeowner
 *  screen overrides this with a localized labeler. */
function defaultDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(now)) return 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (key(d) === key(y)) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function MessageFeed({
  items,
  mineSide,
  time,
  onLongPressMessage,
  deliveryStateFor,
  emptyState,
  header,
  contentPaddingBottom = SPACE.lg,
  dayLabel = defaultDayLabel,
  inverted = true,
  onEndReached,
  myUserId,
}: {
  items: FeedRow[]
  /** Which `sender_side` is "me" for bubble alignment/tint. */
  mineSide: 'homeowner' | 'contractor'
  /** When set, "mine" is decided by sender_id === myUserId (multi-party threads
   *  where several participants share a sender_side, e.g. contractor crews).
   *  Falls back to sender_side === mineSide when omitted. */
  myUserId?: string | null
  /** Format an ISO timestamp for the bubble/card footer. */
  time: (iso: string) => string
  onLongPressMessage?: (m: ChatMessage) => void
  /** Optional: derive delivery tick for a given message (only applied to own bubbles). */
  deliveryStateFor?: (msg: ChatMessage) => DeliveryState | undefined
  emptyState?: ReactNode
  header?: ReactNode
  contentPaddingBottom?: number
  /** Localized "Today / Yesterday / date" labeler for day separators. */
  dayLabel?: (iso: string) => string
  /** Inverted list (default) — newest at the visual bottom, sticky, scroll-up. */
  inverted?: boolean
  /** Called when the user scrolls toward older messages (load-more seam). */
  onEndReached?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const listRef = useRef<FlatList<RenderRow>>(null)
  const atBottom = useRef(true)

  // Track whether the user is at the bottom (inverted: offset.y near 0).
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atBottom.current = e.nativeEvent.contentOffset.y <= 24
  }, [])

  const senderNameFor = (m: ChatMessage) => m.sender_name ?? null
  const isMine = (m: ChatMessage) =>
    myUserId != null ? m.sender_id === myUserId : m.sender_side === mineSide

  // Derive day separators + grouping from the chronological items.
  const annotations = useMemo(() => {
    const rows: AnnotateRow[] = items.map((it) => {
      if (it.kind === 'bubble' || it.kind === 'card') {
        const m = it.message
        return {
          key: it.key,
          kind: 'msg' as const,
          createdAt: m.created_at,
          senderId: m.sender_id,
          senderKind: m.sender_kind ?? 'user',
          mine: isMine(m),
        }
      }
      return { key: it.key, kind: 'other' as const }
    })
    return annotateFeed(rows, dayLabel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, mineSide, myUserId, dayLabel])

  // Build the chronological render list, inserting a day separator before the
  // first row of each day, then reverse for the inverted list (so the day label
  // sits visually ABOVE that day's first message).
  const data = useMemo(() => {
    const out: RenderRow[] = []
    for (const it of items) {
      const label = annotations.dayBefore.get(it.key)
      if (label) out.push({ kind: 'day', key: `day:${it.key}`, label })
      out.push(it)
    }
    return inverted ? out.reverse() : out
  }, [items, annotations, inverted])

  const renderItem = useCallback(
    ({ item }: { item: RenderRow }) => {
      if (item.kind === 'day') {
        return (
          <View style={{ alignItems: 'center', paddingVertical: SPACE.sm }}>
            <Small
              muted
              style={{
                backgroundColor: c.paper,
                paddingHorizontal: SPACE.md,
                paddingVertical: 4,
                borderRadius: theme.radii.pill,
                overflow: 'hidden',
                fontSize: 12,
              }}
            >
              {item.label}
            </Small>
          </View>
        )
      }
      if (item.kind === 'custom') return <>{item.node}</>
      if (item.kind === 'card') {
        return (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.xs }}>
            <CaptureCard
              event={item.event}
              lang={item.lang}
              sourceText={item.sourceText}
              attachmentUrl={item.attachmentUrl}
              time={time(item.message.created_at)}
            />
          </View>
        )
      }
      // bubble
      const m = item.message
      const mine = isMine(m)
      const showSender = annotations.showSender.has(item.key)
      const isRunEnd = annotations.runEnd.has(item.key)
      const bubble = (
        <MessageBubble
          body={m.body}
          mine={mine}
          attachmentUrl={m.attachment_url}
          timestamp={isRunEnd ? time(m.created_at) : undefined}
          deliveryState={deliveryStateFor?.(m)}
          onLongPress={onLongPressMessage ? () => onLongPressMessage(m) : undefined}
          showSenderName={showSender}
          senderName={senderNameFor(m)}
        />
      )
      // Tighter spacing inside a run; full gap when the run ends.
      const marginBottom = isRunEnd ? SPACE.md : 2
      if (mine) {
        return <View style={{ paddingHorizontal: SPACE.gutter, marginBottom }}>{bubble}</View>
      }
      // Received: leading avatar on first-of-run, else an aligning spacer.
      return (
        <View
          style={{
            paddingHorizontal: SPACE.gutter,
            marginBottom,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: SPACE.xs,
          }}
        >
          {showSender ? (
            <Avatar name={senderNameFor(m)} size={AVATAR} />
          ) : (
            <View style={{ width: AVATAR }} />
          )}
          <View style={{ flex: 1 }}>{bubble}</View>
        </View>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mineSide, myUserId, time, onLongPressMessage, deliveryStateFor, annotations, theme, c.paper],
  )

  return (
    <FlatList
      ref={listRef}
      data={data}
      inverted={inverted}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{
        paddingTop: SPACE.lg,
        paddingBottom: contentPaddingBottom,
        flexGrow: 1,
      }}
      ListHeaderComponent={header ? <>{header}</> : null}
      ListEmptyComponent={emptyState ? <>{emptyState}</> : null}
    />
  )
}
