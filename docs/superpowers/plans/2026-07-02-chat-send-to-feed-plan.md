# Chat "Send to Feed" — Implementation Plan

> Executes `docs/superpowers/specs/2026-07-02-chat-send-to-feed-design.md`. Inline TDD execution.

**Goal:** Contractor long-presses any chat photo → Send to feed → quick sheet (caption? room?) → reuses the R2 key to create a PublishedPhoto (homeowner feed + contractor Album); bubble shows ✓ In feed; DB-enforced dedup.

## Global Constraints
- Contractor-only (endpoint rejects homeowner 403; mobile affordance only on contractor screens).
- Reuse the image key — never re-upload.
- Honest-AI caption gate — never auto-copy chat body into caption.
- Idempotent dedup via UNIQUE `source_chat_message_id`.
- Verify: `uv run pytest` + `uv run ruff check` (repo-wide); `npm run typecheck`.

---

### T1 — Model column + Alembic migration
**Files:** `app/models/homeowner_feed.py`, new `alembic/versions/*_publishedphoto_source_chat_message.py`
- Add `source_chat_message_id: Mapped[UUID | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, unique=True)`.
- Migration: `add_column` (nullable) + `create_unique_constraint`/unique index; downgrade drops both. Head-parent = current head (find via `alembic heads`).
- Verify: `uv run alembic upgrade head` locally (or model import) green.

### T2 — `POST /publish/photo/from-chat`
**Files:** `app/publish/router.py`, `app/publish/schemas.py`, test `tests/publish/test_send_to_feed.py`
- Schema `PublishFromChatIn { message_id: UUID; caption: str | None = None; room_tag: str | None = None }`.
- Handler: load `Message` (400 `not_an_image` if no `attachment_key` / non-image mime) → load `Conversation`, `can_access` else 403, reject `UserRole.homeowner` 403 → resolve `site_id` from conversation (400 `no_site` if none) → dedup on `source_chat_message_id` (return existing) → create `PublishedPhoto(image_url=msg.attachment_key, source_chat_message_id, shared_by, caption, room_tag, site_id)` (no sync vision) → return `ContractorPhotoOut`.
- **Failing tests first:** creates row w/ reused key + source id + shows in `/homeowner/photos` & `/publish/photos`; dedup (count==1); non-member 403; homeowner 403; non-image 400; blank caption→None.

### T3 — Chat message-out `feed_photo_id`
**Files:** `app/chat/router.py` (+ its message-out schema), extend a test in `tests/publish/test_send_to_feed.py` or chat tests
- Add `feed_photo_id: UUID | None` to the message-out; populate via batched lookup of `PublishedPhoto.source_chat_message_id IN (page ids)`.
- Verify: message-out null before publish, set after.

### T4 — Mobile API client
**Files:** `src/api/contractor.ts`, `src/api/chat.ts` (message type)
- `sendChatPhotoToFeed(messageId, { caption?, roomTag? })` → `POST /api/v1/publish/photo/from-chat`.
- Add `feed_photo_id?: string | null` to the chat message type.

### T5 — MessageView long-press + ✓ In feed badge
**Files:** `src/chat/MessageView.tsx`
- Props `onSendToFeed?: (messageId: string) => void`, `feedPhotoId?: string | null`. On a photo message with `onSendToFeed`: `onLongPress`. When `feedPhotoId`, render a small ✓ In feed badge; long-press → "View in feed" (or no-op) instead of re-send.

### T6 — SendToFeedSheet
**Files:** new `src/contractor/SendToFeedSheet.tsx`
- RN `Modal` bottom-sheet: photo preview + optional caption `TextInput` + `ROOM_PRESETS` chips + Send/cancel. Calls `sendChatPhotoToFeed`; on success → onSent(messageId, photo) + toast. en/hi copy.

### T7 — Wire the contractor chat screen(s)
**Files:** `app/(contractor)/owner/chat/[id].tsx` (+ any other contractor chat screens)
- Pass `onSendToFeed` + per-message `feedPhotoId` into MessageView; host the sheet; optimistic ✓ In feed on success.

### T8 — Verify
- `uv run pytest` (full) + `uv run ruff check` (repo) + `npm run typecheck`.

### T9 — Ship
- Deploy backend (migration auto-applies on boot) via the local-docker recipe [[prod-deploy-coordinates]]; commit each task; push branch → PR #234 updates; confirm CI + healthz.
