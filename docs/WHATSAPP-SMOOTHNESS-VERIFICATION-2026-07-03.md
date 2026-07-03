# WhatsApp-Smoothness — Waves A–D Verification + Next Steps (2026-07-03)

**What was verified:** main @ `a65f736` (Wave A `aaef120` + Waves B/C `7c69107` + Wave D `10a3e61` / PR #237), against `docs/WHATSAPP-SMOOTHNESS-PLAN-2026-07-02.md`. Method: 3 independent code-verification agents (one per wave, item-by-item with file:line evidence) + full test suites + a live browser smoke of the web chat.

**Test evidence (all run on merged main):**
- Mobile: `tsc --noEmit` clean · jest **287/287** pass
- Web: vitest **715/715** pass · `npm run build` (strict tsc -b, the CI/Vercel one) clean
- Backend: `ruff check` clean · pytest **1391 pass** / 7 fail — all 7 are the known local WeasyPrint/gobject `dlopen` environment failures in `test_reports_pdf.py` (pre-existing, unrelated)
- Live web smoke (local backend + vite): login → create group → open thread → **3 rapid Enter-sends in ~360ms**: composer cleared instantly each time, focus retained, all 3 rendered in order, ticks appear, no console errors. Inbox refetches on the new 5s cadence.

## Scoreboard

| Wave | Verdict |
|---|---|
| A — mobile chat core (mine) | ✅ 100% (all items verified in earlier pass) |
| B — web chat | ✅ 9/9 done (1 item with two *minor* scroll-restore edge notes) |
| C — nav/keyboard/feedback/screens | 17 done · 4 done-with-concerns · 1 partial → **one blocker-grade concern (P0-2)** |
| D — media polish + deferred extras | Mixed: viewers/typing/inbox/HoldToTalk/markup/SettleBar shipped, **but 2 plan items unfinished, 3 real bugs introduced** |

The extra deferred items (typing indicator, live WS inbox) were implemented **well on the security side** — the backend relays typing only for access-validated subscriptions, `user_id` is server-derived, no DB writes, client throttles to 1 frame/3s with 4s auto-expiry.

---

## P0 — fix BEFORE device/pilot testing (each is small)

1. **Owner app shows a visible 6th "chat-viewer" tab.** None of the three layouts registers the new `chat-viewer` route with `href: null`; homeowner + supervisor are saved by their custom tab bars, but the owner layout uses the stock bar. Fix: add `<Tabs.Screen name="chat-viewer" options={{ href: null }} />` to `app/(contractor)/owner/_layout.tsx` (and, for hygiene, the homeowner + supervisor layouts too). This is the exact Expo-Router tab-route gotcha already in the repo's memory.

2. **Re-opened chat threads can go silently dead to live messages.** The inbox screens subscribe/unsubscribe every conversation on focus/blur with **no refcounting** (`app/(homeowner)/messages.tsx:126`, `owner/_chat_inbox.tsx`), so the inbox's blur-unsubscribe can kill the sub of the thread you just opened; the thread only survives first-open by an async timing accident (`useChatThread.ts:679`). Combined with P0-3's poll gate, a lost sub freezes the thread. Fix: before unsubscribing a conv in the inbox cleanup, skip ids that have registered frame handlers (the module-level `frameHandlers` map in `useChatThread.ts` already knows), or add a refcount to `ChatSocket.subscribe/unsubscribe`.

3. **Reconnect gap-loss: messages that arrive while the socket is down are never fetched.** New poll gate `if (socket.isLive && urlsRefreshed.current) return loadThreadCache(...)` (`useChatThread.ts:392-394`) neuters the new `sub_ok` backfill (`useChatThread.ts:658-664`): sub_ok invalidates, but the refetch hits the gate and returns stale cache. One-line fix: in the `sub_ok` branch set `urlsRefreshed.current = false` before `invalidateQueries` (forces one real fetch).

4. **Homeowner tap-to-view is dead code.** `app/(homeowner)/chat-viewer.tsx` exists but `messages/[id].tsx` never passes `onPressAttachment` — tapping a photo in the homeowner room still does nothing. Fix: wire it exactly like `owner/chat/[id].tsx:450`.

## Product decision needed (before pilot)

- **Typing indicator in the homeowner room runs BOTH directions** — the contractor sees "homeowner is typing" live. `docs/CHAT-RELIABILITY-DESIGN.md` locks that room to "delivered only, never read — no surveillance pressure"; a live typing signal is that pressure in sharper form. Options: (a) keep both directions, (b) homeowner sees contractor typing but not vice-versa (calm-cockpit-consistent), (c) crew rooms only. The gating is one condition in each screen; decide policy first.

## P1 — unfinished plan items

- **Photos feed virtualization — NOT done** (`photos.tsx:763` still `.map()` in a ScrollView; `visiblePhotos` chain un-memoized). The BlurUpImage→expo-image swap softened the media cost, but mount cost still grows linearly with the album.
- **Photos screen spinners — NOT swapped**: raw `ActivityIndicator` remains for Feed / My-visits / grid loading states (`photos.tsx:674`, ~1229, ~1258) — the last doctrine violations on a flagged daily screen.
- **Viewer placeholders**: the new chat-viewers and the photos lightbox (`photos.tsx:1409`) have zero loading/error handling — an expired presign opens a permanently blank screen. Reuse the BlurUpImage pattern (it now has onError + tap-to-retry, done well).
- **Supervisor crew chat has no typing UI/sender** (owner + homeowner got it).
- **Homeowner builder-channel unread badge stays stale**: the live-inbox handler invalidates group rows but never `['homeowner','channel',siteId]` (`messages.tsx:74-79`, `staleTime: Infinity`).
- **Push deep-link taps don't invalidate the target screen's queries** (`_layout.tsx:141-152`) — banner-tap while foregrounded can land on stale data.

## P2 — polish, hygiene, tests

- Web loadOlder: double-click guard + height-capture race (two minor cases, `ChatThread.tsx:171`, `:163`).
- `typingTimer` not cleared on unmount (`useChatThread.ts:670`); inbox debounce timer not cleared on blur.
- PhotoMarkupCanvas: side effects inside setState updaters (`PhotoMarkupCanvas.tsx:147-176`) — a StrictMode landmine; refactor to effects/refs.
- Ask auto-scroll fires on every content change (yanks a scrolled-up reader) — gate on session growth as the plan specified.
- Delivered cursors still only advance with a thread open (inbox subscribers don't `markDelivered`) — ✓✓ lags in-session; acceptable, but decide.
- **Tests to add:** backend WS typing relay (membership gating!), socket sub refcount behavior, sub_ok→refetch integration. Wave D shipped with zero new tests.
- **Cleanup:** `docs/HANDOFF-WEB-2026-06-22.md` was accidentally swept into commit 10a3e61 — it's a stale June-22 handoff (its own text warns about `git add -A`); delete or archive. The local dev DB has my "Smoothness smoke test" group (harmless).

## After that — what's genuinely next

1. **Device pass on real hardware** — the whole point of the exercise. Wave A+C feel (haptics, keyboard, transitions, anchored scroll) can only be judged on a phone; test on a mid-range Android especially.
2. **Remaining deferred items** (unchanged from the plan): pinch-zoom (needs gesture-handler — decide if worth the dep), background delivered-cursors/push receipts, socket pong-timeout, splash/BenchmarkMark native-driver.
3. **Then back to the roadmap:** this polish pass is done pending P0s — the binding constraint from the competitive-position audit is still *zero arm's-length users*; smoothness was a prerequisite, not the goal.
