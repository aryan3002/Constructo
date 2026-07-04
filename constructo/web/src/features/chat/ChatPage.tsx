/**
 * ChatPage — the `/chat` route component.
 *
 * Two-pane layout:
 *   desktop: ChatInbox (left, fixed md:w-80) + ChatThread (right, flex-1)
 *   narrow:  inbox panel; once a conversation is selected, thread panel (with back button)
 *
 * No site header — chat is inbox-centric (no SiteSwitcher needed). The AppShell
 * shell chrome (tab bar / sidebar) still wraps the page normally.
 *
 * Semantic tokens only — no hardcoded hex. Neev light + neev-dark aware.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../ui/AppShell'
import { useMeRole, useMe } from '../../auth/useCan'
import { Spinner } from '../../components/states'
import { ChatInbox } from './ChatInbox'
import { ChatThread } from './ChatThread'
import { GroupManageDrawer } from './groups/GroupManageDrawer'
import { chatApi, type ConversationSummary, type ChatAddress } from '../../api/chat'

// ---------------------------------------------------------------------------
// Role label + initials helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  pm: 'PM',
  architect: 'Architect',
  supervisor: 'Supervisor',
  accountant: 'Accountant',
  procurement: 'Procurement',
  labor_contractor: 'Labour',
  contractor: 'Labour',
}

const ROLE_INITIALS: Record<string, string> = {
  owner: 'OW',
  pm: 'PM',
  architect: 'AR',
  supervisor: 'SV',
  accountant: 'AC',
  procurement: 'PR',
  labor_contractor: 'LC',
  contractor: 'LC',
}

interface ChatLocationState {
  conversation?: ConversationSummary
}

function matchesDeepLink(
  conversation: ConversationSummary | null,
  conversationId: string | null,
  siteId: string | null,
): boolean {
  if (!conversation) return false
  if (conversationId) return conversation.id === conversationId
  if (siteId) return conversation.kind === 'site' && conversation.site_id === siteId
  return false
}

// ---------------------------------------------------------------------------
// ChatPage
// ---------------------------------------------------------------------------

export function ChatPage() {
  const role = useMeRole() ?? 'owner'
  const { data: me } = useMe()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const conversationParam = searchParams.get('conversation')
  const siteParam = searchParams.get('site')
  const msgParam = searchParams.get('msg')
  const targetKey = conversationParam
    ? `conversation:${conversationParam}`
    : siteParam
      ? `site:${siteParam}`
      : null
  const stateConversation =
    (location.state as ChatLocationState | null | undefined)?.conversation ?? null

  /** The full ConversationSummary for the selected thread (needed to build the address). */
  const [selectedConv, setSelectedConv] = useState<ConversationSummary | null>(
    () => stateConversation,
  )

  const [resolvedTargetKey, setResolvedTargetKey] = useState<string | null>(() =>
    matchesDeepLink(stateConversation, conversationParam, siteParam) ? targetKey : null,
  )
  const consumedStateConvRef = useRef<string | null>(stateConversation?.id ?? null)

  /** On narrow screens: once a conversation is selected, flip to thread view. */
  const [mobileShowThread, setMobileShowThread] = useState(
    Boolean(stateConversation || targetKey),
  )

  /** Group-management drawer (only meaningful for group threads). */
  const [manageOpen, setManageOpen] = useState(false)
  const queryClient = useQueryClient()
  const conversationsQuery = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.conversations,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  })

  const targetMatchesSelected = matchesDeepLink(selectedConv, conversationParam, siteParam)
  const resolvingDeepLink = Boolean(
    targetKey && resolvedTargetKey !== targetKey && !targetMatchesSelected,
  )

  useEffect(() => {
    if (stateConversation && consumedStateConvRef.current !== stateConversation.id) {
      consumedStateConvRef.current = stateConversation.id
      setSelectedConv(stateConversation)
      setMobileShowThread(true)
      if (matchesDeepLink(stateConversation, conversationParam, siteParam)) {
        setResolvedTargetKey(targetKey)
      }
      return
    }

    const conversations = conversationsQuery.data
    if (!conversations) return

    if (conversationParam) {
      const match = conversations.find((conversation) => conversation.id === conversationParam)
      if (match) {
        if (selectedConv?.id !== match.id) setSelectedConv(match)
        setMobileShowThread(true)
        setResolvedTargetKey(targetKey)
      }
      return
    }

    if (siteParam) {
      const match = conversations.find(
        (conversation) => conversation.kind === 'site' && conversation.site_id === siteParam,
      )
      if (match) {
        if (selectedConv?.id !== match.id) setSelectedConv(match)
        setMobileShowThread(true)
        setResolvedTargetKey(targetKey)
      }
      return
    }

    if (
      !selectedConv &&
      conversations.length > 0 &&
      typeof window !== 'undefined' &&
      window.innerWidth >= 768
    ) {
      setSelectedConv(conversations[0])
    }
  }, [
    conversationParam,
    conversationsQuery.data,
    selectedConv,
    siteParam,
    stateConversation,
    targetKey,
  ])

  // Build the ChatAddress from the selected conversation — memoized so the
  // identity is stable across re-renders as long as the selected conversation
  // id + kind don't change.
  const chatAddress = useMemo<ChatAddress | null>(() => {
    if (!selectedConv) return null
    if (selectedConv.kind === 'site' && selectedConv.site_id) {
      return { siteId: selectedConv.site_id }
    }
    return { conversationId: selectedConv.id }
  }, [selectedConv?.id, selectedConv?.kind, selectedConv?.site_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive the thread title and homeowner flag from the selected conversation.
  const threadTitle = selectedConv
    ? selectedConv.kind === 'homeowner'
      ? `Homeowner · ${selectedConv.site_name ?? ''}`
      : (selectedConv.title ?? selectedConv.site_name ?? 'Site')
    : undefined

  const hasHomeowner = selectedConv
    ? selectedConv.has_homeowner && selectedConv.kind !== 'homeowner'
    : false

  // Role badge — prefer the user's display name if available.
  const roleLabel = ROLE_LABELS[role] ?? role
  const roleBadge = {
    name: me?.name ?? roleLabel,
    initials: ROLE_INITIALS[role] ?? roleLabel.slice(0, 2).toUpperCase(),
  }

  function handleSelect(conv: ConversationSummary) {
    setSelectedConv(conv)
    setMobileShowThread(true)
    if (targetKey) setResolvedTargetKey(targetKey)
  }

  function handleBack() {
    setMobileShowThread(false)
  }

  return (
    <AppShell role={role} roleBadge={roleBadge}>
      {/*
        Two-pane container. We override AppShell's content padding/max-width by
        using a -mx + -my negative-margin pattern so the two panes can fill the
        full available height flush to the shell edges.
      */}
      <div
        data-testid="chat-page"
        className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-sheet border border-edge bg-surface md:h-[calc(100vh-2rem)]"
      >
        {/* ── Left pane: inbox ─────────────────────────────────────────────── */}
        <div
          role="region"
          aria-label="Conversation list"
          data-testid="chat-inbox-pane"
          className={`
            w-full shrink-0 border-r border-edge
            md:block md:w-80
            ${mobileShowThread || resolvingDeepLink ? 'hidden' : 'block'}
          `}
        >
          <ChatInbox
            selectedId={selectedConv?.id ?? null}
            onSelect={handleSelect}
          />
        </div>

        {/* ── Right pane: thread or empty state ────────────────────────────── */}
        <div
          role="region"
          aria-label="Conversation thread"
          data-testid="chat-thread-pane"
          className={`
            min-w-0 flex-1 flex-col
            md:flex
            ${mobileShowThread || resolvingDeepLink ? 'flex' : 'hidden'}
          `}
        >
          {resolvingDeepLink ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Opening conversation..." />
            </div>
          ) : chatAddress && selectedConv ? (
            <>
              {/* Mobile back button */}
              <div className="shrink-0 border-b border-edge bg-surface-card px-3 py-2 md:hidden">
                <button
                  type="button"
                  data-testid="back-to-inbox"
                  onClick={handleBack}
                  className="font-body text-small text-brand-text hover:underline"
                >
                  ← Back to inbox
                </button>
              </div>

              <ChatThread
                key={selectedConv.id}
                address={chatAddress}
                title={threadTitle}
                hasHomeowner={hasHomeowner}
                siteId={selectedConv.site_id ?? undefined}
                scrollToMessageId={msgParam ?? undefined}
                onManageGroup={
                  selectedConv.kind === 'group' ? () => setManageOpen(true) : undefined
                }
              />
            </>
          ) : (
            /* Empty state — nothing selected */
            <div
              data-testid="chat-empty-state"
              className="flex flex-1 items-center justify-center"
            >
              <p className="font-body text-body text-text-muted">
                Select a conversation
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedConv?.kind === 'group' ? (
        <GroupManageDrawer
          key={selectedConv.id}
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          groupId={selectedConv.id}
          groupTitle={threadTitle ?? 'Group'}
          onLeft={() => {
            setManageOpen(false)
            setSelectedConv(null)
            setMobileShowThread(false)
            void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
          }}
        />
      ) : null}
    </AppShell>
  )
}
