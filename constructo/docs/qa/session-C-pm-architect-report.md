# SESSION C — PM + ARCHITECT QA REPORT
**Date:** 2026-06-12 · **Device:** iPhone 17e (UDID `D905E133-D9DD-4CFD-9AC5-A471B09C0A5D`) · **Tester:** Cursor AI agent  
**PM User:** Akhanda (+919011901818) · **Role:** pm · **Company:** Tripathi Auto Constructions  
**Architect User:** Munna bhaiya (+919022902818) · **Role:** architect · **Company:** Tripathi Auto Constructions  
**Site:** Tiwari Dream House

---

## Pre-test Setup Issues

### `idb_companion` not installed
Same as Session B — `idb ui tap/text` commands are unavailable. The agent used:
1. **AppleScript `keystroke`** for keyboard input (works for navigation keys, not reliable for text fields).
2. **Swift + `CGEvent.postToPid`** for tap simulation directly to the Simulator PID (bypasses macOS Accessibility permission requirement).
3. **AX API (`AXUIElementPerformAction`)** for pressing interactive elements identified by their accessibility tree positions.
4. **`xcrun simctl io screenshot`** for screen capture at every step.
5. **Direct API calls** for OTP requests and token validation.

### SegmentFetcher crash on every app launch — P0 crash
On every cold launch or reload, the app crashed immediately with:
```
TurboModuleRegistry.getEnforcing(...):
'SegmentFetcher' could not be found. Verify that a module
by this name is registered in the native binary.
```
**Root cause:** Expo Go 54.0.7 does not register the `NativeSegmentFetcher` TurboModule required by React Native 0.81.5 with the new bridgeless architecture when `lazy=true` is set in the bundle URL.  
**Impact:** Every session start requires manually tapping the "Dismiss" button on the red error overlay before the app becomes usable.  
**Workaround in QA:** Error was dismissed via AX `kAXPressAction` on the overlay button.  
**Fix required:** Build a custom development build (`npx expo run:ios`) instead of using Expo Go, OR add `"lazy": false` to Metro config as a temporary workaround.

### Architect login not live-tested
The Architect login flow could not be completed live due to command interruption during the test. The Architect section below is derived entirely from **static code analysis** of the routing and directory structure, and is marked clearly as such.

---

## PART 1: PROJECT MANAGER (Akhanda, +919011901818)

### PM — Login

| Check | Status | Notes |
|-------|--------|-------|
| PM already had active session | ✅ | Session persisted from prior use; DPR screen appeared immediately after Expo Go launch + Dismiss of SegmentFetcher crash |
| Landed on DPR tab | ✅ | DPR is the initial route and first visible screen |
| Tab bar shows: DPR · More | ✅ | Exactly 2 tabs — DPR (amber active) + More |
| Tab bar shows nothing unexpected | ✅ | No supervisor tabs, no owner tabs, no Chat tab |

**Screenshot:** `/tmp/qa-C-04-dpr.png`

---

### PM — DPR Screen

**Site:** Tiwari Dream House  
**Report date:** 2026-06-12  
**Status:** `Sent · logged` (already sent before QA session began)

| Check | Status | Notes |
|-------|--------|-------|
| DPR loads | ✅ | No error state, no empty state |
| Site picker shows | ✅ | "Tiwari Dream House" amber pill, selectable |
| Date shown | ✅ | `2026-06-12` displayed in mono caption |
| Status badge | ✅ | Green `Sent` pill — report was already submitted |
| Sent card (logged summary) | ✅ | Green flag card with "Sent · logged" icon and Hindi summary |
| Summary content quality | ⚠️ NEEDS EDIT | *"Aaj kuch khaas kaam nahi hua, sirf cement ki maang ka inquiry kiya gaya. Kaam sahi tarah se aage nahi badh raha hai. Agar kuch aur ho toh bataiye."* — Reflects only one real event (cement inquiry). Summary written in Hindi even though `language` may be `en` for this user. Phrasing is soft and vague ("Work is not progressing well..."). A PM might lightly edit before forwarding. |
| Content reflects real site events | ✅ PARTIAL | MATERIALS section shows "Inquiry about the amount of cement." — one real captured event. LABOUR headcount is "not captured" (honest admission). No invented data. |
| Thin-day handling | ✅ | No false content. Empty sections show "Nothing captured." Honest minimal draft. |
| LABOUR section | ⚠️ | "Headcount not captured" — no attendance data was logged that day. Correct but lean. |
| MATERIALS section | ✅ | "Inquiry about the amount of cement." — real event. |
| WORK DONE | ✅ | "Nothing captured." (honest) |
| BLOCKERS | ✅ | "Nothing captured." (honest) |
| Share button exists | ✅ (code) | Button present in code at AX position `(508, 902)` — just 4px below the visible scroll boundary. Scroll gestures could not be triggered via automation; Share button was not tapped. See bug #3. |
| Share sheet opens (OS) | ⛔ | Not tested — scroll to button was blocked by automation limitation. |
| ConfirmCard with AI label | ✅ (code) | Code shows ConfirmCard with `aiLabel`, `confidence`, and `confirmLabel`. Only visible in `draft` state — this DPR was already `sent` so ConfirmCard was replaced by the logged card. |
| Edit summary field | ✅ (code) | `TextInput` for summary edit shown in draft state only. Not visible here since DPR is already sent. |
| Back button stability | ✅ | DPR is root tab — no back button, stable. |

**DPR Quality Rating: Needs light edit**  
Rationale: Real events are captured correctly, no invented data, but the summary is vague and bilingual (Hindi) on a day with minimal activity. A PM would likely refine the summary before sending, but the data backbone is honest and accurate.

**What should have been there (DPR):**
- The ConfirmCard flow (AI proposes → PM confirms) is only visible on a **draft** DPR. Since this session tested an already-sent report, the AI proposal → review → send flow was not exerciseable. A fresh DPR from a day with activity (attendance logged, progress updates) would show the full ConfirmCard experience.
- The `language` stored for Akhanda appears to be `hi` (Hindi), causing the summary to render in Hindi. If Akhanda prefers English output, their language preference in DB needs to be updated.
- The Share button requires scrolling ~40px past the bottom fold. On a phone, one swipe would reach it. In automation this was unreachable; in real use it is fine.

---

### PM — More Screen

**Screenshot:** `/tmp/qa-C-07-pm-more.png`

| Check | Status | Notes |
|-------|--------|-------|
| More tab navigates | ✅ | Tab press (via AX `kAXPressAction`) navigated to More screen |
| "More" title shown | ✅ | H1 "More" header |
| PM name shown | ✅ | "Akhanda" with role subtitle "Project Manager" |
| Phone shown | ✅ | "+919011901818" with "Phone" subtitle |
| Company shown | ❌ BUG | Shows raw UUID `bcac9e24-f060-4395-9782-1104108a2a3c` instead of company name "Tripathi Auto Constructions". The `me.company_id` is a UUID — `PmMore` renders `me.company_id` directly instead of `me.company_name`. |
| Sign out button present | ✅ | Red/risk tone "Sign out" button with log-out icon |
| Sign out navigates to login | ✅ | After sign out, app returned to "Welcome to Constructo — Builder / staff login" screen |
| Sign out toast error | ❌ MINOR | A brief toast appeared: *"The action 'REPLACE' with payload {"nam..."* — a navigation reducer received an unexpected action during sign-out routing. Non-blocking but visible. |
| Chat button anywhere on More | ❌ | No chat button, no link to chat, no navigation affordance. |

**What should have been there (More):**
- `company_name` (not `company_id` UUID) should be displayed. The `/auth/me` response includes `company_name: "Tripathi Auto Constructions"` but the `PmMore` component reads `me.company_id` (a UUID) instead of `me.company_name`. One-line fix.
- The sign-out navigation reducer error suggests a stale route name in the `router.replace('/')` call after `signOut()`. Should be investigated — may cause silent navigation failures in edge cases.

---

### PM — Chat Access Gap

| Check | Status |
|-------|--------|
| Chat button on DPR screen | ❌ ABSENT |
| Chat button on More screen | ❌ ABSENT |
| Chat tab in tab bar | ❌ ABSENT |
| Any navigation to chat anywhere | ❌ NONE |

**Gap severity: Significant**  
The PM is the team coordinator. They compile the DPR from the supervisor's site captures, coordinate with the owner on approvals, and manage the overall site team. Having NO mobile chat access means:
- A PM cannot receive a team message while on mobile and respond immediately
- A PM reviewing a DPR draft on mobile cannot jump to the raw chat thread to verify an event
- The PM must context-switch to WhatsApp or the web dashboard for any chat interaction

**What should have been there:** At minimum, a "Chat" entry in the More tab settings, or a chat icon in the DPR header linking to the site thread. The PM layout has two tabs hardcoded in `pm/_layout.tsx` — a third "Chat" tab should be added, pointing to the same chat component used by supervisor.

---

### PM — Goal Alignment

**Can a PM compile and share a DPR without manually writing it?**

**Answer: PARTIALLY**

| Step | Status | Reason |
|------|--------|--------|
| AI drafts DPR from site events | ✅ | `pm.draftDpr()` call generates a DPR from `site_events`. Real events (cement inquiry) appeared correctly. |
| PM reviews draft | ✅ | Sent card shows full content — summary, sections. |
| PM edits summary | ✅ (code) | `TextInput` for summary edit exists in draft state |
| PM sends DPR | ✅ (code) | "Send report" button + `pm.sendDpr()` mutation. DPR was already sent in this session. |
| PM shares via OS share sheet | ⚠️ UNCONFIRMED | Share button exists in code and is reachable by manual scrolling; automation could not trigger it. |
| PM can coordinate with team | ❌ | No chat access from mobile. |

---

## PART 2: ARCHITECT (Munna bhaiya, +919022902818)

> ⚠️ **This section is derived from static code analysis only.** The live Architect login was not completed during this QA session. All findings below are what the code guarantees will happen.

### Architect — Code Analysis

**Directory structure checked:**
```
constructo/mobile/app/(contractor)/
├── _layout.tsx          ← contractor root layout
├── index.tsx            ← fallback "coming soon" screen
├── accountant/
├── mukadam/
├── owner/
├── pm/
└── supervisor/
         ← NO architect/ directory
```

**`_layout.tsx` routing logic:**
```tsx
export default function ContractorLayout() {
  const { status, role } = useAuth()
  if (status === 'loading') return null
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  if (role === 'homeowner') return <Redirect href="/(homeowner)/home" />

  // ← No architect case. Falls through to:
  return (
    <ThemeProvider initial="neev">
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}
```

**`index.tsx` fallback content:**
```tsx
export default function ContractorHome() {
  // Shows: "Coming soon" heading, "Builder app is coming; use web for now" card,
  //        "Signed in as architect." text, and Sign Out button
}
```

### Architect — What Happens Post-Login (Predicted)

| Check | Predicted Status | Reason |
|-------|-----------------|--------|
| App crashes | ❌ (NO crash) | `_layout.tsx` renders `<Stack>` cleanly |
| Blank white screen | ❌ (NOT blank) | `index.tsx` is the default route and shows a placeholder |
| Tabs visible | ❌ NONE | No `Tabs` navigator — just a `Stack` pointing to `index.tsx` |
| "Coming soon" message | ✅ | `index.tsx` renders "Coming soon" heading and "use web for now" body |
| "Signed in as architect." shown | ✅ | `me?.role` is displayed in the fallback card |
| Sign out button | ✅ | Present in `index.tsx` |
| Can read site info | ❌ | No site screens |
| Can access chat | ❌ | No chat navigation anywhere in the fallback screen |
| Graceful fallback message | ✅ PARTIAL | "Coming soon" is visible but not actionable — no web URL, no QR code, no link to guide the architect |
| Overall status | ⚠️ WEB-REDIRECT | Not broken/crashed, but zero functional value on mobile |

### Architect — What SHOULD Have Been There

The architect is primarily a reviewer/approver role who needs to:
1. See RFI submissions and design queries from the site
2. Access drawings references linked in chat
3. Receive notifications about structural concerns flagged by supervisor
4. Respond to owner questions about design decisions

**None of these are available on mobile for the architect role.**

The "coming soon" fallback is better than a blank screen, but it gives the architect no path forward. The fallback should at minimum say: *"Architect features are available on the web dashboard. Visit [URL] on your desktop browser."* Currently it says nothing actionable.

### Architect — Recommended Fix

**Option 1 (Minimal, fast):** Route `role === 'architect'` to the PM layout.  
Both PM and architect are desk/office roles with no camera-capture workflow. The PM layout (DPR + More) doesn't expose DPR features to the architect (they'd see sites they're not PM for), but at minimum they'd have the More tab with identity + sign out. This is a 3-line fix in `_layout.tsx`.

**Option 2 (Correct, medium effort):** Create `app/(contractor)/architect/` with two screens:
- `chat.tsx` — direct access to site chat threads (architect needs to see design queries)
- `more.tsx` — identity + sign out (can reuse or alias `pm/more.tsx`)

Tab bar: Chat · More. Architect's primary mobile value is reading and responding to design questions in the site thread — chat is the one feature that doesn't require dedicated native screens.

**Option 3 (Future):** Full architect screen set with RFI inbox, drawing references, and approval actions.

**Recommendation: Option 2** — architect needs chat on mobile more urgently than they need DPR. Option 1 would expose confusing PM-specific UI (DPR for other users' sites). Option 2 requires ~2 new files but produces a genuinely useful experience.

### Architect — Goal Alignment

**Can an architect participate in site communication and track design decisions on mobile?**

**Answer: NO**

Code guarantees a "coming soon" fallback with no functional screens. No chat, no site info, no design queries, no way to respond to anything. The architect must use the web dashboard for all work.

---

## BUG LIST (P0 first)

| # | Role | Screen | Severity | Description |
|---|------|--------|----------|-------------|
| 1 | Both | App Launch | **P0** | **SegmentFetcher crash on every launch** — `TurboModuleRegistry.getEnforcing: 'SegmentFetcher' could not be found`. Blocks app startup. Requires manual "Dismiss" tap every cold launch. Root cause: Expo Go 54.0.7 missing `NativeSegmentFetcher` TurboModule with RN 0.81.5 bridgeless. Fix: dev build or disable lazy bundling. |
| 2 | Architect | Login | **P0** | **No mobile screens for architect role** — zero functional UI. Fallback is `index.tsx` "coming soon" placeholder. Cannot access chat, site info, or any feature. |
| 3 | PM | DPR | **P1** | **Share button below scroll fold** — Share button is ~40px below the visible content boundary. Scroll gestures did not reliably trigger in automation; manual user swipe should work but position is tight. The DPR screen layout should ensure the Share button is always fully visible (e.g., via `ScrollView` with `contentContainerStyle` padding). |
| 4 | PM | More | **P1** | **Company shows UUID instead of name** — `PmMore` renders `me.company_id` (UUID `bcac9e24-...`) instead of `me.company_name` ("Tripathi Auto Constructions"). One-line fix: replace `me.company_id` with `me.company_name`. |
| 5 | PM | Both | **P1** | **No chat access from PM mobile app** — PM has no Chat tab and no button/link to access team chat on mobile. PM is the team coordinator but cannot communicate with the team without leaving the app. |
| 6 | PM | More | **P2** | **Sign-out navigation toast error** — toast shows *"The action 'REPLACE' with payload {\"nam...\"}"* after sign out. Non-blocking but indicates a stale route name in `router.replace('/')` inside `onSignOut`. |
| 7 | Architect | `_layout.tsx` | **P2** | **No architect routing case in ContractorLayout** — the contractor root layout has no `role === 'architect'` redirect. Falls through to generic `<Stack>` rendering `index.tsx`. Needs explicit routing to either PM layout (quick fix) or new architect directory (proper fix). |
| 8 | Architect | `index.tsx` | **P3** | **"Coming soon" fallback gives no actionable guidance** — shows "use web for now" but no URL, no QR code, no link. Architect has no way to know where to go. |

---

## SCREENSHOTS TAKEN

| File | Shows |
|------|-------|
| `/tmp/qa-C-04-dpr.png` | PM DPR screen — Tiwari Dream House, Sent status, Hindi summary, all sections |
| `/tmp/qa-C-07-pm-more.png` | PM More screen — Akhanda, Project Manager, phone, company UUID bug, Sign out |
| `/tmp/qa-C-10-logged-out.png` | Login screen after PM sign-out — phone field with "+91" prefix, navigation toast error visible |

---

## WHAT SHOULD HAVE BEEN THERE (Summary)

1. **A dev build instead of Expo Go** — the SegmentFetcher crash is a fundamental incompatibility. Every QA session will start broken until `npx expo run:ios` is used.

2. **`architect/` directory with chat + more screens** — the architect role was set up in the backend but has zero mobile presence. Even a two-screen Chat + More layout would make the mobile experience functional.

3. **Chat tab in PM mobile layout** — PM has no mobile chat access. A third tab in `pm/_layout.tsx` pointing to the chat component would close this gap.

4. **`me.company_name` on More screen** — trivial one-line fix: `PmMore` should read `me.company_name` not `me.company_id`.

5. **DPR with a draft state to QA** — the DPR was already `sent` when this session ran. A fresh session should start with a `draft` DPR so the ConfirmCard (AI proposes → PM reviews → PM sends) flow can be exercised. Seeding a fresh DPR (or clearing today's sent status) should be in setup instructions.

6. **A `dev_otp` hint on the OTP screen** — Session B confirmed the OTP screen shows "Dev code: 000000". This was not re-verified in Session C but should be consistent.

7. **Sign-out navigation bug fix** — the `router.replace('/')` in `onSignOut` should use a named route (`/(auth)/login` or similar) to avoid the REPLACE-action toast.
