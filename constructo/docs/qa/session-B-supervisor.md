# QA Session B — Supervisor Role
# Constructo Contractor App

> You are a QA engineer. Boot an iOS simulator, run the Constructo app, log in as the Supervisor, and test every screen. The supervisor's chat is the most AI-dense surface in the entire product — test every single feature in it. Take a screenshot after every action. Report every broken thing.

---

> **Harness prerequisites — the 2026-06-12 QA run hit all three. Do these FIRST or findings are noise:**
> 1. **Install idb** (taps/typing fail without it): `brew install idb-companion && pipx install fb-idb` (or `pip install fb-idb`).
> 2. **Use a DEV BUILD, not Expo Go** — Expo Go 54 + RN 0.81 crashes on `SegmentFetcher` every launch: `cd constructo/mobile && npx expo run:ios`. Expo Go is OK only for read-only screenshots.
> 3. **Re-seed first** so the AI features have data: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run python -m scripts.seed_qa_company`.

## SETUP

```bash
# 1. Backend must be running on localhost:8000
curl -s http://localhost:8000/health && echo "Backend OK"

# 2. Boot a SEPARATE simulator from any other QA session
xcrun simctl list devices | grep -E "iPhone.*15|iPhone.*16" | grep -v Booted | head -3
xcrun simctl boot 67F0F34F-02A1-4D43-AEB0-7F590A85DB95   # use a different UDID than Session A
open -a Simulator

# 3. Expo must be running (start once, all sessions share it)
# If not running: cd constructo/mobile && npx expo start -c &
xcrun simctl openurl 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 exp://localhost:8081

# 4. idb
idb_companion --boot 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 &
sleep 2

alias shot='xcrun simctl io 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 screenshot'
```

---

## CREDENTIALS
- **Phone:** +919066906818
- **OTP:** 000000
- **Role:** Supervisor (Satvik)

---

## LOGIN

```bash
shot /tmp/qa-B-01-launch.png

idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "+919066906818"
shot /tmp/qa-B-02-phone.png

idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 650
shot /tmp/qa-B-03-otp-screen.png

idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "000000"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 650
sleep 2
shot /tmp/qa-B-04-post-login.png
```

**Record:** Landing screen? Expected: **Capture tab**. ✅ / ❌

Tab bar expected: **Capture · Chat · My Sites · Tasks**

---

## TAB 1: CAPTURE

```bash
shot /tmp/qa-B-05-capture-tab.png
```

**Check:**
- [ ] Quick-capture form visible?
- [ ] Event type options (attendance / delivery / progress / issue)?

```bash
# Try submitting a capture
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 300   # tap event type or input
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "25 workers today"
shot /tmp/qa-B-06-capture-typed.png
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 600   # tap submit
sleep 2
shot /tmp/qa-B-07-capture-submitted.png
```

**Record:** Did capture submit? Any confirmation? ✅ / ❌

---

## TAB 2: CHAT — DEEP TEST (most important section)

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 118 835   # Chat tab
sleep 1
shot /tmp/qa-B-08-chat-opens.png
```

**Record:** Does Chat tab open a thread directly (site thread) or show a screen to pick a site? What exactly appears?

### 2.1 Plain Text Message

```bash
# Tap composer at the bottom
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "hello from supervisor"
shot /tmp/qa-B-09-text-typed.png
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800   # send
sleep 1
shot /tmp/qa-B-10-text-sent.png
```

- [ ] Appears as a plain chat bubble (correct — this is not a capture)?
- [ ] Delivery tick visible?

### 2.2 Hindi/Hinglish Capture — CORE AI FEATURE

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "aaj 30 mazdoor aaye, sab kaam pe"
shot /tmp/qa-B-11-hindi-typed.png
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 3   # wait for AI extraction
shot /tmp/qa-B-12-hindi-result.png
```

**CRITICAL CHECK:**
- [ ] Renders as a **CaptureCard** (structured card with "ATTENDANCE" pill + headcount field)? ✅ = AI working
- [ ] Renders as a plain text bubble? ❌ = AI extraction broken or cards not rendering

### 2.3 Slash Command / Capture Rail

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "/"
sleep 1
shot /tmp/qa-B-13-slash-menu.png
```

- [ ] Slash command menu or chips appear? ✅ / ❌

```bash
# If menu appeared, tap an option (e.g., attendance)
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 <menu-item-y>
# shot /tmp/qa-B-14-slash-selected.png
# send it
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
# shot /tmp/qa-B-15-slash-sent.png
```

### 2.4 @ask — Grounded Q&A

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "@ask how many workers came this week"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 4
shot /tmp/qa-B-16-ask-response.png
```

**Check:**
- [ ] An answer row appears? ✅ / ❌
- [ ] The answer has a specific number (e.g., "30 workers on June 12")? ✅ = grounded
- [ ] Vague or "I don't know"? → check if site data exists in the DB
- [ ] Hallucinated number (no data to support it)? ❌ critical

### 2.5 @nivaan — AI Agent

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "@nivaan how much cement was delivered last week"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 5
shot /tmp/qa-B-17-nivaan-response.png
```

**Check:**
- [ ] "✦ Nivaan" label on response row? ✅ / ❌
- [ ] Grounded answer or honest abstain ("I don't have data on that")? ✅
- [ ] Hallucinated answer? ❌

**If a Proposal Card appears:**
```bash
shot /tmp/qa-B-18-proposal-card.png
# Tap Confirm on the proposal
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 <confirm-button-y>   # adjust from screenshot
sleep 2
shot /tmp/qa-B-19-after-confirm.png
# Check: exactly ONE capture event created? No double?
```

### 2.6 Camera / Photo Capture

```bash
# Look for camera icon in composer area
shot /tmp/qa-B-20-composer-camera.png
# Tap camera icon (left side of composer usually)
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 50 800
sleep 1
shot /tmp/qa-B-21-camera-picker.png
```

**Check:**
- [ ] Image picker / camera opens? ✅ / ❌
- [ ] Select a photo from library
- [ ] Photo uploads?
- [ ] OCR-generated CaptureCard appears in thread?

```bash
# After picking photo:
sleep 3
shot /tmp/qa-B-22-photo-card.png
```

### 2.7 Voice Capture (Hold-to-Talk)

```bash
# Look for microphone button
shot /tmp/qa-B-23-mic-button.png
# Hold the mic button (press-and-hold — this is hard with idb; try a long press)
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 370 800   # mic button approximate position
sleep 2
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 370 800   # release (simulate hold+release)
shot /tmp/qa-B-24-after-voice.png
```

**Check:**
- [ ] TranscriptConfirm screen appears? ✅ / ❌
- [ ] Or does it crash/do nothing? ❌

Note: Voice requires Sarvam/Azure STT to be configured. Document what happens.

### 2.8 Quote Reply

```bash
# Long-press a message bubble (use idb long press)
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400   # approximate position of a message
sleep 2   # hold
shot /tmp/qa-B-25-longpress-menu.png
```

**Check:** Does a context menu appear with "Reply", "Dispute", "Make a to-do"?

```bash
# Tap "Reply" option
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap <reply-option-coords>
# shot /tmp/qa-B-26-reply-context.png
# Check: quote context visible in composer?
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "This is a reply"
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
# shot /tmp/qa-B-27-reply-sent.png
# Check: sent message shows quote bubble above?
```

### 2.9 Dispute a CaptureCard

```bash
# Long-press a CaptureCard (a structured card, not a plain bubble)
# Find a CaptureCard in the thread first
shot /tmp/qa-B-28-find-capturecard.png
# Long-press it
# shot /tmp/qa-B-29-capturecard-menu.png
# Tap "Dispute"
# shot /tmp/qa-B-30-dispute-modal.png
# Fill in reason and submit
# shot /tmp/qa-B-31-after-dispute.png
# Check: card now shows "Disputed" pill?
```

### 2.10 Make a To-Do from Message

```bash
# Long-press any message → tap "Make a to-do"
# shot /tmp/qa-B-32-todo-created.png
# Navigate to Tasks tab and confirm it appears
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 344 835   # Tasks tab
sleep 1
shot /tmp/qa-B-33-tasks-tab.png
# Check: the to-do is listed?
```

### 2.11 Brief-in-Thread (Pinned Risk Card)

```bash
# Scroll to TOP of the chat thread
# Look for a pinned brief/risk card at the very top
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
# Scroll up gesture via idb
shot /tmp/qa-B-34-thread-top.png
```

**Check:**
- [ ] Pinned brief card visible at top of thread? ✅ / ❌
- [ ] Shows site-specific risk chips? ✅ / ❌

### 2.12 Recap / "Catch me up"

```bash
# Look for a recap button (usually in thread header area)
shot /tmp/qa-B-35-recap-button.png
# Tap it
# idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap <recap-button-coords>
# sleep 3
# shot /tmp/qa-B-36-recap-result.png
# Check: useful summary appears as system message?
```

### 2.13 Delivery Ticks

Look closely at your own sent messages in the thread.

```bash
shot /tmp/qa-B-37-delivery-ticks.png
```

**Check:**
- [ ] ✓ (single tick = sent to server) visible? ✅ / ❌
- [ ] ✓✓ (double tick = delivered) visible? ✅ / ❌
- [ ] No ticks at all? ❌ **FLAG THIS** — known gap, ticks are built but rendering may be missing

### 2.14 CaptureCard Duplication Bug

Send a message that could produce multiple events:

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "30 workers aaye, cement bhi aaya 50 bags, slab 80% ho gaya"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 4
shot /tmp/qa-B-38-multi-event.png
```

**Check:**
- [ ] Multiple distinct CaptureCards (attendance + delivery + progress)?
- [ ] Or one card with duplicated source text across cards? ❌ (known latent bug)

### 2.15 Back Button from Chat Thread

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 30 60
sleep 1
shot /tmp/qa-B-39-back-from-chat.png
```

**Record:** Where did back go? Expected: My Sites tab (or previous screen). ✅ / ❌

---

## TAB 3: MY SITES

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 835   # My Sites tab
sleep 1
shot /tmp/qa-B-40-my-sites.png
```

**Check:**
- [ ] Shows ONLY assigned sites (not all company sites — permission boundary)?
- [ ] Site cards show name + location?

```bash
# Tap a site
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 200
sleep 1
shot /tmp/qa-B-41-site-detail.png

# Back
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 30 60
shot /tmp/qa-B-42-back-from-site.png
```

---

## TAB 4: TASKS / ACTION ITEMS

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 344 835
sleep 1
shot /tmp/qa-B-43-tasks.png
```

**Check:**
- [ ] Action items listed (any from the chat long-press test above)?
- [ ] "+" button to create a new to-do?
- [ ] Toggle done/undone works?

```bash
# Create a new to-do
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 60   # + button usually top-right
sleep 1
shot /tmp/qa-B-44-new-todo.png
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "Test action item"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 650   # save
sleep 1
shot /tmp/qa-B-45-todo-created.png
```

---

## REPORT — SESSION B: SUPERVISOR

```
## SESSION B — SUPERVISOR QA REPORT

### Login
- Landed on: [tab name]
- Status: ✅ / ❌

### Capture Tab
- Form loads: ✅ / ❌
- Submit works: ✅ / ❌
- Bugs: [list]

### Chat Tab — AI Feature Results

| Feature | Status | Quality/Notes |
|---------|--------|---------------|
| Plain text message | ✅/❌ | |
| Hindi extraction → CaptureCard | ✅/❌ | headcount extracted correctly? |
| Slash command / capture rail | ✅/❌ | |
| @ask grounded answer | ✅/❌ | specific number? hallucinated? |
| @nivaan response | ✅/❌ | grounded / abstained / hallucinated |
| Camera / photo OCR | ✅/❌ | |
| Voice capture | ✅/❌ | STT configured? |
| Quote reply | ✅/❌ | |
| Long-press menu | ✅/❌ | options shown: |
| Dispute a card | ✅/❌ | "Disputed" pill shown? |
| Make a to-do | ✅/❌ | |
| Brief-in-thread pinned card | ✅/❌ | |
| Recap / catch me up | ✅/❌ | |
| Delivery ticks rendering | ✅/❌ | FLAG if missing |
| CaptureCard duplication | ✅/❌ | |
| Back button | ✅ My Sites / ❌ [went to:] | |

### My Sites Tab
- Only assigned sites shown: ✅ / ❌
- Back works: ✅ / ❌

### Tasks Tab
- Lists items: ✅ / ❌
- Create works: ✅ / ❌

### GOAL ALIGNMENT
Can a supervisor capture site events, communicate with the team, and manage their to-dos — all without WhatsApp?
Answer: YES / PARTIALLY / NO
Reason:

### BUG LIST (P0 first)
| # | Screen | Severity | Description |
|---|--------|----------|-------------|
```
