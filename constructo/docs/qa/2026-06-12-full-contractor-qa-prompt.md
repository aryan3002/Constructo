# Constructo Contractor App — Full QA Audit Prompt

> **For the AI running this:** You are acting as a senior QA engineer + AI product reviewer on the Constructo construction management platform. Your job is dual: (1) find every broken screen, flow, navigation bug, and inconsistency in the contractor mobile app, and (2) evaluate whether each AI feature is actually making the user's job easier. Don't just check if code exists — **run the app in the iOS simulator, take screenshots at every step, and render a verdict based on what you actually see**.

---

## SIMULATOR SETUP — DO THIS FIRST

Before any testing, run these steps in order. Do not skip — the app must be live and reachable.

### Step 1: Check prerequisites
```bash
# Confirm idb is available (needed for taps)
which idb || echo "MISSING: install with: brew install idb-companion && pip install fb-idb"

# Confirm Expo CLI available
which npx && npx expo --version

# Confirm backend is running
curl -s http://localhost:8000/health || echo "Backend not running — start it first"
```

### Step 2: Start the backend (if not running)
```bash
cd constructo/backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Run in background or a separate terminal
```

### Step 3: Boot the iOS simulator
```bash
# List available simulators
xcrun simctl list devices | grep -E "iPhone.*Booted|iPhone 1[5-9]"

# Boot an iPhone 15 or later (use the UDID from above)
xcrun simctl boot <UDID>
open -a Simulator
```

### Step 4: Start Expo and open in simulator
```bash
cd constructo/mobile

# Set backend URL (use your Mac's LAN IP so the simulator can reach it)
# The simulator CAN use localhost — it resolves to the Mac
echo 'EXPO_PUBLIC_API_BASE=http://localhost:8000' > .env.local

npx expo start -c &
sleep 5

# Open in simulator
npx expo start -c --ios
```

### Step 5: Set up idb for tapping
```bash
# Start idb companion (once)
idb_companion --boot <UDID> &

# Test a tap (center of screen — just to confirm idb works)
idb ui tap 390 844
```

### Step 6: Screenshot helper — use this after EVERY action
```bash
# Save a screenshot with a label
screenshot() { xcrun simctl io booted screenshot "/tmp/qa-$1-$(date +%s).png" && echo "Saved /tmp/qa-$1-*.png"; }

# Usage:
screenshot "owner-brief-tab"
screenshot "supervisor-chat-send"
# etc.
```

---

## HOW TO DRIVE THE APP

Use this pattern for every test step:

```
1. idb ui tap <x> <y>        # tap a button / input
2. screenshot "<label>"       # capture what happened
3. Analyze the screenshot     # what does it show? is it correct?
4. Record finding             # ✅ or ❌ + description
```

**Common coordinates (iPhone 15 Pro, 393×852pt):**
- Tab bar items (bottom): Brief≈49,835 | Chat≈138,835 | Sites≈196,835 | Approvals≈255,835 | More≈344,835
- Back button (top-left): ≈30,60
- Center of screen: 196,426
- Composer / text input (bottom): 196,800
- Send button: 360,800

> You will need to adjust coordinates based on actual screenshots — tap the center of whatever element you can see.

**Typing into the app:**
```bash
# idb can type text into focused inputs
idb ui text "your text here"

# For OTP login — tap the phone field, type number, tap Next
idb ui tap 196 400        # tap phone input
idb ui text "+919055905818"
idb ui tap 196 600        # tap Continue/Next button
screenshot "after-phone-entry"
# Then tap OTP field and type 000000
idb ui tap 196 400
idb ui text "000000"
screenshot "after-otp"
```

---

## LOGIN SEQUENCE (run for each role)

```bash
# 1. Screenshot the current state
screenshot "start"

# 2. If app shows login screen — tap phone field and enter number
idb ui tap 196 400 && idb ui text "<PHONE_NUMBER>"
screenshot "phone-entered"

# 3. Tap Continue
idb ui tap 196 650
screenshot "otp-screen"

# 4. Enter OTP
idb ui tap 196 400 && idb ui text "000000"
screenshot "otp-entered"

# 5. Tap Verify / Submit
idb ui tap 196 650
screenshot "post-login"
```

After login: take a screenshot and record exactly what screen appears.

---

## THE PRODUCT: What Is This App and What Should It Achieve?

Constructo is an **AI-native construction site management platform for Indian contractors**. The mobile app serves the field and office team.

**The core promises (hold every feature against these):**

- A **supervisor** should capture site events (attendance, delivery, progress, issues) in under 10 seconds — by typing or speaking naturally in Hindi/Hinglish. The app should extract structured data automatically. No forms.
- An **owner** should open the app every morning and know exactly what to decide — without calling anyone. The AI brief surfaces risks, mismatches, overdue items.
- A **PM** should never manually compile a Daily Progress Report. AI drafts it from the day's captures.
- An **architect** should never lose a material decision or site instruction in a WhatsApp thread.

**The in-app chat IS the product** — it is the primary work surface, not a sidebar. Messages become structured site events through AI extraction. The AI agent "Nivaan" lives inside crew threads and can answer questions, propose actions, and surface risks when explicitly invoked with `@nivaan`.

---

## CODEBASE LOCATION

```
constructo/
  backend/        FastAPI (Python) — APIs, AI pipelines, site event extraction
  mobile/         Expo/React Native — the app under test
    app/
      (auth)/     Login screens
      (contractor)/
        owner/    Owner screens (5 tabs: Brief, Chat, Sites, Approvals, More)
        pm/       PM screens (2 tabs: DPR, More)
        supervisor/ Supervisor screens (4 tabs: Capture, Chat, My Sites, Tasks)
        accountant/ Accountant screens
        mukadam/  Labor contractor screens
      (homeowner)/ Homeowner app — separate design system, NOT in scope for this audit
    src/
      chat/       Shared chat kit (MessageView, useChatThread, ChatComposer, CaptureRail)
      api/        API client files
      auth/       Auth context
```

---

## TEST ENVIRONMENT

**Backend:** The backend should be running and reachable. For local dev: `http://<LAN_IP>:8000`. For prod: the Azure Container Apps URL. Set `EXPO_PUBLIC_API_BASE` in `constructo/mobile/.env` to the correct URL.

**Mobile:** Run `cd constructo/mobile && npx expo start -c` then open in Expo Go or a simulator.

**OTP:** For all accounts, OTP is `000000` (dev stub — always accepted).

---

## TEST ACCOUNTS (Real prod team — CivilArch / Tripathi Dream Home)

| Role | Phone | Name | Core Job in App |
|------|-------|------|----------------|
| **Owner** | +919055905818 | (Founder) | Morning brief, approvals, team management, portfolio view |
| **Architect** | +919022902818 | Munna bhaiya | Design decisions, material specs (web-primary role) |
| **Project Manager** | +919011901818 | Akhanda | DPR auto-generation, team coordination, approvals |
| **Supervisor** | +919066906818 | Satvik | Site capture, crew chat, action items |

---

## HOW TO CONDUCT THIS AUDIT

**For each role:**
1. Log in fresh (clear app state or use a clean login)
2. Note exactly what screen you land on
3. Walk every tab, every screen reachable from that tab
4. Perform the role's core actions
5. Test all navigation (back buttons, tab switches, modals)
6. Test all AI features that should be available to that role
7. Note every broken thing, every confusing thing, every thing that fails to deliver the app's promises

**For code-level analysis:** trace through routing files, API call sites, and screen implementations. Cross-check what the backend returns vs. what the UI expects.

---

## ROLE 1: OWNER (+919055905818)

**Tab bar: Brief · Chat · Sites · Approvals · More**

### 1.1 Login
- Phone: +919055905818, OTP: 000000
- ✅ Should land on the **Brief** tab (the owner morning brief)
- ❌ Flag if: blank screen, loading forever, wrong tab, crash

### 1.2 Brief Tab — AI Morning Brief

This is the **#1 AI feature for the owner**. Every morning it should surface risks, flags, and decisions without the owner asking. Test ruthlessly.

**Functional checks:**
- Does the brief load? Are site risk cards visible?
- Are risks labeled with specific evidence? (e.g., "Site B: 22 workers vs baseline 40 — labor shortfall", "ACC invoice: 120 bags billed, 100 delivered — ₹12k at risk")
- Is the brief date shown? Is it yesterday's date (the default) or today's?
- Does tapping a risk card navigate to the right place?
  - Labor risk → relevant site detail?
  - Invoice mismatch → Approvals or the decision?
  - Permit expiry → Permits screen?
- Navigate away to another tab, then back to Brief — does it persist or re-fetch cleanly?

**AI goal check:** Ask yourself — if the owner opened this every morning, would they learn something actionable? Are the risks specific to THIS site's data, or are they generic? Rate: Excellent / Adequate / Too vague / Broken.

**Known issue to check:** The Brief empty state recently changed (removed a dead "Connect WhatsApp group" button; added "Open a site chat" button). Does the "Open a site chat" CTA navigate to the Chat tab correctly when there are no risks to show?

### 1.3 Chat Tab

**Inbox:**
- Does the inbox load with site conversations and groups?
- Are unread message counts shown as badges?
- Is the last message preview visible in each row?
- Are homeowner-channel rows labeled distinctly ("Homeowner · Site Name" + a user icon)?

**Thread (tap any site thread):**
- Does it load message history?
- Are CaptureCards visible for AI-extracted events (structured cards with event-type pill and fields, NOT plain bubbles)?
- Can you type and send a message? Does it appear immediately?
- Are delivery ticks shown on your own sent messages (✓ sent → ✓✓ delivered)?
  - **Known possible gap:** ticks are built in `threadState.ts` but may not render on screen. Flag if missing.
- Is there a "Catch me up" / recap button? Does it return a useful thread summary?

**Back button from thread:**
- ✅ Expected: `router.back()` → Chat inbox
- ❌ Flag if: goes to Brief, goes to login, goes blank, or shows a different role's screen

**@nivaan in crew thread:**
- Type `@nivaan how much cement was delivered` in a site thread
- ✅ Expected: "✦ Nivaan" answer row appears with a grounded response or honest abstain
- ❌ Flag if: no response, crash, or Nivaan appears in a homeowner channel (it's gated out there by design)

**Group management:**
- Tap the create group button
- Can you name a group, pick a site, add members?
- Does the group appear in the inbox after creation?
- Back from group create → chat inbox?
- Manage group: rename, add member, archive — do these work?

### 1.4 Sites Tab

- All company sites listed? (Owner sees all sites — not just assigned ones)
- Tap a site → site detail loads with correct name, location, events?
- Sub-screens within site detail: navigate to each, confirm back button works
- Back from site detail → Sites list ✅

### 1.5 Approvals Tab

**This is where AI-surfaced decisions get acted on.** The pending decisions here should have come from the AI (invoice mismatches auto-raised by accountant, homeowner questions escalated by SLA sweep, etc.)

- Pending decisions listed?
- Are overdue decisions visually distinct (e.g., red/amber highlight)?
- Tap a decision → detail shows title, evidence, action buttons?
- Approve → decision disappears from pending list?
- Back from decision detail → Approvals list ✅

**AI goal check:** Are the decisions showing real evidence (links to specific events)? Or are they vague text blobs? Can the owner approve in under 30 seconds with full confidence?

### 1.6 More Tab

**Team:**
- All team members listed with their role badges?
- Invite button works (opens invite flow)?
- Tap a member → member detail → back ✅

**Permits:**
- Permits listed with status?
- Permits expiring within 30 days highlighted?
- Tap permit → permit detail → back ✅

**Foresight / Portfolio:**
- Per-site forecast/radar cards visible?
- AI health indicators shown (sentinel radar)?
- Cashflow run-rate / forecast data shown?
- Back works ✅

**Settings:**
- Opens without crash?

---

## ROLE 2: SUPERVISOR (+919066906818)

**Tab bar: Capture · Chat · My Sites · Tasks**

The supervisor's app is the most AI-dense experience. Capture must be frictionless. Chat IS the work surface.

### 2.1 Login
- Phone: +919066906818, OTP: 000000
- ✅ Should land on **Capture** tab (the default)
- ❌ Flag if: wrong screen, blank, crash

### 2.2 Capture Tab

- Does the quick-capture form appear?
- Can you select event type (attendance / delivery / progress / issue)?
- Type "30 mazdoor aaye" → send → does it route correctly?
- Does capturing here create a site event? (check chat thread for the resulting card)
- Back from any sub-screen of capture → Capture tab ✅

### 2.3 Chat Tab — FLAGSHIP FEATURE — Test Everything

The crew chat thread is the supervisor's primary work surface. Test every feature listed below.

**Open the site chat:**
- Chat tab opens the crew thread for the assigned site
- Message history loads
- ✅ / ❌ ?

**Plain text message:**
- Type any text, send
- ✅ Appears as a chat bubble?
- ✅ Delivery tick visible (✓)?

**Plain Hindi/Hinglish capture (core AI feature):**
- Type: `aaj 30 mazdoor aaye, sab kaam pe`
- Send
- ✅ Renders as a **CaptureCard** (NOT a plain bubble) — shows event-type pill "ATTENDANCE" + fields (headcount: 30)?
- ❌ Renders as plain bubble — AI extraction not firing or not rendering cards?

**Capture Rail (slash commands):**
- Type `/` in composer
- ✅ Slash command menu/chips appear?
- Select an option (e.g., attendance)
- ✅ Fills in a structured message?

**Smart suggest chips:**
- Do chip suggestions appear based on context (e.g., morning → "Log attendance")?

**Photo capture:**
- Tap camera icon in composer
- ✅ Opens image picker / camera?
- Select or take a photo
- ✅ Uploads successfully?
- ✅ OCR fires — a CaptureCard appears for the detected content?
- ✅ Card shows extracted data (quantities, vendor names, etc.)?
- Back from camera → thread intact ✅?

**Voice capture (hold-to-talk):**
- Hold the microphone button
- Speak in Hindi: `cement ki delivery aayi, 50 bags ACC se`
- Release
- ✅ TranscriptConfirm screen shows?
- Confirm
- ✅ Sends as a CaptureCard (not a plain text message)?
- ❌ Crashes, fails silently, or sends as plain text?

**@ask (grounded Q&A):**
- Type: `@ask how many workers came this week`
- ✅ An answer row appears with a grounded, specific number from the site's actual data?
- ❌ "I don't know" when data exists, or hallucinated numbers?
- **Quality check:** Is the number correct? Does it cite the source event?

**@nivaan (AI agent invocation — crew rooms only):**
- Type: `@nivaan who needs to be paid this week`
- ✅ "✦ Nivaan" label answer row appears?
- ✅ If a proposal card appears, does tapping "Confirm" book exactly one capture?
- ✅ Honest abstain if data is insufficient (no hallucination)?
- **CRITICAL:** Now test in a HOMEOWNER channel (if accessible from supervisor) — Nivaan must NOT respond there

**Quote reply:**
- Long-press a message → tap "Reply"
- ✅ Quote context shown in composer?
- Send reply → ✅ renders with quote bubble above?

**Long-press a CaptureCard:**
- ✅ Options appear: Dispute, Make a to-do, Reply?
- Tap "Dispute" → ✅ Dispute modal opens?
- Submit a dispute → ✅ Card shows "Disputed" pill?
- ✅ A disputed event should block related approvals (check on Owner account)

**Make a to-do:**
- Long-press a message → "Make a to-do"
- ✅ Action item created?
- Navigate to Tasks tab → ✅ to-do appears there?

**Brief-in-thread (pinned summary):**
- ✅ Is there a pinned risk/brief card at the top of the crew thread?
- ✅ Does it show actual exceptions for THIS site?

**Recap / "Catch me up":**
- ✅ Recap button visible in thread (top-right or bottom)?
- Tap it → ✅ useful summary of last 24h activity appears as a system message?

**Back button from chat thread:**
- ✅ Expected: goes back to My Sites (or previous screen)
- ❌ Flag if: goes to login, goes blank, goes to wrong role screen

**CaptureCard duplication check:**
- Send a message that could generate 2+ events (e.g., "30 workers + 5 bags cement delivered + slab 80% done")
- ✅ Each event becomes a distinct card?
- ❌ Cards show duplicated source text/attachment? (Known latent bug in supervisor chat — re-passes sourceText/attachment to every card)

### 2.4 My Sites Tab

- ✅ Shows ONLY assigned sites (supervisor can't see all company sites — this is a permission boundary)
- Tap a site → opens site detail or chat?
- Back from site → My Sites ✅

### 2.5 Tasks / Action Items Tab

- ✅ Lists action items (from long-press "Make a to-do" in chat, or AI-detected)?
- ✅ "+" button creates a new to-do?
- ✅ Toggle done/undone works?
- Back works ✅

---

## ROLE 3: PROJECT MANAGER (+919011901818, Akhanda)

**Tab bar: DPR · More** (PM has only 2 tabs on mobile — desk work is web-primary)

### 3.1 Login
- Phone: +919011901818, OTP: 000000
- ✅ Should land on **DPR** tab
- ❌ Flag if: blank screen with no tabs (means the contractor `_layout.tsx` Stack has no tabs for this role context), crash, or wrong screen

### 3.2 DPR Tab — AI Daily Progress Report

This is the PM's primary mobile function. **The DPR should be AI-drafted from the day's site captures — the PM should not need to type it.**

- ✅ AI-drafted DPR shown for yesterday (or today)?
- ✅ Content reflects actual site events captured by supervisor? (not generic placeholder text)
- ✅ PM can review and edit the summary?
- ✅ Share button → OS share sheet opens (for WhatsApp/email)?
- ✅ Can PM add a note or override a section?

**AI goal check:** Would a PM actually send this DPR to their owner without editing? Is it readable, accurate, and specific? Rate: Ready to send / Needs light edit / Needs heavy edit / Completely wrong.

Back from DPR → stays on DPR (it's the root tab) ✅

### 3.3 More Tab

- ✅ Shows PM's name, phone, company, role?
- ✅ Sign-out option present and works?

### 3.4 PM Chat Access (IMPORTANT GAP CHECK)

PM has **no Chat tab on mobile**. However, a PM is a crew member and should be in site threads and groups.

**Test:** Can PM access chat at all from mobile?
- Is there a chat button anywhere in the DPR screen or More screen?
- Is PM able to receive and respond to chat messages via the app?
- ❌ If PM is completely locked out of mobile chat, that's a significant gap — they're the team coordinator.

**Also check:** When the Owner or Supervisor adds members to a group, does PM (+919011901818) appear in the member picker? Can they be added?

---

## ROLE 4: ARCHITECT (+919022902818, Munna bhaiya)

**⚠️ KNOWN STATUS:** The `architect` role has **no dedicated mobile screens**. The `app/(contractor)/` layout does NOT have a role-specific routing case for architect — they fall into a generic `<Stack>` with `headerShown: false` and no tabs.

### 4.1 Login and Immediate Assessment
- Phone: +919022902818, OTP: 000000
- ✅ What EXACTLY does the screen show after login? (blank Stack? a white screen? specific error? any tabs?)
- ❌ Almost certainly broken — document precisely what is shown

### 4.2 Impact Assessment

**Ask these questions:**
- Can the architect read any site information from mobile?
- Can the architect access chat (even though there are no dedicated architect screens, they should still be a crew member)?
- Is there a graceful fallback — a message pointing them to the web dashboard?

**AI goal check:** Even without dedicated screens, an architect should at minimum be able to participate in crew chat on mobile. If they can't, every design decision and material instruction they communicate on-site has no digital record unless they use WhatsApp. That's a core failure of the product's promise for this role.

### 4.3 Code-Level Fix Assessment

Look at `constructo/mobile/app/(contractor)/_layout.tsx`. Does it handle the `architect` role? If not:
- What is the minimal fix to route an architect to a usable screen?
- Could the architect use the supervisor or PM layout as a fallback?
- Or should there be an explicit "architect" tab layout?

Document what would be needed to unblock this role on mobile.

---

## CROSS-ROLE: CHAT SYSTEM DEEP AUDIT

### 5.1 Real-time Delivery

**Test:** Log in as both Owner (+919055905818) AND Supervisor (+919066906818) simultaneously (two devices or two simulators).
- Supervisor sends a message in a site thread
- ✅ Owner sees the message appear WITHOUT refreshing (WebSocket live delivery)?
- ✅ Delivery tick on Supervisor's sent message updates to ✓✓?
- ❌ Owner must manually reload to see messages?

### 5.2 Unread Badge Flow

- Supervisor sends a message in a site thread
- Owner logs in / switches to Chat tab WITHOUT opening the thread
- ✅ Chat tab badge count shows 1 (or N)?
- ✅ Badge clears when the thread is opened?
- ✅ Badge clears on the correct thread, not all threads?

### 5.3 Delivery Ticks — Rendering Audit

Ticks are fully built in `src/chat/threadState.ts` (`delivered`, `read` cursors, `tickState()` function). **However, it's known that the screen-level rendering was deferred.** Check if ticks actually appear.

- Send a message from Owner
- ✅ Does the message bubble show a ✓ immediately after send?
- ✅ Does it update to ✓✓ when the other party is online?
- ❌ No ticks at all — rendering gap confirmed (document the specific screen file missing the render)
- Find `tickState()` usage in screen files — is it wired in? Which screens?

### 5.4 Offline Resilience — Cache Behavior

**Test:**
- Kill the backend (or turn off wifi)
- Already-opened threads: ✅ cached messages still visible, no "couldn't load" error after 5 seconds?
- Newly-opened threads: ✅ persisted cache loads from AsyncStorage?
- Type and send a message while offline: ✅ message shows pending/queued state?
- Re-enable wifi: ✅ queued message sends automatically?
- **Known gap:** Homeowner Messages inbox goes blank offline (only the thread detail is cache-backed). If testing homeowner, confirm this.

### 5.5 Failed Send / Tap-to-Retry

The `retryPermanent()` and `flush()` functions exist in `useChatThread`. **The UI affordance was documented as not yet wired.** Test:
- Simulate a send failure (kill backend mid-send)
- ✅ Message shows a failed/error state (red indicator)?
- ✅ Is there a "tap to retry" affordance?
- ❌ If not, the message silently disappears or gets stuck — document which screen files need the retry UI

### 5.6 @nivaan Role Gate

**CRITICAL CORRECTNESS CHECK.** Nivaan must only respond in crew rooms. Test both:
1. In a site crew thread (owner or supervisor): `@nivaan test` → ✅ Nivaan responds
2. In a homeowner channel (visible from owner chat inbox, labeled "Homeowner · Site Name"): `@nivaan test` → ❌ Nivaan must NOT respond (homeowner is structurally gated out at `send_message` in `app/chat/router.py`)
3. As the homeowner user (if testing): any message → ❌ Nivaan must not respond

Document the verdict for each case.

### 5.7 CaptureCard vs. Plain Bubble Routing

Every extracted message should render as a CaptureCard, not a plain bubble. Test:
- "30 workers today" → CaptureCard with event_type=attendance ✅?
- "cement delivery 50 bags" → CaptureCard with event_type=material_delivery ✅?
- "hello how are you" → plain bubble ✅ (no extraction needed)?
- A message that FAILS extraction → amber CaptureCard with needs_clarification=true ✅?
- Plain bubble accidentally shown for an extracted event ❌?

### 5.8 Dispute → Approval Block Flow

The dispute system is a contested-truth gate — an open dispute on an event should block related approvals.
- Raise a dispute on a CaptureCard (long-press → Dispute → submit)
- ✅ Card shows "Disputed" pill?
- Log in as Owner, go to Approvals
- ✅ Related approval/decision shows a "Blocked (disputed)" notice?
- ✅ Owner cannot approve while dispute is open?

---

## CROSS-ROLE: NAVIGATION & BACK BUTTON AUDIT

For every row below, test and record what actually happens when you press back. Mark ✅ if correct or ❌ + describe what actually happens.

| Role | Current Screen | Back/Dismiss action | Expected destination |
|------|---------------|---------------------|---------------------|
| Owner | Decision detail | Back | Approvals list |
| Owner | Site detail | Back | Sites list |
| Owner | Team member detail | Back | Team list |
| Owner | Permit detail | Back | Permits list |
| Owner | Chat thread | Back | Chat inbox |
| Owner | Group create sheet | Dismiss | Chat inbox |
| Owner | Group manage sheet | Dismiss | Chat thread |
| Owner | Foresight screen | Back | More (or owner home) |
| Owner | Brief risk card → navigated screen | Back | Brief tab |
| Supervisor | Chat thread | Back | My Sites tab (or previous) |
| Supervisor | Site detail (from My Sites) | Back | My Sites |
| Supervisor | Action items screen | Back | Chat tab or previous |
| PM | DPR screen | Back | DPR (it's the root, stays) |
| Any | Modal dismiss (e.g. dispute modal) | Dismiss | Underlying thread, intact |
| Any | Deep-link into a notification | — | Correct screen, logged in |

**Tab persistence test:**
- Navigate deep into a stack (Owner: Sites → Site → sub-screen)
- Switch to a different tab (e.g., Chat)
- Switch back to Sites
- ✅ Restores to the deep screen? OR ✅ resets to root Sites list? (either is acceptable, but document which behavior exists and flag if it's inconsistent)

**Empty state CTAs:**
- Find at least 2 screens with empty data (e.g., no approvals, no messages yet, no sites assigned)
- ✅ Empty state shows a helpful message + a CTA button?
- ✅ CTA button navigates correctly?
- ❌ CTA does nothing, crashes, or navigates to wrong screen?

---

## SECTION: AI FEATURE EFFECTIVENESS RATINGS

For each feature, actually invoke it and rate the outcome. Do not rate based on whether code exists — rate based on what you observe.

| Feature | Role | How to invoke | What "excellent" looks like | Your Rating | Notes |
|---------|------|--------------|----------------------------|-------------|-------|
| Morning Brief | Owner | Open Brief tab | 1–3 specific risks with site names + evidence; actionable in <30s | / | |
| Decision SLA escalation | Owner | Approvals tab — look for overdue | Overdue decisions highlighted, assignee notified | / | |
| Auto DPR | PM | DPR tab | AI-compiled report that reflects YESTERDAY's site events; PM can send without heavy editing | / | |
| Hindi capture extraction | Supervisor | Type "30 mazdoor aaye" | CaptureCard with headcount:30 (not plain bubble) | / | |
| @ask grounded Q&A | Supervisor | `@ask how many bags of cement this week` | Specific number from real data, cites the source event | / | |
| @nivaan proposals | Supervisor | `@nivaan who needs to be paid` | Grounded answer with evidence, honest abstain if data missing — NO hallucination | / | |
| Voice-to-capture | Supervisor | Hold mic, speak Hindi | Transcript → CaptureCard (not plain text) | / | |
| Camera OCR capture | Supervisor | Send photo of a challan | OCR extracts numbers → CaptureCard with vendor + amount | / | |
| Brief-in-thread pinned card | Supervisor | Open crew chat thread | Site-specific risk chips at top of thread | / | |
| Disputed event blocks approval | Any | Raise dispute, check owner | Blocked notice on related decision | / | |
| Permit expiry sentinel | Owner | Permits screen or Foresight | Expiring permits surfaced prominently | / | |
| Recap / catch me up | Supervisor | Tap recap button in chat | Useful 24h summary, not a useless "here are all messages" dump | / | |
| Nivaan proposal Confirm | Supervisor | @nivaan → Confirm card | Exactly ONE capture event created — no double commit | / | |

---

## KNOWN RISK AREAS — CHECK THESE SPECIFICALLY

These are areas with documented technical debt or recent changes. Prioritize testing them.

1. **Delivery ticks not rendering** — `tickState()` in `src/chat/threadState.ts` is fully built and tested. But the actual rendering in `owner/chat/[id].tsx` and `supervisor/chat.tsx` may be missing. Check if ✓/✓✓ appears on sent messages. If not, identify which file needs the render wiring.

2. **Tap-to-retry for failed sends** — `retryPermanent()` and `flush()` exist in `useChatThread`. No UI affordance was wired as of last review. Find out if a "failed" send has any visible state + retry path.

3. **Architect mobile experience** — This role gets a **blank Stack with no tabs** on mobile (no `app/(contractor)/architect/` directory exists and `_layout.tsx` has no architect case). This is a guaranteed broken experience. Document it and assess the fix.

4. **PM chat access gap** — PM has 2 tabs (DPR + More) with no Chat tab. PM is a coordinator role — lack of mobile chat is a significant gap. Document whether PM can access chat at all.

5. **CaptureCard source duplication** — `supervisor/chat.tsx` was documented as having a latent bug where a multi-event message re-passes `sourceText`/`attachment` to every card. Test by sending a message that produces 2+ events and verify cards are distinct.

6. **Owner Brief empty state CTA** — The "Open a site chat" button (added in PR #180 to replace a dead WhatsApp button) should route to the Chat tab. Verify it actually navigates.

7. **Homeowner channel in owner inbox** — Homeowner-kind conversation rows should be labeled "Homeowner · {site name}" with a user glyph. Verify these are distinct from crew-chat rows and that Nivaan does NOT respond in these threads.

8. **@ask abstain vs hallucinate** — When no data exists for a query, @ask must say "I don't have data on that" (abstain). Test a query for data that doesn't exist and verify it doesn't make up numbers.

9. **Back navigation depth** — All navigation uses `router.back()` (stack-relative). After a cold launch or deep-link, the stack may be shallow, making "back" go to login or an empty state. Test back button from every screen immediately after a fresh app open.

10. **Group member picker — homeowner exclusion** — When adding members to a site group, homeowners must not appear in the picker. Verify this server-side guard works in the UI.

---

## REPORT FORMAT

Output a structured report with the following sections. Be specific — include screen names, file paths where relevant, and exact steps to reproduce.

```
# CONSTRUCTO CONTRACTOR QA REPORT — 2026-06-12

## EXECUTIVE SUMMARY
[3-4 sentences: overall health, biggest blockers, confidence that the app delivers on its promises]

---

## P0 — CRITICAL (crashes, data loss, complete role failure)

### [BUG-001] Title
- **Role:** Owner / Supervisor / PM / Architect
- **Screen:** Screen name / route (e.g., `owner/chat/[id]`)
- **Repro:** Step 1 → Step 2 → Step 3
- **Expected:** ...
- **Actual:** ...
- **AI Impact:** Does this break or degrade an AI feature?
- **File hint:** (if you can pinpoint it in the code)

---

## P1 — HIGH (feature broken, role cannot do their job)
[Same format]

---

## P2 — MEDIUM (wrong behavior, workaround exists)
[Same format]

---

## P3 — LOW (polish, UX inconsistency)
[Same format]

---

## AI FEATURE EFFECTIVENESS RATINGS

| Feature | Status | Quality | Notes |
|---------|--------|---------|-------|
| Morning Brief | Working / Partially / Broken | Excellent / Adequate / Poor | ... |
| ... | | | |

---

## ROLE GOAL ALIGNMENT

For each role, answer one question: "Can [role] do their core job in this app TODAY, without workarounds or WhatsApp?"

**Owner:** YES / PARTIALLY / NO
Reason: ...

**Supervisor:** YES / PARTIALLY / NO
Reason: ...

**PM:** YES / PARTIALLY / NO
Reason: ...

**Architect:** YES / PARTIALLY / NO
Reason: ...

---

## NAVIGATION AUDIT RESULTS

| Screen | Back Button | Status | Notes |
|--------|-------------|--------|-------|
| ... | ... | ✅/❌ | ... |

---

## RECOMMENDED FIX PRIORITY

Ordered by impact on the app's core value proposition:

1. [Most impactful fix] — why it matters
2. ...
```
