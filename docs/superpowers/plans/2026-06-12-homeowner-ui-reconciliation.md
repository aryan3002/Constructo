# Plan 2 — Homeowner UI Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Use the `constructo-homeowner-design` skill (Calm Cockpit) for all visual work. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the whole "Neev — Homeowner App" prototype UI on the existing "Calm Cockpit" / `daylight` design system — reconcile the ~90%-wired existing screens to the prototype's refined design, and build the net-new screens.

**Architecture:** Additive reconciliation, not a re-theme (the prototype already uses the same tokens). Extract a shared-kit wave first, then wire net-new real-data flows, then reconcile the big existing screens, then polish. "Converge, don't amputate" — append prototype modules rather than replacing the app's more-advanced screens.

**Tech Stack:** Expo Router, React Native, `src/theme` (daylight), `src/ui` kit, `src/chat` kit. Plan 2 of the Design Profiler program (companion to Plan 1 — the engine). Most of this is **independent of Plan 1**; Plan-1-blocked items are marked **[P1]**.

> Source: produced by a read-only research pass over `~/Downloads/Neev` (prototype), `constructo/mobile/app/(homeowner)/*` + `src/theme` + `src/ui` + `src/chat` (existing), and the two `vault/02-Product/Homeowner App - *.md` specs.

---

## 0. Source-of-truth map (what is what)

| Concept | Prototype (target) | Existing app | Status |
|---|---|---|---|
| Router/shell | `src/app.jsx` — stack + 5-tab `BottomNav` (Home·Media·Chat·Updates·Design) + `AskFab` + `AskSheet` + `Toast` | `app/(homeowner)/_layout.tsx` — 5 Tabs (home·photos·updates·messages·design) via `FloatingTabBar` + persistent `AskPill` | Reconcile nav labels/order |
| Tokens / CSS vars | `styles.css` (`--sand-*`, `--green/clay/amber/red`, `--r-*`, type helpers) | `src/theme/tokens.ts` (`DAYLIGHT_COLORS`, `TYPE`, `SPACE`, `THEMES.daylight.radii`) | Already equivalent — **no token work** |
| Components | `src/components.jsx` (Card, Button, Chip, StatusPill, TimeBar, Photo, QuietState, ListRow, LinkRow, SubTabs, SubHeader, Avatar, Toggle, Fab, Toast, AskSheet) | `src/ui/*` (Card, Button, StatusPill, DecisionCard, QuietState, PhotoTile, CalmCard, SettleBar, StatusCard, FloatingTabBar, AskPill, SettingsRow, EvidenceCard, ConfirmCard, NeedsYouCard…) | Reuse + add a small handful |

**Kit gaps to fill (used by many screens):** no shared `Chip`, `ListRow`, `SubTabs` (segmented control), `SubHeader` (pushed-screen back header), `Toggle`, or `Toast` in `src/ui` — each screen currently re-implements these inline. Extracting them is **Task Group A** and unblocks fidelity everywhere.

---

## 1. Design-system fidelity rules to preserve (apply to EVERY task)

1. **TimeBar, never %.** Position in time (Start → Handover, clay you-are-here marker) via `SettleBar`/`StatusCard`. Milestone strips use discrete sequence dots, never a numeric % or `ProgressRing` on a homeowner status surface.
2. **Real photos only.** `PhotoTile`/`EvidenceCard` bound to real `image_url`. The prototype's `Photo` is a placeholder only because the prototype has no assets. Never an AI/3D render.
3. **Status = colour + icon + word.** `StatusPill` (never colour alone). Prototype `STATUS` map → app `Status` union (§3).
4. **Single language per screen.** Each screen keeps its own `STR` en/hi table (deliberate WIP pattern). Render backend strings as-is.
5. **Calm tone.** Red ONLY for genuine delay/risk. Amber = "needs you" choice, never risk. Clay = celebration/milestone. Quiet = grey. Honest placeholders over fabricated data.
6. **No emoji in chrome** (Feather icons only); ≥48px targets; ≥14px text; respect reduced motion.

### Trust-membrane / data-model conflicts to flag (decisions, not just code)
- **Payments / money to the homeowner.** Prototype shows a Home `PaymentsCard` + a full Payment-schedule screen with ₹ amounts. The homeowner backend has **NO payments endpoint**; the cost firewall is currently structural (`finishes` strips pricing; `changes` shows attributed deltas only). **Decision required:** does the membrane allow the homeowner to see absolute payment schedule + totals? Product/membrane call. **Recommendation:** build Payments against *mocked* data first (clearly flagged), reuse the change-attribution framing, gate real wiring behind a future `GET /homeowner/payments` + membrane sign-off. Do **not** surface absolute contract totals on Home until then.
- **Media Pin/Comment/Markup/Share** have no backend → local-or-honest-stub, never fake a server write. (Dismiss is already local + per-member + reversible.)
- **Decision approve / Issue report CAN be really wired** (`homeowner.decisions()`+`respondDecision`, `homeowner.createRequest()`+`uploadVisitPhoto`). **Drawing-approve stays an honest stub** until a drawings-approve endpoint exists.

---

## 2. Plan-1 (Design Profiler engine) dependency split

**Independent (ship anytime) — the bulk:** Home, Media/Photos, Updates (Timeline/Milestones/Changes/Property), Chat, Settings, Members, Notifications, Storage, Requests, Decision flow, Issue-report flow, Drawing-approval (stub), the Design *hub shell* (Plans + Selections + References + existing AI-profile read).

**Depends on Plan 1 [P1]:** the deep multi-step Design Profiler (`screen-profiler*.jsx` — hub, scope, contributors, per-area image ranking, preset packs, structured brief), and the rich `IntakeScreen`/`ProfileScreen` image-ranking intake. Reconcile only the *entry-point cards* now.

---

## 3. Status / token mapping (prototype → app)

| Prototype | App `Status` | Token | Use |
|---|---|---|---|
| `ontrack`/`done` | `ok` | `c.ok`/`c.accent` | on-track, completed, primary |
| `needs`/`pending` | `warn` | `c.warn` | "needs you" choice (amber) |
| `delay` | `risk` | `c.risk` | genuine delay ONLY |
| `quiet` | `quiet` | `c.quiet` | quiet period (grey) |
| milestone/eyebrow | — | `c.secondary`/`AP.clay` | celebration, you-are-here |
| blue accent | **drop** | — | app has **no blue**; re-tone prototype blue (e.g. Media "new since yesterday" pill) to neutral/clay |

---

## TASK GROUP A — Shared kit extraction (do FIRST, unblocks everything)

All theme-aware (work in both `neev` + `daylight`), in `src/ui/`, exported from `src/ui/index.ts`. Verify each with a snapshot test (follow `src/ui/money.test.ts`/`tokens.test.ts`) or a temporary uncommitted `_kit_preview.tsx` (`href:null`).

- **A1 · `Chip`** (segmented/filter pill) — `src/ui/Chip.tsx`. Replaces inline chips in `photos.tsx`, `updates.tsx`, `members.tsx`, `design/select.tsx`.
- **A2 · `SegmentedTabs`** — `src/ui/SegmentedTabs.tsx` from prototype `SubTabs`. Replaces hand-rolled segmented controls in `photos.tsx`, `updates.tsx`.
- **A3 · `ListRow`** — `src/ui/ListRow.tsx` (icon tile + title + sub + right slot + status dot + divider). Used by Home requests/activity, Settings, Members, Requests, Plans, Payments.
- **A4 · `SubHeader`** — `src/ui/SubHeader.tsx` (sticky back header). Standardizes pushed screens (todos, members, the new Decision/Issue/Drawing/Payments/Storage flows).
- **A5 · `Toggle`** — `src/ui/Toggle.tsx`. Replaces inline switches in settings/notifications/photos.
- **A6 · `Toast` + `useToast()`** — `src/ui/Toast.tsx`. Replaces `Alert.alert` for optimistic confirmations (calmer, on-brand). Auto-dismiss ~2.2s, reduced-motion-safe.
- **A7 · `LinkRow`** — text link + arrow. Used on Home cards, Activity, "See all".

---

## TASK GROUP B — HOME (reconcile) · independent

Existing `home.tsx` is the most polished, answer-first screen. **Do not regress the "You're okay." reassurance** — append the prototype's card modules below the answer/status block.
- **B1 · "Needs your input" multi-item** — extend beyond the single lead `DecisionCard` using `NeedsYouCard` over `home().needs_attention`, per-item route to Decision/Drawing.
- **B2 · Milestones summary strip** — collapsed strip → Updates/Milestones (reuse G2 strip; data `milestones()`).
- **B3 · "My requests" card** — real `requests()`, rows via `ListRow` → Requests (Task L), "Add" → Issue (Task K).
- **B4 · "Recent activity" card** — compact 3-row from `home().recent_activity` + `photos()` thumbs (keep ONE hero).
- **B5 · Payments card** — **GATED/membrane**; mock, behind flag, no absolute totals; → Payments (Task M).

---

## TASK GROUP C — MEDIA / PHOTOS (reconcile) · independent

Keep the real-data grid; **add a "Feed" view** (default landing). Segmented `[Feed · All · By room · By milestone · Mine]`.
- **C1 · Feed sub-view + ranked cards** — StandardCard, DecisionFeedCard (→ Decision flow J, real decisions), ProgressConfirmCard (reuse `ConfirmCard`; "Looks good"→`respondDecision(approve)`, "I see an issue"→Issue flow K), in-feed `QuietState` (bind `quietPeriods()`).
- **C2 · Per-card ActionBar** — Dismiss (existing local hide), Pin (local+toast), Share (`Share.share`), Comment (thread/stub), Markup (honest "coming soon"). Never fake server writes.
- **C3 · "N new" jump pill + "MB on device · Manage"** — re-tone blue→neutral/clay; "Manage" → Storage screen (Task N).
- **C4 · Move storage card OFF photos** — extract into the Storage screen (Task N); replace with the "· Manage" link.

---

## TASK GROUP D — CHAT (reconcile) · independent (respect in-flight `src/chat` kit)

Keep inbox (`messages.tsx`) + pushed thread (`messages/[id].tsx`) — do NOT collapse to a single thread. **Read `src/chat/MessageFeed.tsx`+`MessageView.tsx` before editing — in-flight kit.**
- **D1 · Participants header parity** (stacked `Avatar` cluster + presence dot + members shortcut).
- **D2 · Grouped bubbles + day separators** (align styling only).
- **D3 · In-bubble media thumbnails** (forward-looking render path).
- **D4 · Composer parity** (add mic as honest "coming soon").
- **D5 · Nav label** "Messages" vs "Chat" — copy decision.

---

## TASK GROUP E — DESIGN HUB (reconcile) · mostly independent, **[P1]** edges

Reorganize into `DesignProfileCard` banner + segmented `[Profile · Plans · Selections]`; keep the real wiring.
- **E1 · Design Profile banner** (→ profiler; **[P1]** deep destination).
- **E2 · Segmented tabs** via `SegmentedTabs` (Profile **[P1 for deep hub]** · Plans · Selections).
- **E3 · Plans tab + pending-approval card** — group by `Drawing.kind`, "Review" → Drawing flow (Task J/L), keep honest approve stub; real `drawings()`.
- **E4 · Selections tab** — per-room groups from `selections()`, pending → Decision flow.
- **E5 · Per-room References sub-screen** — new `design/references/[room].tsx` (`href:null`); real `designReferences()` + add via `references()`+`ImagePicker`; Sharing toggle = honest stub.
- **E6 · Intake / AI-profile result** — **[P1]**; route CTA there.

---

## TASK GROUP F — SETTINGS / MEMBERS / NOTIFICATIONS (reconcile) · independent
- **F1 · Settings** — add "Storage settings" row (→ Task N) + "Design taste intake" row; keep Language/Account/Sign-out.
- **F2 · Members** — invite chips via new `Chip`; keep capability-sentence framing.
- **F3 · Notifications** — delivery-method toggles via new `Toggle`; keep persisted `notif_prefs`.

---

## TASK GROUP G — UPDATES (reconcile) · independent

The app's Updates is excellent and fully wired; add flourishes only.
- **G1 · Weekly Summary sections** — keep the prose letter; add structured sections only when the backend returns structured fields (don't fabricate). Backend-dependent, low priority.
- **G2 · Milestone strip (compact)** — sequence dots (done=check, now=clay pulse, next=outline), no %; reused by Home B2; real `milestones()`.
- **G3 · Changes filter chips + approval footer** — client-side filter (All/By me/By contractor/Cost/No cost) via `Chip`; per-card "Approved by …"; keep honest owner-approval stub.
- **G4 · Timeline "Changes log" summary card** — switches segmented control to Changes in-screen.

---

## TASK GROUP H — NET-NEW FLOWS · independent (real endpoints exist)

All pushed routes (`href:null`), all using `SubHeader` (A4).
- **J · Decision detail** — `decisions/[id].tsx` (new). Real: `decisions()`+`respondDecision(approve|comment|request_change)`; AI style hint from `designProfile()`; optimistic Toast. Replaces the Home decision→`/requests` placeholder.
- **K · Issue-report (2-step)** — `issue.tsx` (new). Real: `createRequest()` + `uploadVisitPhoto()`; voice-note honest stub; reachable from Media/Home/Requests/Progress-confirm.
- **L · Drawing-approval** — `drawings/[id].tsx` (new). Real drawing render (`drawings()`); approve = honest stub; comment/request → stub or `respondDecision` if linked.

---

## TASK GROUP L2 — NET-NEW: REQUESTS LIST · independent (real)
`requests.tsx` (new, `href:null`). Real `requests()` → `ListRow` + `StatusPill` per `RequestStatus`; "Add" → Issue flow (K). Destination for Home B3.

---

## TASK GROUP M — NET-NEW: PAYMENTS · independent BUT membrane-gated
`payments.tsx` (new, `href:null`).
- **M1 · MOCK data first**, marked `// MOCK — pending membrane sign-off + GET /homeowner/payments`. Money via `MoneyCell`/`formatINR`.
- **M2 · Reuse change-attribution** — pull real `changes()` running totals so deltas are real.
- **M3 · TimeBar-over-money** via `SettleBar` (position, not %).
- **M4 · Gate on Home** — Home card (B5) + screen ship together behind one flag; no absolute totals before sign-off.

---

## TASK GROUP N — NET-NEW: STORAGE MANAGEMENT · independent
`storage.tsx` (new, `href:null`).
- **N1 · Extract from `photos.tsx`** — move the existing storage logic (`PhotoPolicy`, retention radios, keep toggle, `onFreeUpSpace`) into the dedicated screen; expand to the prototype layout (on-device/cloud bar + "Always keep" checkboxes); `Toggle` (A5).
- **N2 · Usage numbers** — on-device via `FileSystem`; cloud = honest estimate-or-"—" (don't fabricate GB).
- **N3 · Entry points** — Settings row (F1) + Media "· Manage" (C3).

---

## 4. Sequencing (fastest visible wins, lowest risk)

- **Wave 0 — Kit (Group A):** unblocks all; pure additive, snapshot-verifiable.
- **Wave 1 — Net-new, real-data, high value, low risk:** L (Requests) + K (Issue) + J (Decision) + N (Storage). Biggest functional jump, no regression risk.
- **Wave 2 — Reconcile big existing screens:** B (Home cards) → C (Media Feed) → G (Updates strip/filters) → E (Design segmented + Selections + References + Drawing).
- **Wave 3 — Polish + sensitive:** D (Chat, around the in-flight kit) → F (Settings/Members/Notifications) → M (Payments, gated on membrane).
- **[P1]-blocked:** deep Design Profiler intake/result surface — deferred to Plan 1; reconcile only entry-point cards now.

---

## 5. Exact files

**Edit:** `home.tsx`, `photos.tsx`, `updates.tsx`(+`_updates.util.ts`), `design.tsx`(+`_design.util.ts`,`_design_select.util.ts`), `messages.tsx`, `messages/[id].tsx`, `settings.tsx`, `members.tsx`, `notifications.tsx`, `design/profile.tsx`, `design/select.tsx`, `_layout.tsx` (register new `href:null` routes).
**New routes:** `decisions/[id].tsx`, `issue.tsx`, `drawings/[id].tsx`, `requests.tsx`, `payments.tsx`, `storage.tsx`, `design/references/[room].tsx`.
**New kit:** `Chip`, `SegmentedTabs`, `ListRow`, `SubHeader`, `Toggle`, `Toast`, `LinkRow` (+ exports), optional `MilestoneStrip`.
**Backend exists for:** home, photos(+upload), updates, weekly-summary, changes, milestones, property, design profile/selections/references/conflicts, drawings(read), requests(+create), decisions(+respond), capabilities, members, notif-prefs, quiet-periods, finishes, ask.
**Backend MISSING (mock/stub + flag):** payments, drawing-approve, pin/markup/comment-on-media, reference-sharing toggle, voice notes, structured weekly-summary sections.
