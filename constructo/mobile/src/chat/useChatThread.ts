/**
 * Headless thread logic for the unified chat kit — one conversation, addressed by
 * `siteId` (crew thread) XOR `conversationId` (group / homeowner). Owns the poll
 * query, idempotent send (with reply target), and the mark-read cursor. The
 * supervisor / owner / homeowner thread screens all drive their feed + composer
 * from this, instead of each re-implementing it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { chatApi, newClientMsgId, type ChatAddress, type ChatMessage } from '../api/chat'

export interface UseChatThread {
  messages: ChatMessage[]
  isLoading: boolean
  error: unknown
  sending: boolean
  /** The message being replied to (quote-reply), or null. */
  reply: ChatMessage | null
  setReply: (m: ChatMessage | null) => void
  /** Send `body` as a text message (idempotent). Throws on failure so the caller
   *  can restore the composer text; the reply target is restored automatically. */
  send: (body: string) => Promise<void>
  refetch: () => void
}

export function useChatThread(address: ChatAddress, opts?: { pollMs?: number }): UseChatThread {
  const qc = useQueryClient()
  const addrKey = 'conversationId' in address ? address.conversationId : address.siteId
  const [sending, setSending] = useState(false)
  const [reply, setReply] = useState<ChatMessage | null>(null)

  const q = useQuery({
    queryKey: ['chat', 'thread', addrKey],
    queryFn: () => chatApi.messages({ ...address, afterSeq: 0 }),
    refetchInterval: opts?.pollMs ?? 8000,
    enabled: !!addrKey,
  })
  const messages = useMemo(() => q.data ?? [], [q.data])

  // Mark-read: advance to the newest seq, then refresh the inbox unread badge.
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (!addrKey || newestSeq <= 0) return
    chatApi
      .read({ ...address, lastSeq: newestSeq })
      .then(() => qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] }))
      .catch(() => undefined)
    // address is reconstructed each render but addrKey captures its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrKey, newestSeq, qc])

  const send = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!text || sending) return
      setSending(true)
      const replyToId = reply?.id
      setReply(null)
      try {
        // chatApi.send takes snake_case address keys (site_id/conversation_id),
        // unlike the camelCase ChatAddress used by messages()/read().
        const sendAddr =
          'conversationId' in address
            ? { conversation_id: address.conversationId }
            : { site_id: address.siteId }
        await chatApi.send({
          ...sendAddr,
          client_msg_id: newClientMsgId(),
          body: text,
          media_type: 'text',
          ...(replyToId ? { reply_to_id: replyToId } : {}),
        })
        await q.refetch()
      } catch (err) {
        setReply(reply) // restore the reply target; caller restores the text
        throw err
      } finally {
        setSending(false)
      }
    },
    [address, reply, sending, q],
  )

  return {
    messages,
    isLoading: q.isLoading,
    error: q.error,
    sending,
    reply,
    setReply,
    send,
    refetch: q.refetch,
  }
}
