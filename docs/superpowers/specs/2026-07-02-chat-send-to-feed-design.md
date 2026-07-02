# Chat "Send to Feed" — Design Spec

**Status:** approved (brainstorm 2026-07-02)
**Feature:** Let a contractor take a photo already shared in any in-app chat and "Send to feed" so it appears in both the homeowner's Photos feed and the contractor's Album — reusing the existing image (no re-upload).

## Goal

The second half of the original photo-share hybrid (Phase 1 shipped the dedicated Share screen; this is the deferred in-chat path). A contractor long-presses any photo bubble → **Send to feed** → a quick sheet (optional caption + room) → the photo joins the homeowner feed + contractor Album. Once sent, the bubble shows **✓ In feed** and can't be re-sent.

## Architecture

Server-authoritative "publish from chat": the client sends a **message id**, not a raw key. The backend validates chat access + contractor role, reuses the message's existing R2 `attachment_key` as the published photo's `image_url`, records `source_chat_message_id` (UNIQUE → dedup), and creates a `PublishedPhoto` exactly like the Phase 1 Share flow. The chat message-out gains a `feed_photo_id` (left-join) so the "✓ In feed" badge is durable across reloads.

## Tech Stack

FastAPI + SQLAlchemy async + Alembic (backend); Expo/React Native SDK 54 (mobile). Reuses `app/publish/` (PublishedPhoto, ContractorPhotoOut), `app/chat/access.py` (`can_access`), `app/models/chat.py` (Message.attachment_key), and mobile `src/chat/MessageView`, `ROOM_PRESETS`.

## Global Constraints

- **Contractor-only:** the "Send to feed" affordance appears ONLY on contractor-rendered chat screens; the homeowner never sees it. Enforced two ways — the mobile capability is passed only by contractor screens, AND the endpoint rejects `UserRole.homeowner` (403).
- **Reuse the image — never re-upload:** `PublishedPhoto.image_url = message.attachment_key`. The chat upload already downsizes images, so the feed inherits the fast, small version.
- **Honest-AI gate (from Phase 1):** never auto-copy the chat message body into the homeowner-visible caption. Caption is blank unless the contractor types one in the sheet.
- **Idempotent dedup:** a chat message can be in the feed at most once (DB UNIQUE on `source_chat_message_id`); a repeat call returns the existing row, never a duplicate.
- **English-first, English + Hindi copy** for all new user-facing strings.
- Verify backend with `uv run pytest` + `uv run ruff check` (whole repo); mobile with `npm run typecheck`.

## Components

### Backend

**B1. Model + migration** — `app/models/homeowner_feed.py`
- Add `source_chat_message_id: Mapped[UUID | None]` = `mapped_column(ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, unique=True)`.
- Alembic migration: add the nullable column + unique constraint. (Applied on deploy via the Dockerfile `alembic upgrade head` entrypoint.)

**B2. `POST /api/v1/publish/photo/from-chat`** — `app/publish/router.py`
- Body `PublishFromChatIn { message_id: UUID, caption: str | None = None, room_tag: str | None = None }`.
- Steps: (1) load `Message`; 400 `not_an_image` if no `attachment_key` or non-image mime. (2) load its `Conversation`; call `chat/access.py can_access(session, user, conversation)` → 403 if not; reject `user.role is UserRole.homeowner` → 403. (3) dedup: if a `PublishedPhoto` with `source_chat_message_id == message_id` exists, return it (200/201 idempotent). (4) create `PublishedPhoto(site_id=<from conversation/message context>, image_url=message.attachment_key, source_chat_message_id=message_id, shared_by=user.id, caption=body.caption, room_tag=body.room_tag)` — mirror the Phase 1 `with_draft=false` fast path (no synchronous vision). Return `ContractorPhotoOut`.
- **Site resolution:** `PublishedPhoto` needs a `site_id`. Use the conversation's `site_id`. If the conversation is site-less (a site-less `group` thread), return 400 `no_site` — there is no homeowner feed to publish to. Site and homeowner threads always carry a site; most group threads do too.

**B3. Chat message-out `feed_photo_id`** — `app/chat/router.py` (message serialization)
- Add `feed_photo_id: UUID | None` to the message-out schema. Populate via a single left-join / batched lookup of `PublishedPhoto.source_chat_message_id ∈ {message ids in page}`. Null = not in feed.

### Mobile

**M1. `MessageView` long-press hook** — `src/chat/MessageView.tsx`
- Add optional props: `onSendToFeed?: (messageId) => void` and `feedPhotoId?: string | null`. When `onSendToFeed` is provided AND the message has a photo attachment: long-press opens the caller's handler; when `feedPhotoId` is set, render a small **✓ In feed** badge and long-press offers "View in feed" instead.

**M2. "Send to feed" sheet** — new `src/contractor/SendToFeedSheet.tsx` (or inline in the chat screen)
- RN `Modal` bottom-sheet: photo preview + optional caption `TextInput` + `ROOM_PRESETS` room chips + **Send** / cancel. On Send → `contractor.sendChatPhotoToFeed(messageId, { caption, roomTag })` → close + toast + parent flips the bubble to ✓ In feed.

**M3. Wire contractor chat screen(s)** — `app/(contractor)/owner/chat/[id].tsx` (+ any other contractor chat screens found in planning)
- Pass `onSendToFeed` + per-message `feedPhotoId` into `MessageView`; host the sheet; optimistically mark the bubble on success.

**M4. API client** — `src/api/contractor.ts`
- `sendChatPhotoToFeed(messageId, body)` → `POST /api/v1/publish/photo/from-chat`. Add `feed_photo_id` to the chat message type.

## Data Flow

`contractor long-press photo bubble → Send to feed → sheet (caption? room?) → POST /publish/photo/from-chat → PublishedPhoto (reuses R2 key, records source_chat_message_id) → homeowner Photos feed + contractor Album (Phase 1 render path) → message-out feed_photo_id set → bubble shows ✓ In feed`

## Error Handling

| Case | Behavior |
|---|---|
| Message has no image | 400 `not_an_image` |
| Caller can't access conversation / is homeowner | 403 `forbidden` |
| Already in feed | idempotent — return existing `PublishedPhoto`, no duplicate |
| Network failure (mobile) | keep sheet open, error toast, no optimistic flip |

## Testing

**Backend (`tests/publish/`):**
1. from-chat publish creates a `PublishedPhoto` with `image_url == message.attachment_key` + `source_chat_message_id`; shows in homeowner feed (`GET /homeowner/photos`) and contractor album (`GET /publish/photos`).
2. dedup: second call returns the same row, no duplicate (assert count == 1).
3. access: non-member → 403; `homeowner` role → 403.
4. non-image message → 400.
5. optional caption/room persist; blank caption → `caption is None`.
6. chat message-out exposes `feed_photo_id` (null before, set after).

**Mobile:** `npm run typecheck` clean. (No test files under `app/` — Expo Router constraint.)

## Out of Scope (later)

- The homeowner-side "State of your home" landing (separate Phase 2 item).
- Before/after slider, time-lapse, Sunday digest (v2 delight).
- Un-sending / removing from feed via chat (Album already has owner/crew-own delete).

## Deploy

Backend change includes a migration → deploy via the local-docker recipe (`docker build --platform linux/amd64` → push to ACR → `az containerapp update`); the Dockerfile entrypoint runs `alembic upgrade head` on boot, applying the column to prod Neon. Mobile is Expo Go (no deploy).
