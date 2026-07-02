# Contractor Photo Upload → Shared Photos Feed — Design (v2, inversion-refined)

**Date:** 2026-06-30
**Status:** Approved design (brainstorm + upside-down inversion pass complete; pending implementation plan)
**Owner:** Aryan

> **v2 note:** This supersedes the first draft. After the design was approved, the founder asked to
> "create the best UX by thinking everything upside down." A 7-lens inversion pass + a regret-critic
> reshaped the design: the **photo is decoupled from the caption**, the **chat-chip door is deferred**
> in favour of one deliberate share surface, and the **homeowner side becomes receive-first**. The
> product's load-bearing invariant — the **honest-AI gate** (a human always crosses the line; raw AI
> text never auto-publishes) — is preserved throughout.

---

## 1. Problem & context

The homeowner **Photos** feed (`published_photos`) is currently populated **only** by the WhatsApp
importer + an offline vision batch script. We are **dropping WhatsApp extraction**, so we need a real
in-app flow: a contractor shares a site photo and it reaches the homeowner with the right room /
milestone / (optional) caption, with **near-zero contractor effort** and **without** an unreviewed AI
sentence ever reaching an anxious client.

### North star (post-inversion)
The contractor barely "curates" — one tap shares a photo, and the photo costs **zero typing** because
the AI caption is a *separate, optional* one-tap confirmation. The homeowner barely "browses" — she
opens to a calm, narrated **"State of your home"** and can **pull** a photo of a specific room on
demand. Every friction cut is routed **through** the honest-AI gate, not around it.

### What already exists (verified, reuse)
- **Chat photo upload** works: presign PUT → R2 `chat/{site_id}/{uuid}.jpg`; stored in `chat_messages`
  with indexed `media_sha256`. — `chat/router.py:843-937`, `models/chat.py:106-159`.
- **Publish endpoint** `POST /api/v1/publish/photo` (`publish/router.py:109-169`) creates a
  `PublishedPhoto`; when `caption` is null it calls vision `draft_caption(image_url)` **live** and
  returns the draft **without** writing it to `caption` (the honest-AI gate, `~:118-150`).
- **A `caption=None` photo already renders** in the homeowner feed — the read path has **no caption
  filter** (`homeowner/router.py:1188`, `view=='all'`). *This is what makes the keystone free.*
- **Homeowner `/home`** (`homeowner/router.py:835-955`) already returns `milestone_now/next`,
  per-space progress, `recent_activity` with presigned thumbnails, quiet windows, and spend.
  `draft_weekly_summary` is numeric-guarded + auto-translated.
- **`HomeownerRequest`** already has `status / sla_due_at / nudged_at / voice_key` + a create path +
  a one-nudge sweep (`models/homeowner_member.py:106-132`). *This is what makes the pull door cheap.*
- Milestone date-bucketing + free caption translation on the read path; `notify_site_homeowners`
  (cadence/quiet-aware); `media_sha256` dedup; presigned GET/PUT + offline outbox.

### Honest constraints (the inversion pass corrected these — do not estimate without them)
1. **There is NO contractor publish-photo UI today** in mobile or web (only `publish/drawings` is
   wired). Every contractor-side screen here is **net-new front-end**, not "a chip on a reused chat".
2. **Two migrations are genuinely required** and don't exist today on `PublishedPhoto`
   (`models/homeowner_feed.py:57-81`): **`deleted_at`** (soft-delete/unshare) and
   **`source_chat_message_id`** (dedup + audit when the chat door later ships). Unshare is not
   buildable without `deleted_at`.
3. **Vision is a Fake.** `get_vision_client` returns `FakeVisionClient` (`extraction/vision.py:56-57`)
   with no real provider and no real `category`. So AI caption/room/junk-classification are
   **advisory pre-fill only** — never a gate, never auto-applied without a one-tap human confirm.

---

## 2. The keystone: decouple the PHOTO from the CAPTION

The single highest-leverage move. **Publishing a photo is zero-input and instant** (`caption=None`);
the **AI caption is a separate, single affirmative tap**.

- Tap to share → the photo is published immediately with `caption=None` and a confirmed **room** (see
  §4). It renders in the homeowner feed right away (no caption filter).
- On the same confirm card, the AI draft appears as a **dashed "pending suggestion"**. The contractor
  can: **✓ send caption** (publishes the AI text verbatim *as a reviewed fact* via the existing
  re-POST), **tap-a-word to fix** (correction sheet: alternate phrasings / remove / Hindi voice), or
  **ignore it** (the photo simply stays caption-less, which is fine).
- **Failure mode becomes impossible:** silence = *no caption* (renders fine); there is no path where
  *wrong* AI text silently reaches the homeowner. This is the honest-AI gate turned from a tax into a
  win. **No schema change** — `caption` is already nullable and already drafted live.

---

## 3. v1 capture flow: one deliberate "Share with owner" surface

v1 ships **one** door: a deliberate, calm **Share with owner** surface (not the chat chip — see §6).

```
Contractor: open "Share with owner"  ─►  multi-select / capture a burst
   ─►  one strip: each photo gets a ONE-TAP room (AI-pre-filled) ; milestone inferred (never asked)
   ─►  tap "Share"  ─►  photos publish instantly (caption=None) via POST /api/v1/publish/photo (loop, zero re-upload)
   ─►  AI caption appears per-photo as a dashed pending suggestion: ✓ send / tap-to-fix / ignore
   ─►  homeowner sees them immediately ; contractor sees a "shared ✓" management list (unshare / edit / pin)
```

- **Bundle as a verb, rows as the unit.** The contractor's mental act is "share today's photos" (one
  decision, not N), but storage stays **per-photo** — the "day"/burst is a **read-side grouping only**
  (a view over per-photo rows), so per-photo unshare/edit/pin stay authoritative and never desync.
- **Contractor management view** ("Album"): the same `published_photos` for this site with Feed /
  By Room / By Milestone groupings + per-photo **edit caption** / **unshare** (soft-delete) /
  **pin-as-hero** (`is_starred`), and a contractor-only **"shared by [name]"** audit line. Reads a new
  contractor-scoped `GET /api/v1/publish/photos` (not the `require_homeowner` endpoint).

---

## 4. Room tagging (the unglamorous load-bearing change)

The "State of your home" per-room strip is only as honest as its weakest `Unsorted` photo, and
`room_tag` is nullable + frequently null today (`homeowner_feed.py:71`).

- Room is **AI-pre-filled** from vision `room_hint` **and** must be **confirmed with one tap** from
  *this site's* Space list (never blind-applied — vision is a Fake).
- Skipping is **friction-ed, not hard-blocked**: a true **"Unsorted"** escape remains for the genuinely
  unknown shot.

---

## 5. Homeowner receive-first experience (Phase 2)

- **"State of your home" landing** — one hero photo + one numeric-guarded sentence (in her language)
  + a glanceable per-room progress strip + a "**X new this week →**" affordance. Quiet days are
  **narrated** ("next photos expected ~14 Jun"), never a blank grid. The full gallery + chips survives
  **fully intact as an archive** behind a tap-through (demote, don't delete — some owners want to hunt
  every rebar photo). Mostly a **read-side aggregator** over `/home` + recent photos; **no new write
  path, no new contractor action.**
- **"Photos shared this week · last on [day]" heartbeat** — a non-editorial **count** over
  `published_photos`, so silence is legible as "slow day," not "hiding." **Zero new content crosses the
  membrane.** Soften the empty/low state ("Your builder is heads-down on site") and fire the
  contractor under-share nudge **before** the homeowner count reads negative, so it never manufactures
  the anxiety it's meant to dissolve.
- **"Request a photo of [room]" pull door** — a homeowner CTA prefills a `HomeownerRequest` titled
  "Photo of [room]". `POST /api/v1/publish/photo` accepts an optional **`request_id`**; a crew photo
  that answers it **auto-closes** the request and pushes "Here's your kitchen." She pulls; a human
  still pushes — the gate is untouched. ~1 endpoint param + 1 CTA, reusing `notify_site_homeowners`.

---

## 6. What we deliberately deferred / cut (and why)

| Cut from v1 | Why | Disposition |
|---|---|---|
| **In-chat "Show owner?" chip as the primary door** | No contractor publish UI exists today, so it's net-new either way; a one-tap "send to client" control inside the venting multi-role crew thread is the **highest-leak** build, not the cheapest. | **Fast-follow**, owner-only, *after* the deliberate surface + `deleted_at` unshare are pilot-proven. |
| **"Undo window" after share** | Needs deferred client/server push that collides with the offline-outbox machinery that has bitten this team before; the gate already prevents the only *catastrophic* failure (wrong text). | Deferred; per-photo unshare covers the obvious-wrong-frame case. |
| **Any-crew one-tap publish as default** | One-tap + multi-role + venting chat = off-brand/leak photos to an anxious client with only after-the-fact unshare. | **Owner-only by default**; "shared by [name]" audit + an owner toggle to widen later. |
| **Global opt-out auto-publish** ("everything flows, contractor vetoes") | Breaks the honest-AI gate (silent failure), ships *other crew's* mistakes by default, offline-veto race on low-end Android, and the junk filter it needs is a no-op (vision is Fake). | Rejected. |
| **Raw-by-default site stream** | No image-content membrane exists (vision returns no leak signal); first laborer face / vendor bill kills the channel. | Rejected; psychological payload delivered via the heartbeat instead. |
| **Nightly AI auto-curate** | Needs perceptual dedup + a veto-expiry table and reverses the gate; a misclassified crack-as-defect manufactures the dispute the feed exists to prevent. | Rejected. |

---

## 7. Locked decisions — updated

| # | Decision | Choice | Change vs first draft |
|---|----------|--------|------------------------|
| 1 | v1 capture door | **One deliberate "Share with owner" surface** + a contractor management/album view | Chat "Share to feed" chip **deferred** to fast-follow (was a co-equal v1 door) |
| 2 | Who can share | **Owner-only by default**, widenable via an owner toggle | Was "any crew role" — narrowed for leak safety; audit + toggle preserve the intent |
| 3 | Unshare | **Soft-delete** (`deleted_at`) with audit | unchanged; needs the migration |
| 4 | AI pre-fill | **Advisory only** (caption draft + room_hint), one-tap confirm; never a gate | strengthened: vision is a Fake → never auto-applied |
| 5 | Drafts | **No draft tray** — capture → share | unchanged |
| 6 | Manage rights | **Owner all; crew own** | unchanged |
| 7 | **Photo vs caption** | **Decoupled** — photo ships `caption=None` instantly; caption is a separate one-tap | **NEW (keystone)** |
| 8 | **Homeowner consumption** | **Receive-first** ("State of your home" + heartbeat + pull); gallery demoted to archive | **NEW** |

> Items #1 and #2 change founder-locked choices; they are the inversion pass's strongest, best-justified
> recommendations. Flagging explicitly — easy to revert either if you'd rather keep the original.

---

## 8. Data model & API

### Migrations (additive; **two**, both genuinely new)
On `published_photos`: add nullable **`deleted_at`** (timestamptz — soft-delete/unshare) and
**`source_chat_message_id`** (UUID FK `chat_messages.id` — dedup + audit when the chat door ships).
*(`media_sha256` may be added alongside `source_chat_message_id` when the chat door lands; v1's
deliberate-capture path can compute it on upload.)*

### New endpoints
- `POST /api/v1/publish/photo/enrich` — advisory pre-fetch of `{caption_draft, room_hint, milestone_guess}`; async, non-blocking, **nothing persisted**. Sheet works without it.
- `DELETE /api/v1/publish/photo/{id}` — **soft** unshare (sets `deleted_at`); RBAC owner-any / crew-own.
- `PATCH /api/v1/publish/photo/{id}` — edit caption / room / pin; RBAC owner-any / crew-own.
- `GET /api/v1/publish/photos` — contractor-scoped album feed (site-scoped; shows hidden flagged for management).
- **Homeowner**: `GET /api/v1/homeowner/home/state` (or extend `/home`) — read-side "State of your home" aggregator; a `POST` to create a "Photo of [room]" `HomeownerRequest`.

### Changed behaviour
- `POST /api/v1/publish/photo`: accept optional **`request_id`** (auto-close the matching
  `HomeownerRequest` + push). Persist `source_chat_message_id` when promoting a chat photo (later door).
  Keep the existing live-`draft_caption` gate exactly.
- Homeowner read paths (`/photos`, `/home`, state aggregator): **exclude `deleted_at IS NOT NULL`**.

### Reused (no change)
`PublishedPhoto`, the core `publish_photo` (incl. the honest-AI gate), presign/media upload,
`_photo_out`, milestone bucketing (extract to a shared helper so both sides agree), `caption_photo` /
`draft_caption` (advisory), `render_text` translation, `notify_site_homeowners`, `HomeownerRequest`
+ its nudge sweep, `/home` + `draft_weekly_summary`, storage helpers + offline outbox.

---

## 9. RBAC

| Action | Owner | Crew | Homeowner |
|--------|-------|------|-----------|
| Share via the deliberate surface | ✅ | ✅ (publish) | ❌ |
| Send/confirm AI caption (one-tap) | ✅ | ✅ own | ❌ |
| Edit / unshare / pin | ✅ any | ✅ own only | ❌ |
| In-chat "Show owner?" chip (fast-follow) | ✅ default | ⚙️ via owner toggle | ❌ |
| Request a photo of [room] | — | — | ✅ |
| See homeowner feed / "State of your home" (no contractor metadata, `deleted_at` excluded) | ✅ | ✅ | ✅ |

---

## 10. Edge cases

| Case | Handling |
|------|----------|
| Wrong AI caption | Impossible to silently cross: photo ships `caption=None`; caption only crosses on an explicit one-tap confirm. |
| Vision slow / down / **Fake** | Sheet opens immediately with empty caption + date-bucketed milestone; room pre-fill is advisory + must be tapped; publish never waits on vision. |
| Same photo shared twice | `media_sha256` dedup no-op + "already in the feed" (when the chat door + `source_chat_message_id` land; v1 deliberate capture computes the hash on upload). |
| Homeowner "My visits" photos | Separate `homeowner_visit_photos` table; never read/written by contractor sharing. |
| Batch partial failure | Per-photo publish; report "k of N"; failures stay with a retry chip. |
| Unshare after homeowner saw it | `deleted_at` soft-delete → vanishes from her feed, history kept; cadence-gated push means most unshares precede the notification. |
| Heartbeat reads accusatory to a real pilot contractor | Soften empty/low copy ("Your builder is heads-down on site"); fire the contractor under-share nudge before the homeowner count reads negative. |
| Request answered by an unrelated photo | `request_id` is set explicitly by the contractor from the request context, not inferred. |

---

## 11. Sequencing (for the implementation plan)

1. **Phase 1 — Core bridge (must ship first):** `deleted_at` + (optional) `source_chat_message_id`
   migration · the deliberate **Share with owner** surface (burst select → one-tap room → share) ·
   **photo/caption decouple** with the pending-suggestion confirm · contractor **album/management**
   view (`GET /publish/photos`, `DELETE`, `PATCH`) · exclude `deleted_at` from homeowner reads.
2. **Phase 2 — Homeowner receive-first:** "State of your home" aggregator + landing re-layout (gallery
   → archive) · "photos shared this week" heartbeat + softened low state · **Request a photo of [room]**
   (`request_id` on publish + CTA).
3. **Fast-follow:** in-chat **"Show owner?"** chip (owner-only) on top of the proven gate + dedup ·
   contractor under-share nudge.
4. **v2 delight (do not block):** per-room **before/after slider** (first), then time-lapse, Sunday
   digest, milestone celebration, reactions, Hindi voice captions, AI pre-sort **when a real vision
   provider is wired**.

---

## 12. Open items for the plan

- Confirm the exact current `require_*` dependency on `POST /api/v1/publish/photo` before setting
  owner-default RBAC + the widen toggle.
- Decide module location for the extracted milestone-bucketing helper (shared by contractor-suggest +
  homeowner read).
- Confirm `/home` field shapes the "State of your home" aggregator needs vs a new endpoint.
- Contractor-app nav placement of the Share surface + album (which role tabs surface it).
- Whether `media_sha256` is computed on v1 deliberate-capture upload (no source chat row).
