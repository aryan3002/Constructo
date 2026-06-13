# QA Session A — Owner Role
# Constructo Contractor App

> You are a QA engineer. Boot an iOS simulator, run the Constructo app, log in as the Owner, and test every screen. Take a screenshot after every action. Report every broken thing and rate every AI feature.

---

> **Harness prerequisites — the 2026-06-12 QA run hit all three. Do these FIRST or findings are noise:**
> 1. **Install idb** (taps/typing fail without it): `brew install idb-companion && pipx install fb-idb` (or `pip install fb-idb`).
> 2. **Use a DEV BUILD, not Expo Go** — Expo Go 54 + RN 0.81 crashes on `SegmentFetcher` every launch: `cd constructo/mobile && npx expo run:ios`. Expo Go is OK only for read-only screenshots.
> 3. **Re-seed first** so the AI features have data: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run python -m scripts.seed_qa_company`.

## SETUP (do this first, in order)

```bash
# 1. Start the backend (if not already running)
cd /Users/aryantripathi/Developer/contructionAI/constructo/backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
sleep 3
curl -s http://localhost:8000/health && echo "Backend OK"

# 2. Boot a simulator
xcrun simctl list devices | grep -E "iPhone.*15|iPhone.*16" | head -5
# Pick a UDID from the output, then:
xcrun simctl boot D14F8043-CE43-4AC6-A2E4-4660AA900CD4
open -a Simulator

# 3. Start Expo
cd /Users/aryantripathi/Developer/contructionAI/constructo/mobile
echo 'EXPO_PUBLIC_API_BASE=http://localhost:8000' > .env.local
npx expo start -c &
sleep 8
# Press 'i' or run:
xcrun simctl openurl D14F8043-CE43-4AC6-A2E4-4660AA900CD4 exp://localhost:8081

# 4. Confirm idb works
idb_companion --boot D14F8043-CE43-4AC6-A2E4-4660AA900CD4 &
sleep 2
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 426 && echo "idb OK"

# 5. Screenshot helper
alias shot='xcrun simctl io D14F8043-CE43-4AC6-A2E4-4660AA900CD4 screenshot'
```

**Take a screenshot now.** What screen is showing?

---

## CREDENTIALS
- **Phone:** +919055905818
- **OTP:** 000000
- **Role:** Owner
- **Company:** CivilArch / Tripathi Dream Home

---

## LOGIN

```bash
shot /tmp/qa-A-01-launch.png
# Analyze screenshot — is the login screen showing?

# Tap the phone number input (adjust Y coordinate based on screenshot)
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 400
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "+919055905818"
shot /tmp/qa-A-02-phone-entered.png

# Tap Continue/Next
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 650
shot /tmp/qa-A-03-otp-screen.png

# Enter OTP
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 400
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "000000"
shot /tmp/qa-A-04-otp-entered.png

# Tap Verify
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 650
sleep 2
shot /tmp/qa-A-05-post-login.png
```

**Record:** What screen appears after login? Expected: Brief tab. ✅ / ❌

---

## TAB 1: BRIEF (AI Morning Brief)

This is the #1 AI feature. The owner should see site risks without asking anyone.

```bash
# Should already be on Brief tab. Take screenshot.
shot /tmp/qa-A-06-brief.png
```

**Check and record:**
- [ ] Does the brief load? Are risk cards visible?
- [ ] Are risks specific? (e.g. "Site B: 22 workers vs baseline 40", not generic text)
- [ ] Is a date shown?
- [ ] Tap a risk card — does it navigate somewhere? Where?

```bash
# If a risk card is visible, tap it
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 300   # adjust to where the card is
shot /tmp/qa-A-07-risk-tap.png
# Record: where did it navigate?

# Go back
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
shot /tmp/qa-A-08-back-from-risk.png
```

**If Brief is empty:**
- [ ] Is there an empty state message?
- [ ] Is there a CTA button? Does it say "Open a site chat"?
- [ ] Tap it — does it navigate to Chat tab? ✅ / ❌ (known issue: this button was recently added)

**AI Rating for Brief:** Excellent / Adequate / Too vague / Broken — explain why.

---

## TAB 2: CHAT

```bash
# Tap Chat tab (second tab from left)
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 118 835
sleep 1
shot /tmp/qa-A-09-chat-inbox.png
```

**Check inbox:**
- [ ] Does the inbox load with conversation rows?
- [ ] Are there unread badges on any rows?
- [ ] Are homeowner-channel rows labeled differently ("Homeowner · Site Name")?

```bash
# Tap the first conversation row
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200
sleep 1
shot /tmp/qa-A-10-chat-thread.png
```

**Check thread:**
- [ ] Does message history load?
- [ ] Are CaptureCards visible (structured cards with event-type pill, NOT plain text bubbles)?
- [ ] Do your own sent messages show delivery ticks (✓ or ✓✓)?

```bash
# Send a message
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 800   # tap composer
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "QA test message from owner"
shot /tmp/qa-A-11-message-typed.png
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 360 800   # tap send
sleep 1
shot /tmp/qa-A-12-message-sent.png
```

**Check:**
- [ ] Message appears immediately?
- [ ] Delivery tick visible (✓)?
- [ ] Is it a plain bubble (correct for a non-capture message)?

```bash
# Test @nivaan
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 800
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 text "@nivaan what happened on site this week"
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 360 800
sleep 3
shot /tmp/qa-A-13-nivaan-response.png
```

**Check:**
- [ ] Does "✦ Nivaan" answer row appear? ✅ / ❌
- [ ] Is the answer grounded (cites real data) or hallucinated?

```bash
# Press back from thread
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
sleep 1
shot /tmp/qa-A-14-back-from-thread.png
```

**Record:** Where did back go? Expected: Chat inbox. ✅ / ❌

```bash
# Test group creation — look for a + or compose button
shot /tmp/qa-A-15-inbox-for-group-btn.png
# Tap create group button (coordinates depend on where it is in screenshot)
# idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap <x> <y>
# shot /tmp/qa-A-16-group-create.png
# Fill name, pick site, add member, save
# shot /tmp/qa-A-17-group-created.png
# Press back — where does it go?
```

---

## TAB 3: SITES

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 835
sleep 1
shot /tmp/qa-A-18-sites.png
```

**Check:**
- [ ] All company sites listed?
- [ ] Each row shows site name + location?

```bash
# Tap first site
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200
sleep 1
shot /tmp/qa-A-19-site-detail.png

# Press back
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
sleep 1
shot /tmp/qa-A-20-back-from-site.png
```

**Record:** Back from site detail → Sites list? ✅ / ❌

---

## TAB 4: APPROVALS

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 275 835
sleep 1
shot /tmp/qa-A-21-approvals.png
```

**Check:**
- [ ] Pending decisions listed?
- [ ] Any overdue decision highlighted (different color/badge)?

```bash
# Tap first decision
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200
sleep 1
shot /tmp/qa-A-22-decision-detail.png
```

**Check:**
- [ ] Title + detail + evidence shown?
- [ ] Approve/Reject buttons visible?

```bash
# Back from decision
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
sleep 1
shot /tmp/qa-A-23-back-from-decision.png
```

**Record:** Back → Approvals list? ✅ / ❌

**AI Rating for Approvals:** Are decisions evidence-backed (links to specific site events)? Can owner decide in <30 seconds? Rate: Excellent / Adequate / Too vague / Broken.

---

## TAB 5: MORE

```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 344 835
sleep 1
shot /tmp/qa-A-24-more.png
```

**Test each item — tap, screenshot, check back button:**

**Team:**
```bash
# Tap Team
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 200
shot /tmp/qa-A-25-team.png
# Check: all 4 team members listed with role badges?
# Tap a member
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 250
shot /tmp/qa-A-26-member-detail.png
# Back → Team list?
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
shot /tmp/qa-A-27-back-member.png
# Back → More?
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
shot /tmp/qa-A-28-back-team.png
```

**Permits:**
```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 300  # adjust to Permits row
shot /tmp/qa-A-29-permits.png
# Check: permits listed? Expiring-soon highlighted?
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 250
shot /tmp/qa-A-30-permit-detail.png
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
shot /tmp/qa-A-31-back-permit.png
```

**Foresight/Portfolio:**
```bash
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 196 400  # adjust to Foresight row
shot /tmp/qa-A-32-foresight.png
# Check: per-site health radar? AI risk indicators?
idb ui --udid D14F8043-CE43-4AC6-A2E4-4660AA900CD4 tap 30 60
shot /tmp/qa-A-33-back-foresight.png
```

---

## REPORT — SESSION A: OWNER

Fill this out based on your screenshots and observations:

```
## SESSION A — OWNER QA REPORT

### Login
- Landed on: [screen name]
- Status: ✅ correct / ❌ [describe]

### Brief Tab
- Brief loaded: ✅ / ❌
- Risks shown: [count] — specific / generic / hallucinated
- Risk tap navigation: ✅ / ❌ goes to [screen]
- Empty state CTA: ✅ / ❌
- AI Rating: Excellent / Adequate / Broken
- Bugs: [list]

### Chat Tab
- Inbox loaded: ✅ / ❌
- Thread loaded: ✅ / ❌
- CaptureCards visible: ✅ / ❌
- Message send works: ✅ / ❌
- Delivery ticks render: ✅ / ❌ (KNOWN GAP — flag if missing)
- @nivaan responded: ✅ / ❌ — quality: [describe]
- Back from thread: ✅ Chat inbox / ❌ [went to: ___]
- Bugs: [list]

### Sites Tab
- Sites listed: ✅ / ❌
- Site detail loads: ✅ / ❌
- Back from site: ✅ / ❌
- Bugs: [list]

### Approvals Tab
- Decisions listed: ✅ / ❌
- Overdue highlighted: ✅ / ❌
- Decision detail loads: ✅ / ❌
- Back works: ✅ / ❌
- AI Rating: Decisions evidence-backed? ✅ / ❌
- Bugs: [list]

### More Tab
- Team screen: ✅ / ❌
- Permits screen: ✅ / ❌  
- Foresight screen: ✅ / ❌
- All back buttons: ✅ / ❌
- Bugs: [list]

### GOAL ALIGNMENT
Can the owner do their core job (morning brief → decide → approve) without WhatsApp?
Answer: YES / PARTIALLY / NO
Reason: [1-2 sentences]

### BUG LIST (P0 first)
| # | Screen | Severity | Description |
|---|--------|----------|-------------|
| 1 | | P0/P1/P2/P3 | |
```
