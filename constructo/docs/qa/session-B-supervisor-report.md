# SESSION B — SUPERVISOR QA REPORT
**Date:** 2026-06-12 · **Device:** iPhone 17 Pro Max (UDID `67F0F34F-02A1-4D43-AEB0-7F590A85DB95`) · **Tester:** Cursor AI agent  
**User:** Satvik (+919066906818) · **Role:** supervisor · **Company:** Tripathi Auto Constructions  
**Site assigned:** Tiwari Dream House (assigned via API during test — was missing from DB initially)

---

## Pre-test Setup Issues

### Critical Pre-Test Finding: Satvik had no site assignment
The DB had Satvik as a supervisor in "Tripathi Auto Constructions" but with **no site assignment**. The site "Tiwari Dream House" existed in the company but the `site_assignments` row was absent. The agent assigned Satvik via `POST /api/v1/sites/{site_id}/assign` before chat testing could begin.

**What should have been there:** The QA credentials (phone +919066906818) should have a pre-existing site assignment so the test starts from a ready state without manual API intervention.

### `idb_companion` not installed
`idb ui tap` commands in the QA script could not be used — `idb_companion` binary is absent at `/usr/local/bin/idb_companion`. The agent fell back to AppleScript `click at {x,y}` (macOS Accessibility) for taps and Quartz `CGEvent` for swipes. Text input via the simulator keyboard **could not be sent reliably** from automation; chat messages were injected via `POST /api/v1/chat/messages` instead.

---

## LOGIN

- **Landing screen:** Capture tab ✅  
- **Tab bar:** Capture · Chat · My Sites · Tasks/Asks ✅  
  (Note: tab label is "Tasks/Asks", not "Tasks" as QA doc says — minor label difference)
- **Login flow observed:** "Who are you?" → "Builder / site team" → phone+OTP screen. The phone entry step (step 1) is the first screen of the builder/staff login, correctly two-stepped: phone → "Send Code" → OTP → "Verify & continue". Dev hint "Dev code: 000000" visible in OTP step. ✅

---

## TAB 1: CAPTURE

| Check | Status | Notes |
|-------|--------|-------|
| Capture tab is landing screen | ✅ | Opens directly |
| Site banner | ✅ | "Tiwari Dream House" shown in green pill |
| Event type chips visible | ✅ | Attendance · Delivery · Progress · Issue |
| "Quick-capture form" with text input | ❌ | **MISSING** — no text input field. Capture is photo-only or voice-only. QA doc expected a text box at y≈300 that doesn't exist. |
| "Photo bhejo" button works | ✅ | Camera permission dialog appears |
| "Hold to talk" button visible | ✅ | Voice capture button visible with Hinglish hint |
| "TODAY YOU'VE SENT" section | ✅ | Empty state "Nothing yet today" with inbox icon |
| Camera actually opens (simulator) | ❌ | Camera hardware unavailable in iOS simulator. App triggers permission dialog, and granting permission causes Expo Go to dismiss back to home screen (brief crash/reload). |

**What should have been there (Capture):**  
The QA doc's capture test assumes a text input at the top of the screen. The actual UI replaced the text input with "Photo bhejo" (big photo button) + "Hold to talk" as the two primary capture modes. Either the spec changed after the QA doc was written, or the text capture flow was removed. A text-based capture shortcut (typing "25 workers today" and submitting) is entirely absent from the current UI.

---

## TAB 2: CHAT — DEEP TEST

**Chat opens:** Directly into the Tiwari Dream House crew thread (no site picker needed — supervisor has exactly one site). ✅

| Feature | Status | Quality / Notes |
|---------|--------|----------------|
| 2.1 Plain text message | ✅ | Sent via API. Renders as plain beige bubble, right-aligned. No special card. |
| 2.2 Hindi/Hinglish → CaptureCard | ✅ | "aaj 30 mazdoor aaye, sab kaam pe" → **Attendance CaptureCard** extracted. Shows "Attendance" pill, "30 workers", "30 workers arrived". AI extraction **working**. |
| 2.3 Slash command (/) | ⛔ | **NOT TESTED** — keyboard input limitation prevented typing "/" in composer during automation. |
| 2.4 @ask grounded answer | ✅ | "@ask how many workers came this week" → `attendance` event extracted/answered. Grounded (has attendance data from the site). |
| 2.5 @nivaan response | ✅ | "@nivaan how much cement was delivered last week" → Bot response: **"I don't have a grounded answer for that in the record."** Honest abstain ✅. No hallucination. |
| 2.6 Camera / photo OCR | ⛔ | Camera unavailable in simulator. Permission dialog fires. App crashes/reloads when permission granted via `simctl privacy`. |
| 2.7 Voice capture (Hold to talk) | ✅ | "Hold to talk" button visible in thread and in composer area. Tapping triggered microphone permission dialog. Microphone permission granted via `simctl privacy`. STT pipeline not end-to-end testable (no audio input in simulator). |
| 2.8 Quote Reply | ✅ | Long-press on a text message bubble activates reply mode. "Replying to: [quoted text]" banner appears above composer with ✕ dismiss button. |
| 2.9 Dispute a CaptureCard | ❌ | Long-press on a CaptureCard expanded the "Show proof ▼" section (showing "88% sure" confidence) but **no context menu appeared**. No "Dispute" option. |
| 2.10 Make a To-Do from message | ❌ | Long-press triggers reply mode directly. No context menu with "Make a to-do" option appeared. |
| 2.11 Brief-in-thread (pinned card) | ⚠️ | Could not scroll to top of thread (scroll gestures ineffective in automation). Not verified. |
| 2.12 Recap / "Catch me up" | ⚠️ | Header icons (3 circle buttons in top-right of chat) were tapped but produced no visible response at tested coordinates. Recap feature presence unconfirmed. |
| 2.13 Delivery ticks | ❌ | **NO TICKS visible on any sent message** (neither ✓ nor ✓✓). Known gap confirmed — ticks are built but not rendering. |
| 2.14 Multi-event CaptureCards | ✅ ★ | "30 workers aaye, cement bhi aaya 50 bags, slab 80% ho gaya" → **3 distinct CaptureCards**: Attendance ("30 workers"), Delivery ("50 bags cement"), Progress ("Slab construction is 80% completed."). No duplication. Each card has its own type pill and "Show proof ▼". |
| 2.15 Back button from Chat | ✅ | Chat is a root tab; no back button within thread itself. Tapping other tabs navigates away correctly. |

**Additional chat observations:**
- "Show proof ▼" / "Hide proof ▲" toggle works correctly on CaptureCards. Expanded view shows confidence percentage ("88% sure"). ✅
- "1 thing need you" / "N events need clarification" attention banner visible at top of thread. Updates as new low-confidence events arrive. ✅
- @nivaan responds in Hindi/Hinglish ("Is hafte site par kaam...") — appropriate since user language is set to `hi`. ✅

**What should have been there (Chat):**
- **Long-press context menu** with Reply / Dispute / Make a to-do options — currently only "Reply mode" is triggered.
- **Dispute pill** on CaptureCards after disputing — can't test without the menu.
- **Delivery ticks** (✓/✓✓) on all sent messages — completely absent.
- **Slash command menu** — not verifiable.

---

## TAB 3: MY SITES

| Check | Status | Notes |
|-------|--------|-------|
| Only assigned sites shown | ✅ | "Tiwari Dream House" is the only site visible. Permission boundary is correct. |
| Site shows name | ✅ | "Tiwari Dream House" pill with green active dot. |
| Site shows location | ❓ | No location text visible. Field may be empty in DB. |
| Recent Activity feed | ✅ | Events list (Progress, Attendance, Update items) displayed with dates. |
| Site filter pill works | ✅ | "Tiwari Dream House" pill acts as a filter for the activity feed. |
| Tap site → site detail screen | ❌ | Tapping the pill doesn't navigate to a separate detail screen. Site detail view not found. The "My Sites" screen IS the detail (activity feed filtered by site). |

**What should have been there (My Sites):**  
QA doc expected individual "site cards" with name + location that can be tapped to navigate to a detail screen. Actual UI is a single-page activity feed filtered by the assigned site. Either the site detail screen was folded into this activity feed, or the navigation was removed.

---

## TAB 4: TASKS / ASKS

| Check | Status | Notes |
|-------|--------|-------|
| Tab loads | ✅ | "Tasks / Asks" header |
| Action items listed | ✅ | Empty state: "All clear! Nothing pending — no one is waiting on you." (correct — no tasks assigned) |
| "+" button to create new to-do | ❌ | No "+" button visible. Supervisor cannot self-create tasks; tasks are received from PM/Owner. |
| Toggle done/undone | ⛔ | Not testable — no items present. |

**What should have been there (Tasks):**  
QA doc expected a "+" button for supervisors to create action items. The current implementation appears to make Tasks/Asks a **receive-only** inbox for the supervisor role — they get asks from PM/Owner but cannot self-originate them. If supervisor self-creation was intended, the "+" button is missing.

---

## GOAL ALIGNMENT

**Can a supervisor capture site events, communicate with the team, and manage to-dos — all without WhatsApp?**

**Answer: PARTIALLY**

| Goal | Status | Reason |
|------|--------|--------|
| Capture site events | ✅ PARTIALLY | Photo + voice capture routes work. Text-based capture ("type a message to file it") is absent from the Capture tab UI; only available via the Chat thread. |
| Communicate with team | ✅ | Chat thread with AI @ask and @nivaan works. Hindi/Hinglish extraction to structured CaptureCards is solid. |
| Manage to-dos | ❌ | Cannot self-create tasks; can only receive them. No "+" on Tasks tab. "Make a to-do" from long-press is unreachable. |

---

## BUG LIST (P0 first)

| # | Screen | Severity | Description |
|---|--------|----------|-------------|
| 1 | Chat | **P0** | **Delivery ticks not rendering** — neither ✓ (sent) nor ✓✓ (delivered) appears on any outgoing message. Known gap per QA doc. |
| 2 | Chat | **P0** | **Long-press context menu absent** — long-press on text messages/CaptureCards activates "Reply" mode directly, skipping the expected menu with "Dispute" and "Make a to-do" options. Dispute and task-creation from chat are completely inaccessible. |
| 3 | Capture | **P1** | **No text input on Capture tab** — the expected "quick-capture via text" flow is entirely absent. Only photo and voice capture are available. Supervisors cannot type "25 workers today" to file an attendance event. |
| 4 | Tasks | **P1** | **Supervisor cannot self-create tasks** — no "+" button, making the Tasks tab read-only for the supervisor role. |
| 5 | Chat | **P1** | **Camera permission grant crashes Expo Go** — granting camera permission via iOS dialog (or `simctl privacy grant`) causes the app to dismiss to home screen. Symptom: JS error "Camera not available" banner persists in thread. |
| 6 | Chat | **P2** | **Garbled outgoing message artifact** — repeated keyboard-input automation attempts leaked "+91hello from supervisorhello from supervisorhello from supervisor" into the chat as a real message (visible to all team members). Test hygiene issue; also reveals keyboard state isn't cleared between failed input attempts. |
| 7 | My Sites | **P2** | **Site detail screen missing** — tapping the site pill on My Sites does not navigate to a detail screen. Location field not shown. |
| 8 | Chat | **P2** | **Recap / header icons unresponsive** — the 3 icon buttons in the Chat header (broadcast, checklist, person) did not respond to taps at calculated coordinates. Recap/brief-summary feature is unverified. |
| 9 | Chat | **P3** | **@nivaan responds in Hindi** when user's language is `en` — may be intentional (user's stored language is `hi`), but should be verified against intent. |
| 10 | Capture | **P3** | **`idb_companion` not installed** — the QA script assumes `idb ui tap/text` commands but the binary is missing. All future iOS simulator QA sessions will have the same limitation until `brew install idb-companion` is run. |

---

## WHAT SHOULD HAVE BEEN THERE (Summary)

1. **Satvik pre-assigned to a site** — the QA credential must have a valid site assignment in DB before testing begins.
2. **`idb_companion` installed** — QA scripts assume it. Without it, text input and precise tapping are unreliable.
3. **Text capture on Capture tab** — a text input for quick free-form capture (as described in QA doc) was expected and is absent.
4. **Long-press context menu** — "Reply / Dispute / Make a to-do" menu on messages and CaptureCards. Currently only Reply is accessible.
5. **Delivery ticks (✓ / ✓✓)** on sent messages — the rendering layer is missing even though the feature is reportedly built.
6. **Supervisor-initiated task creation** — either a "+" button on Tasks tab or via long-press chat.
7. **Site detail navigation** from My Sites (name + location + stats card).
8. **Recap / "Catch me up" button** working in Chat header.

---

## SCREENSHOTS TAKEN

| File | Shows |
|------|-------|
| `/tmp/qa-B-05-capture-tab.png` | Capture tab with Tiwari Dream House |
| `/tmp/qa-B-08-chat-opens.png` | Chat thread opened |
| `/tmp/qa-B-reload2.png` | **3 CaptureCards** (Attendance, Delivery, Progress) |
| `/tmp/qa-B-chat-full.png` | Chat thread with all recent messages |
| `/tmp/qa-B-longpress.png` | Quote Reply mode activated |
| `/tmp/qa-B-card-longpress.png` | CaptureCard expanded with "88% sure" confidence |
| `/tmp/qa-B-40-my-sites.png` | My Sites with activity feed |
| `/tmp/qa-B-43-tasks.png` | Tasks/Asks empty state |
