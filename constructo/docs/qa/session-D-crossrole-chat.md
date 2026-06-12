# QA Session D — Cross-Role Chat (2 Simulators)
# Constructo Contractor App

> This session tests things that REQUIRE two users simultaneously: realtime message delivery, unread badges, dispute→approval flow, Nivaan gate. Boot TWO simulators — one logged in as Owner, one as Supervisor. Watch what happens on one when you act on the other.

---

> **Harness prerequisites — the 2026-06-12 QA run hit all three. Do these FIRST or findings are noise:**
> 1. **Install idb** (taps/typing fail without it): `brew install idb-companion && pipx install fb-idb` (or `pip install fb-idb`).
> 2. **Use a DEV BUILD, not Expo Go** — Expo Go 54 + RN 0.81 crashes on `SegmentFetcher` every launch: `cd constructo/mobile && npx expo run:ios`. Expo Go is OK only for read-only screenshots.
> 3. **Re-seed first** so the AI features have data: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run python -m scripts.seed_qa_company`.

## SETUP — TWO SIMULATORS

```bash
# 1. Backend must be running
curl -s http://localhost:8000/health && echo "Backend OK"

# 2. List all available (not yet booted) simulators
xcrun simctl list devices | grep -E "iPhone.*15|iPhone.*16" | grep -v Booted

# 3. Boot TWO simulators with different UDIDs
xcrun simctl boot D14F8043-CE43-4AC6-A2E4-4660AA900CD4       # for Owner
xcrun simctl boot 67F0F34F-02A1-4D43-AEB0-7F590A85DB95  # for Supervisor
open -a Simulator
# Both should appear in Simulator.app

# 4. Expo (one instance serves both)
# If not running: cd constructo/mobile && npx expo start -c &
xcrun simctl openurl D14F8043-CE43-4AC6-A2E4-4660AA900CD4 exp://localhost:8081
xcrun simctl openurl 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 exp://localhost:8081

# 5. idb for both
idb_companion --boot D14F8043-CE43-4AC6-A2E4-4660AA900CD4 &
idb_companion --boot 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 &
sleep 3

# 6. Screenshot helpers — label by role
alias shotO='xcrun simctl io D14F8043-CE43-4AC6-A2E4-4660AA900CD4 screenshot'
alias shotS='xcrun simctl io 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 screenshot'
```

---

## LOGIN — BOTH SIMULATORS

**Login Owner on UDID_OWNER:**
```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 400
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "+919055905818"
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 650
sleep 1
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 400
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "000000"
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 650
sleep 2
shotO /tmp/qa-D-01-owner-logged-in.png
```

**Login Supervisor on UDID_SUPERVISOR:**
```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "+919066906818"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 650
sleep 1
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 400
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "000000"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 650
sleep 2
shotS /tmp/qa-D-02-supervisor-logged-in.png
```

Both simulators should now be logged in.

---

## TEST 1: Realtime Message Delivery (WebSocket)

Does a message sent by Supervisor appear on Owner's screen WITHOUT refreshing?

**Step 1: Open the same site thread on both simulators**

```bash
# Owner: tap Chat tab → tap the site thread
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 118 835   # Chat tab
sleep 1
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200   # tap first conversation
sleep 1
shotO /tmp/qa-D-03-owner-thread-open.png

# Supervisor: tap Chat tab → same site thread should open
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 118 835
sleep 1
shotS /tmp/qa-D-04-supervisor-thread-open.png
```

**Step 2: Supervisor sends a message — watch Owner's screen**

```bash
# Supervisor sends
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "Test realtime: supervisor sending now"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 1
shotS /tmp/qa-D-05-supervisor-sent.png

# Immediately screenshot Owner WITHOUT tapping anything
sleep 2   # give WS delivery time
shotO /tmp/qa-D-06-owner-sees-message.png
```

**CRITICAL CHECK:**
- [ ] Owner's screen shows the Supervisor's message WITHOUT manual refresh? ✅ = WebSocket working
- [ ] Owner must refresh/re-open thread to see message? ❌ = WS broken, app is polling-only

**Record:** Does realtime delivery work? ✅ / ❌

---

## TEST 2: Delivery Ticks (✓ → ✓✓)

After Supervisor's message was sent in Test 1:

```bash
# Check Supervisor's sent message for ticks
shotS /tmp/qa-D-07-supervisor-sent-ticks.png
```

**Check on Supervisor's side:**
- [ ] Single ✓ (sent) visible on the message? ✅ / ❌
- [ ] Did it update to ✓✓ (delivered) once Owner's client received it? ✅ / ❌
- [ ] No ticks at all? ❌ — document the missing rendering

---

## TEST 3: Unread Badge Flow

**Step 1: Navigate Owner away from the thread (to Brief tab)**

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 49 835   # Brief tab
sleep 1
shotO /tmp/qa-D-08-owner-on-brief.png
```

**Step 2: Supervisor sends a NEW message**

```bash
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 118 835
sleep 1
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 196 800
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 text "Badge test message"
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 360 800
sleep 2
shotS /tmp/qa-D-09-supervisor-badge-message.png
```

**Step 3: Check Owner's Chat tab badge**

```bash
shotO /tmp/qa-D-10-owner-badge-check.png
```

**Check:**
- [ ] Chat tab on Owner shows an unread badge count? ✅ / ❌
- [ ] Badge number is correct (1)?

**Step 4: Owner opens the thread — badge should clear**

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 118 835
sleep 1
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200
sleep 1
shotO /tmp/qa-D-11-owner-opened-thread.png
# Navigate back to see if badge cleared
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
sleep 1
shotO /tmp/qa-D-12-badge-cleared.png
```

**Check:** Badge clears after opening the thread? ✅ / ❌

---

## TEST 4: Nivaan Gate — Must NOT Respond in Homeowner Channel

This is a safety/correctness test. Nivaan must only respond in CREW threads.

**Step 1: Find a homeowner-channel conversation in Owner's chat inbox**

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 118 835
sleep 1
shotO /tmp/qa-D-13-owner-inbox.png
# Look for a row labeled "Homeowner · [site name]" or with a user/house icon
# If visible, tap it
# idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 <homeowner-row-y>
# sleep 1
# shotO /tmp/qa-D-14-homeowner-thread.png
```

**Step 2: Send @nivaan in the homeowner channel**

```bash
# idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 800
# idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "@nivaan test"
# idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 360 800
# sleep 3
# shotO /tmp/qa-D-15-homeowner-nivaan-test.png
```

**CRITICAL CHECK:**
- [ ] NO "✦ Nivaan" response appears? ✅ = gate working correctly
- [ ] Nivaan DOES respond in the homeowner channel? ❌ = structural membrane failure — critical bug

---

## TEST 5: Dispute → Approval Block

This tests whether a dispute raised by Supervisor correctly blocks the Owner from approving.

**Step 1: Supervisor raises a dispute on a CaptureCard**

```bash
# Supervisor: in the crew chat thread, long-press a CaptureCard
idb ui --udid 67F0F34F-02A1-4D43-AEB0-7F590A85DB95 tap 118 835
sleep 1
shotS /tmp/qa-D-16-supervisor-in-thread.png
# Long-press a CaptureCard (a structured card, not a plain bubble)
# Tap "Dispute" in the menu
# Fill reason: "Wrong headcount — should be 25 not 30"
# Submit
# shot /tmp/qa-D-17-dispute-submitted.png
# Check: card shows "Disputed" pill?
```

**Step 2: Owner checks Approvals tab for related decision**

```bash
# Owner: go to Approvals tab
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 275 835
sleep 1
shotO /tmp/qa-D-18-owner-approvals.png
# Look for a decision related to the disputed event
# Is there a "Blocked" or "Disputed" notice on it?
```

**Check:**
- [ ] Related approval shows a blocked/disputed notice? ✅ / ❌
- [ ] Owner cannot approve while dispute is open? ✅ / ❌

---

## TEST 6: @ask Cross-Check (Owner asking about Supervisor's captures)

Owner asks about what happened on site — the data was captured by Supervisor.

```bash
# Owner in a crew site thread
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 118 835
sleep 1
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200   # crew thread
sleep 1
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 800
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "@ask what did the supervisor capture today"
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 360 800
sleep 4
shotO /tmp/qa-D-19-owner-ask-response.png
```

**Check:**
- [ ] Answer row appears with data from the Supervisor's captures in this session? ✅
- [ ] Answer is empty or wrong? ❌

---

## REPORT — SESSION D: CROSS-ROLE CHAT

```
## SESSION D — CROSS-ROLE CHAT QA REPORT

### Realtime Delivery (WebSocket)
- Supervisor message appeared on Owner WITHOUT refresh: ✅ / ❌
- Delay (if any): [seconds]
- If broken: is the app falling back to polling?

### Delivery Ticks
- Single ✓ renders on sent message: ✅ / ❌
- Updates to ✓✓ on delivery: ✅ / ❌
- Note: If ticks are missing entirely, this is a known rendering gap —
  the logic in threadState.ts is built but the screen may not render it.

### Unread Badges
- Badge appears on Chat tab: ✅ / ❌
- Badge count correct: ✅ / ❌
- Badge clears on thread open: ✅ / ❌

### Nivaan Gate (homeowner channel)
- Homeowner channel found in inbox: YES / NO
- @nivaan in homeowner channel: NO response ✅ / Responded ❌ CRITICAL BUG
- Note if no homeowner channel found: [explain]

### Dispute → Approval Block
- Dispute raised: ✅ / ❌
- "Disputed" pill on card: ✅ / ❌
- Owner approval blocked: ✅ / ❌

### @ask Cross-Role
- Owner @ask returns Supervisor's captured data: ✅ / ❌
- Answer quality: accurate / wrong / empty

### SUMMARY
The cross-role chat system is: SOLID / PARTIALLY WORKING / BROKEN
Key failures: [list]

### BUG LIST
| # | Test | Severity | Description |
|---|------|----------|-------------|
```
