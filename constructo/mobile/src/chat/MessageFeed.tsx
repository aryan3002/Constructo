/**
 * MessageFeed — the theme-aware message list for the unified chat kit. Renders a
 * flat array of rows: bubbles, capture cards, and screen-supplied `custom` rows
 * (Nivaan @ask answers, the homeowner Home Room weave). Adapts to the active
 * theme automatically (the bubbles/cards read `useTheme()`), so the same feed
 * serves the contractor Neev screens and the homeowner Daylight thread.
 */
import { useCallback, useRef, type ReactNode } from 'react'
import { FlatList, View } from 'react-native'

import { SPACE } from '../theme/tokens'
import type { ChatMessage } from '../api/chat'
import { CaptureCard, MessageBubble } from './MessageView'
import type { ChatFeedItem } from './feed'
import type { DeliveryState } from './threadState'

/** A row in the rendered feed — a derived bubble/card, or a screen-injected node. */
export type FeedRow = ChatFeedItem | { kind: 'custom'; key: string; node: ReactNode }

export function MessageFeed({
  items,
  mineSide,
  time,
  onLongPressMessage,
  deliveryStateFor,
  emptyState,
  header,
  contentPaddingBottom = SPACE.lg,
}: {
  items: FeedRow[]
  /** Which `sender_side` is "me" for bubble alignment/tint. */
  mineSide: 'homeowner' | 'contractor'
  /** Format an ISO timestamp for the bubble/card footer. */
  time: (iso: string) => string
  onLongPressMessage?: (m: ChatMessage) => void
  /** Optional: derive delivery tick for a given message (only applied to own bubbles). */
  deliveryStateFor?: (msg: ChatMessage) => DeliveryState | undefined
  emptyState?: ReactNode
  header?: ReactNode
  contentPaddingBottom?: number
}) {
  const listRef = useRef<FlatList<FeedRow>>(null)
  const scrollToEnd = useCallback(
    () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })),
    [],
  )

  const renderItem = useCallback(
    ({ item }: { item: FeedRow }) => {
      if (item.kind === 'custom') return <>{item.node}</>
      if (item.kind === 'card') {
        return (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
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
      return (
        <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
          <MessageBubble
            body={m.body}
            mine={m.sender_side === mineSide}
            attachmentUrl={m.attachment_url}
            timestamp={time(m.created_at)}
            deliveryState={deliveryStateFor?.(m)}
            onLongPress={onLongPressMessage ? () => onLongPressMessage(m) : undefined}
          />
        </View>
      )
    },
    [mineSide, time, onLongPressMessage, deliveryStateFor],
  )

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: SPACE.lg, paddingBottom: contentPaddingBottom, flexGrow: 1 }}
      onContentSizeChange={scrollToEnd}
      ListHeaderComponent={header ? <>{header}</> : null}
      ListEmptyComponent={emptyState ? <>{emptyState}</> : null}
    />
  )
}
