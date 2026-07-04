# Owner Activity Click-Through & Chat Provisioning — Design

**Date:** 2026-07-04
**Status:** approved (brainstorm via systematic-debugging + user Q&A)
**Branch:** `feat/owner-activity-clickthrough`

## Problem (verified in prod code, not guessed)

The activity-first Owner front page (PR #240, live) renders, but it is not *useful*
because every click resolves to nothing and new projects never reach chat:

1. **Dead-end clicks.** `/chat` is param-less (`App.tsx:174`) and `ChatPage`
   initializes `selectedConv = null` with zero URL/state reading
   (`ChatPage.tsx:58`) → desktop always shows the literal "Select a conversation"
   empty pane. The activity feed sends its two commonest rows straight there:
   photo rows → bare `/chat` (`ActivityStream.tsx:34`, a `// TODO(nav)`
   placeholder) and homeowner-request "Reply in chat" → `navigate('/chat')`
   (`RequestsView.tsx:121`, comment: *"ChatPage has no site-thread URL param yet"*).

2. **A new project never gets a chat room.** `POST /sites` creates only a `Site`
   row (`sites/router.py:134-149`). The inbox (`GET /chat/conversations`,
   `chat/router.py:1266-1275`) lists only sites that already have a `Conversation`,
   which is created *lazily on first message send* (`_get_or_create_site_conversation`,
   line 608). So a brand-new project is invisible in chat, and its future
   `?site=` deep-links can't resolve.

3. **New-owner cold start is a dead surface.** `SetupChecklist` is display-only —
   the "Add your first project" step has no action.

## Decisions (locked)

- **Deep-link contract (new):** `/chat` accepts `?site=<id>`, `?conversation=<id>`,
  and an optional `?msg=<messageId>` scroll target. `ChatPage` auto-selects the
  matching inbox conversation on load; with no param + nothing selected it
  auto-selects the **most-recent** conversation (desktop), so even the plain nav
  tab stops "opening nothing." Bare `/chat` still works (non-breaking).
- **Photo rows → the project's crew site thread** (`/chat?site=<site_id>`),
  scrolled to the source chat message when it lives in that thread (best-effort;
  `scroll_message_id` = `PublishedPhoto.source_chat_message_id`). site_id already
  rides every activity item.
- **Homeowner-request "Reply in chat" → the project's homeowner 1:1 channel**
  (user choice). A shared `useOpenHomeownerChannel()` get-or-creates the channel
  (`POST /chat/homeowner-channel` — verified an owner passes `can_access` for a
  visible site, `access.py:44`), invalidates the inbox, then navigates to
  `/chat?conversation=<id>`. Used by all three call sites (activity Reply button,
  `RequestsView` Reply, and OwnerHome's `handleReply`). The activity request row's
  *whole-row* click still goes to `/requests` (the full list); the Reply button is
  the jump-to-chat shortcut.
- **New project reaches chat instantly:** `POST /sites` **eager-creates the site
  `Conversation`** in the same transaction, and every create-site client
  invalidates `['chat','conversations']`. New owner's first project therefore has
  a room immediately and shows everywhere.
- **Cold start becomes actionable:** the checklist's `add_project` step opens the
  existing `NewProjectModal`; other steps stay display-only.
- **Feed polish:** homeowner-request activity rows carry a `detail` subtitle (so a
  one-word title like "Boy" reads with its context), matching what `/requests`
  already shows.
- **Unchanged, already-correct destinations** (no work): update/milestone/weekly/
  scope → `/sites/:id`; decision → `/approvals`; finding → `/health/:siteId`.
- **Out of scope:** adding a site switcher to `/chat` (inbox-centric by design);
  a dedicated `/feed/photo` web route; resolving photo-source-conversation
  ambiguity beyond best-effort scroll.

## Contract additions

- `ActivityLink` gains optional `scroll_message_id: string | null` (additive;
  only set on `feed_photo` items whose photo has a `source_chat_message_id`).
- `chatApi.openHomeownerChannel(siteId): Promise<ConversationSummary>` →
  `POST /api/v1/chat/homeowner-channel`.
- `ChatThread` gains `scrollToMessageId?: string` (best-effort scroll to
  `[data-msgid="…"]`, jsdom-guarded like the existing autoscroll).
- `ChatPage` reads `useSearchParams()` + optional `location.state.conversation`
  (fast-path select without waiting for the inbox refetch).

## Robustness (the "does it work for a new owner / new item?" test)

Every fix is **structural, not per-row**: the deep-link contract + eager
conversation provisioning + the shared homeowner-channel opener apply to all
current and future items and all owners, including the cold-start first-project
path. No fix depends on today's seeded data.

## Testing posture

- Backend (`.venv/bin/python3 -m pytest`): site-create → conversation exists +
  appears in the owner's `GET /chat/conversations`; owner opens homeowner channel
  (no 403); activity photo item carries `scroll_message_id`; request item subtitle
  = detail. Baseline: 7 pre-existing WeasyPrint PDF `OSError`s stay the only reds.
- Web (`npm run build` then vitest): ChatPage resolves `?site=`/`?conversation=`/
  `location.state` and auto-selects most-recent on bare `/chat`; ChatThread scrolls
  to `scrollToMessageId`; `useOpenHomeownerChannel` calls API + invalidates +
  navigates; NewProjectModal invalidates `['chat','conversations']`; SetupChecklist
  add_project opens the modal; `linkFor` photo → `/chat?site=…`. Verify with
  `npm run build` (tsc -b, strict), never `npm run lint`.
