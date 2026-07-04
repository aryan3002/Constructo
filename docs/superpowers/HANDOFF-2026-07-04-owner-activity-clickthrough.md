# HANDOFF → Codex: Owner Activity Click-Through & Chat Provisioning

**Date:** 2026-07-04 · **Branch:** `feat/owner-activity-clickthrough` (off `main` @ `4ab6b48`)
**Status:** 3 of 8 tasks done & committed green. Tasks 4–8 remain (all frontend). Stop point was mid-plan by request.

This doc is self-contained. Read it top to bottom, then execute Tasks 4–8 from the plan.
Authoritative task specs (exact code per task) live in:
- **Plan:** `docs/superpowers/plans/2026-07-04-owner-activity-clickthrough.md`
- **Design spec:** `docs/superpowers/specs/2026-07-04-owner-activity-clickthrough-design.md`

---

## 1. Why this work exists (the problem)

The Owner web app (`app.neev.convoaiservices.com/owner`, React+TS+Vite in `constructo/web`)
shipped an "activity-first" front page (PR #240, live). It renders, but it is **not useful**
because every click dead-ends and new projects never reach chat. Two root causes, verified in code:

1. **Dead-end clicks.** `/chat` is param-less (`web/src/App.tsx:174`, `path="/chat"`, no `:id`) and
   `ChatPage` initializes `selectedConv = null` with **zero** URL/state reading — desktop always shows
   the literal "Select a conversation" empty pane. The activity feed sent photo rows and "Reply in chat"
   straight there.
2. **A new project never gets a chat room.** `POST /sites` created only a `Site` row; the chat inbox
   (`GET /chat/conversations`) lists only sites that already have a `Conversation`, which was created
   *lazily on first message send*. So a brand-new project (incl. a new owner's first) was invisible in chat.
3. (Minor) The cold-start `SetupChecklist` had no "add project" action.

**The fix is structural, not per-row:** a `/chat` deep-link contract + eager conversation provisioning
+ a shared homeowner-channel opener. It therefore works for every owner and every current/future item,
cold start included. That generality was an explicit user requirement.

**User decisions (locked):**
- Full "useful pass" (deep-link + scroll-to-message + new-project-instant + better request rows + cold start).
- Homeowner-request **"Reply in chat" opens the project's homeowner 1:1 channel** (not the crew thread).

---

## 2. What is DONE (committed on the branch — do NOT redo)

| Task | Commit | What it did |
|---|---|---|
| **Task 1** (backend) | `075e34e` | `POST /sites` now **eager-creates the site `Conversation`** (`kind=site`) in the same transaction (`session.flush()` → build `Conversation` → commit). New project shows in the owner's `GET /chat/conversations` immediately. Test in `constructo/backend/tests/sites/test_sites.py::test_create_site_provisions_crew_chat_conversation` (HTTP-only: create site → assert it appears once as a site thread in the inbox). **30 sites tests pass, ruff clean.** |
| **Task 2** (backend) | `28952d1` | `ActivityLink` gains optional **`scroll_message_id`** (a `feed_photo`'s `PublishedPhoto.source_chat_message_id`); homeowner-request activity items now carry **`subtitle = request.detail`**. Files: `app/activity/schemas.py` (`ActivityLinkOut.scroll_message_id: str | None = None`), `app/activity/aggregate.py` (`_item` **omit-when-None** link key, `_map_photo`, `_map_request`). Tests in `tests/test_activity_aggregate.py` (fakes `_photo`/`_request` extended + 3 new tests). **13 aggregate tests pass.** |
| **Task 3** (web) | `7847df8` | `ChatThread` gains `scrollToMessageId?: string` — a best-effort `useLayoutEffect` that scrolls `[data-msgid="<id>"]` into view once and suppresses the bottom-autoscroll while a target is pending (`pendingScroll`). No-op (never throws) when the id isn't loaded. Files: `web/src/features/chat/ChatThread.tsx` (+ `.test.tsx`). **Build green, 17 ChatThread tests pass.** |

**Contract facts these established (Tasks 4–8 depend on them):**
- Every activity item already carries `site_id` and `link.type`; `feed_photo` links now also carry
  `link.scroll_message_id` (string or, in the serialized API, `null` — Pydantic fills the default even
  though the aggregate dict omits it when None). The current web `ActivityLink` type does NOT yet type
  this field — **Task 6 adds it**. Extra JSON fields are ignored at runtime, so the branch stayed green.
- `ChatThread` will scroll to a message if you pass `scrollToMessageId`.

---

## 3. What REMAINS — Tasks 4–8 (all frontend; follow the plan for exact code)

Execution order: **4 → 5 → 6 → 7 → 8** (5 consumes 3; 6+7 consume 4; 8 is edited after 6). Each is one
commit; keep the branch green (build + the task's vitest) before committing.

- **Task 4 — chat API + hook to open the homeowner channel.**
  - `web/src/api/chat.ts`: add `openHomeownerChannel(siteId): Promise<ConversationSummary>` →
    `POST /api/v1/chat/homeowner-channel` with body `{ site_id }`. (Backend `open_homeowner_channel`
    already exists and returns a `ConversationOut` whose JSON shape == `ConversationSummary`.)
  - New `web/src/features/chat/useOpenHomeownerChannel.ts`: a `useMutation` that calls the API and, on
    success, `invalidateQueries(['chat','conversations'])` then `navigate('/chat?conversation=<id>', { state: { conversation } })`.
  - Test the hook (mock `chatApi` + `useNavigate`).

- **Task 5 — ChatPage deep-link resolution + auto-select.** `web/src/features/chat/ChatPage.tsx`.
  - Read `useSearchParams()` (`site`, `conversation`, `msg`) + `useLocation().state.conversation`.
  - Run the SAME query as ChatInbox: `useQuery({ queryKey: ['chat','conversations'], queryFn: chatApi.conversations })`
    (**G2: reuse this exact key — React Query dedupes; do NOT invent a new key**).
  - Effect: if `state.conversation` present → select immediately; else resolve `?conversation=` / `?site=`
    against the loaded list; else (bare `/chat`, desktop `window.innerWidth >= 768`) auto-select the
    most-recent conversation (`conversations[0]`, server-sorted newest-first).
  - Pass `scrollToMessageId={msg ?? undefined}` into `<ChatThread>`. While a param is present but
    unresolved, render a spinner (not the empty state).
  - Tests: `?conversation=`, `?site=`, `state.conversation` fast-path, bare `/chat` auto-select, `msg` → prop.

- **Task 6 — repoint the activity feed clicks.**
  - `web/src/api/activity.ts`: add `scroll_message_id?: string | null` to `ActivityLink`; add a
    `scroll_message_id` to the mock `feed_photo` item.
  - `web/src/features/owner/ActivityStream.tsx`: change `linkFor` to take the **item** (not just the link):
    `feed_photo` → `/chat?site=<site_id>&msg=<scroll_message_id?>`; `request` stays `/requests`; others unchanged.
    **G1: update the call site `to={linkFor(item)}` in the same task or the build breaks.**
  - `web/src/pages/owner/OwnerHome.tsx`: `handleReply(item)` → `useOpenHomeownerChannel().mutate(item.site_id)`
    (drop the old `navigate('/requests')`; drop the now-unused `navigate` import if unused).
  - Update `ActivityStream.test.tsx` + `OwnerHome.test.tsx` (the OwnerHome test currently asserts
    `handleReply → navigate('/requests')` — change it to assert the hook is called with `item.site_id`).

- **Task 7 — RequestsView Reply → homeowner channel.** `web/src/features/requests/RequestsView.tsx`.
  - Replace `openReply = () => navigate('/chat')` with `useOpenHomeownerChannel()`; thread the **row**
    into the reply so it knows `site_id` (change `RequestRow`/`Group` `onReply` to `(r: RequestOut) => void`,
    button `onClick={() => onReply(r)}`). Update `RequestsView.test.tsx`.

- **Task 8 — new project reaches chat instantly + actionable cold start.**
  - `web/src/features/owner/NewProjectModal.tsx`: in the create `onSuccess`, ALSO
    `qc.invalidateQueries({ queryKey: ['chat','conversations'] })` (it already invalidates
    `qk.sites()/qk.activity()/qk.activitySummary()`).
  - `web/src/pages/owner/SetupChecklist.tsx`: add optional `onAddProject?: () => void`; for the
    `add_project` (not-done) step render a button that calls it. New i18n key
    `owner.setup.add_project_cta` in **both** `en.ts` AND `hi.ts`.
  - `web/src/pages/owner/OwnerHome.tsx`: own one `NewProjectModal` for the cold-start path; pass
    `onAddProject={() => setShowNewProject(true)}` to `SetupChecklist`. (ProjectsStrip keeps its own modal
    for the populated view; `cold_start` is exclusive so they never co-render — verify.)
  - Update `NewProjectModal.test.tsx`, `SetupChecklist.test.tsx`, `OwnerHome.test.tsx`.

After Task 8: run the FULL suites (backend + web), do a whole-branch review, then open the PR.

---

## 4. Gotchas & confirmed facts (things that cost time — heed them)

- **Web verification = `npm run build` (tsc -b, strict), NOT `npm run lint`.** `npm run lint` is
  `tsc --noEmit` and is *weaker* than the project-refs build that CI/Vercel run. Neither script runs ESLint,
  so `react-hooks/exhaustive-deps` warnings don't fail anything.
- **`hi.ts` is a FULL `Record<TranslationKey, string>`.** Any new `t()` key MUST be added to BOTH
  `web/src/i18n/en.ts` and `web/src/i18n/hi.ts`, or `tsc -b` fails (Task 8 adds one key).
- **jsdom has no `scrollIntoView` (or other scroll methods).** You CANNOT `vi.spyOn(HTMLElement.prototype,
  'scrollIntoView')` — it throws "scrollIntoView does not exist". **Assign** a mock instead:
  `HTMLElement.prototype.scrollIntoView = vi.fn(...) as unknown as typeof HTMLElement.prototype.scrollIntoView`
  (see the Task 3 tests for the working pattern). This bit us — the branch briefly committed red.
- **The shell here is zsh.** Bash-isms like `${PIPESTATUS[0]}` do NOT work (zsh uses 1-indexed
  `$pipestatus`). Capture exit codes with `cmd > logfile 2>&1; RC=$?` (works in both). A `${PIPESTATUS[0]}`
  check silently returned empty and `[ "" -eq 0 ]` was truthy under zsh — it committed a red test. Use `$?`.
- **React Query v5 sibling keys don't partial-match.** `['activity', null]` does NOT invalidate
  `['activity','summary']`. `NewProjectModal` already dual-invalidates both; if you touch activity keys,
  keep that. And `['chat','conversations']` is a distinct key you must invalidate explicitly (Tasks 4 & 8).
- **Owner CAN access a homeowner conversation** (`backend/app/chat/access.py:44`: non-homeowner allowed if
  `conversation.site_id ∈ effective_visible_site_ids`; owner sees all company sites). So the Task 6/7
  request→homeowner-channel flow will NOT 403 the owner. (The previous feature had a "homeowner-gated
  endpoint 403s owners" trap — this path is clear; a quick owner-token integration check is still wise.)
- **G1 (Task 6):** `linkFor` changes from `(link)` to `(item)` — update its call site `to={linkFor(item)}`.
- **G2 (Task 5):** `ChatPage` must reuse `['chat','conversations']` (same key as `ChatInbox`).
- **G4 (Tasks 6 & 8):** both edit `OwnerHome.tsx`; do 6 before 8.
- Chat is **inbox-centric by design** — do NOT add a site switcher to `/chat` (ChatPage renders
  `AppShell` without the `sites` prop on purpose). Provisioning (Task 1) is what makes new projects appear.
- **No DB migration** in this whole feature (the `conversations` table already exists; `scroll_message_id`
  is API-only).

---

## 5. Environment & verification commands

**Backend** (needs local Postgres 17 + pgvector on **:5433**, which is up; use the venv Python — system
python lacks deps):
```bash
cd constructo/backend
.venv/bin/python3 -m ruff check <files>
.venv/bin/python3 -m pytest tests/<path> -q          # per-task
.venv/bin/python3 -m pytest -q                        # full suite before PR
```
Baseline: **7 pre-existing WeasyPrint PDF `OSError` failures are expected** — they are the ONLY acceptable
reds; anything else is a regression.

**Web:**
```bash
cd constructo/web
npm run build                                          # tsc -b — the real gate
npx vitest run src/<path>.test.tsx                     # per-task
npx vitest run                                          # full suite before PR
```

**Git:** branch is `feat/owner-activity-clickthrough`; commit per task; keep it green at every commit.

---

## 6. After the code is done

1. Full backend + web suites green (baseline caveat above).
2. Whole-branch review — focus lenses: the ChatPage deep-link **resolution race** (param present but
   conversation not yet in the list → must show a spinner, never a wrong/empty selection); owner access to
   the homeowner channel (no 403 regression); the `linkFor` signature change call site (G1); bare `/chat`
   and the existing chat tests unbroken.
3. Open the PR against `main`.

**Deploys after merge (both are needed this time):**
- **Web → Vercel:** auto-deploys on merge to `main` (that is how PR #240 shipped). Verify the live site.
- **Backend → Azure Container App:** Tasks 1 & 2 change the backend, so a redeploy IS required for
  "new project → chat conversation" and the activity `scroll_message_id`/subtitle to go live. Recipe used
  last time (preserves env/secrets/ingress/scale; `.dockerignore` keeps `.env` out of the image):
  ```bash
  az acr build --registry caba0a11e1f1acr --image constructo-api:main-<sha> constructo/backend
  az containerapp update -n constructo-api -g constructo-rg --image caba0a11e1f1acr.azurecr.io/constructo-api:main-<sha>
  ```
  App: `constructo-api` / `constructo-rg`, region **East US**. Verify `/healthz` 200 and
  `/api/v1/chat/conversations` etc. respond. No migration to run.

---

## 7. Quick file map (the surfaces you'll touch)

- `web/src/App.tsx` — routes (`/chat` is param-less today; the deep-link is via query string, no route change needed).
- `web/src/features/chat/ChatPage.tsx` — deep-link resolution (Task 5).
- `web/src/features/chat/ChatInbox.tsx` — reads `['chat','conversations']` (reference for G2).
- `web/src/features/chat/ChatThread.tsx` — `scrollToMessageId` (DONE, Task 3).
- `web/src/api/chat.ts` — add `openHomeownerChannel` (Task 4).
- `web/src/features/chat/useOpenHomeownerChannel.ts` — NEW hook (Task 4).
- `web/src/features/owner/ActivityStream.tsx` — `linkFor` (Task 6).
- `web/src/pages/owner/OwnerHome.tsx` — `handleReply` (Task 6) + cold-start modal (Task 8).
- `web/src/features/requests/RequestsView.tsx` — Reply (Task 7).
- `web/src/features/owner/NewProjectModal.tsx` — invalidate chat inbox (Task 8).
- `web/src/pages/owner/SetupChecklist.tsx` — actionable add_project (Task 8).
- `web/src/api/activity.ts` — `ActivityLink.scroll_message_id` type + mock (Task 6).
- Backend (DONE): `app/sites/router.py`, `app/activity/{aggregate,schemas}.py`.

Backend contract references (read-only for context): `app/chat/router.py` (`list_conversations` ~L1242,
`open_homeowner_channel` ~L1310, `_get_or_create_homeowner_conversation` ~L341), `app/chat/access.py`.
