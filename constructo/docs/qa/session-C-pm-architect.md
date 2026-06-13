# QA Session C — PM + Architect Roles (Sequential)
# Constructo Contractor App

> Test PM first, then log out and test Architect. Both on the same simulator. PM has limited mobile screens. Architect has NO dedicated screens — document exactly what the blank experience looks like.

---

> **Harness prerequisites — the 2026-06-12 QA run hit all three. Do these FIRST or findings are noise:**
> 1. **Install idb** (taps/typing fail without it): `brew install idb-companion && pipx install fb-idb` (or `pip install fb-idb`).
> 2. **Use a DEV BUILD, not Expo Go** — Expo Go 54 + RN 0.81 crashes on `SegmentFetcher` every launch: `cd constructo/mobile && npx expo run:ios`. Expo Go is OK only for read-only screenshots.
> 3. **Re-seed first** so the AI features have data: `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run python -m scripts.seed_qa_company`.

## SETUP

```bash
curl -s http://localhost:8000/health && echo "Backend OK"

xcrun simctl list devices | grep -E "iPhone.*15|iPhone.*16" | grep -v Booted | head -3
xcrun simctl boot D905E133-D9DD-4CFD-9AC5-A471B09C0A5D
open -a Simulator
xcrun simctl openurl D905E133-D9DD-4CFD-9AC5-A471B09C0A5D exp://localhost:8081
idb_companion --boot D905E133-D9DD-4CFD-9AC5-A471B09C0A5D &
sleep 2

alias shot='xcrun simctl io D905E133-D9DD-4CFD-9AC5-A471B09C0A5D screenshot'
```

---

## PART 1: PROJECT MANAGER (+919011901818, Akhanda)

### Login as PM

```bash
shot /tmp/qa-C-01-launch.png

idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 400
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D text "+919011901818"
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 650
shot /tmp/qa-C-02-otp.png

idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 400
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D text "000000"
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 650
sleep 2
shot /tmp/qa-C-03-pm-landing.png
```

**Record:** What screen appears? Expected: **DPR tab**. Tab bar expected: **DPR · More**. ✅ / ❌

If a blank screen appears with no tabs → that is a routing bug. The `_layout.tsx` may not be routing to the PM group. Document precisely.

---

### PM Tab 1: DPR (Daily Progress Report)

This is the PM's primary mobile feature. The DPR must be **AI-drafted** from the day's site captures — the PM should not need to type it.

```bash
shot /tmp/qa-C-04-dpr.png
```

**Check:**
- [ ] DPR content loads? ✅ / ❌
- [ ] Content reflects actual site events (attendance, deliveries, progress updates from supervisor)?
- [ ] Or is it a blank/placeholder/generic template? ❌

**Read the DPR content carefully.** Ask yourself: would a PM send this to the owner right now without editing?

Rate: **Ready to send / Needs light edit / Needs heavy edit / Completely wrong / Blank**

```bash
# Look for Share / Send button
shot /tmp/qa-C-05-dpr-share-btn.png
# Tap share
# idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap <share-btn-coords>
# shot /tmp/qa-C-06-share-sheet.png
# Check: OS share sheet opens (WhatsApp, email, etc.)?
```

**Back button from DPR:** DPR is the root tab — there's no back to go. Is it stable? ✅ / ❌

---

### PM Tab 2: More

```bash
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 835   # More tab (second tab)
sleep 1
shot /tmp/qa-C-07-pm-more.png
```

**Check:**
- [ ] Shows PM's name + phone + role?
- [ ] Sign-out button present?
- [ ] Sign out works (returns to login)?

---

### PM: Chat Access Gap Check

PM has NO Chat tab on mobile. But PM is the team coordinator — this is a significant gap.

**Check the following:**
1. Is there any way to access chat from PM mobile screens at all? (button in DPR? in More?)
2. Open the code: `constructo/mobile/app/(contractor)/pm/dpr.tsx` — is there any chat button or navigation to chat?
3. Open: `constructo/mobile/app/(contractor)/pm/more.tsx` — same check.

```bash
# Take a screenshot of each PM screen and look for any chat affordance
shot /tmp/qa-C-08-pm-chat-check.png
```

**Record:** Can PM access chat from mobile? YES / NO
If NO — note this as a gap. PM can't coordinate with their team on mobile.

---

### Logout (prepare for Architect test)

```bash
# Find and tap sign-out in More tab
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 835   # More tab
sleep 1
shot /tmp/qa-C-09-before-logout.png
# Tap sign out (usually at bottom of More screen)
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 700   # approximate
sleep 1
shot /tmp/qa-C-10-logged-out.png
# Confirm: back on login screen?
```

---

## PART 2: ARCHITECT (+919022902818, Munna bhaiya)

> ⚠️ **Pre-test note:** The architect role has NO dedicated directory in the mobile app (`app/(contractor)/architect/` does not exist). The contractor layout (`_layout.tsx`) has NO architect-specific routing case. This will almost certainly result in a broken or blank experience. Document exactly what happens.

### Login as Architect

```bash
shot /tmp/qa-C-11-login-fresh.png

idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 400
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D text "+919022902818"
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 650
shot /tmp/qa-C-12-otp.png

idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 400
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D text "000000"
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 650
sleep 2
shot /tmp/qa-C-13-architect-landing.png
```

**CRITICAL: Document exactly what you see.**

Expected behavior (what SHOULD happen — not what will): Architect should see some usable screen.
Actual behavior: Describe precisely — blank white screen? Blank Stack with no tabs? Crash? Some other role's screen?

---

### Architect: What CAN They Do?

Even without dedicated screens, test if basic functionality works:

```bash
# Is there ANY navigation visible? Tabs? Header? Anything?
shot /tmp/qa-C-14-architect-state.png

# Can you tap anything?
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 196 426   # tap center
shot /tmp/qa-C-15-after-tap.png

# Is there a back button anywhere?
idb ui --udid D905E133-D9DD-4CFD-9AC5-A471B09C0A5D tap 30 60
shot /tmp/qa-C-16-after-back.png
```

**Answer these questions:**
1. Can architect see any site information?
2. Can architect access chat (they are a crew member — chat doesn't require dedicated screens)?
3. Is there any graceful fallback message ("Use the web dashboard for full access")?
4. Does the app crash?

---

### Architect: Code-Level Fix Assessment

Look at the routing file: `constructo/mobile/app/(contractor)/_layout.tsx`

```bash
cat constructo/mobile/app/\(contractor\)/_layout.tsx
```

**Document:**
- Does the file have a case for `role === 'architect'`?
- If not — what is the minimal fix? Options:
  1. Route architect to the PM layout (both are office/desk roles with limited mobile needs)
  2. Create a minimal `app/(contractor)/architect/` directory with a chat + more screen
  3. Add a "web-primary" redirect screen with a helpful message

**Recommend the fix** based on what makes the most sense for the product.

---

## REPORT — SESSION C: PM + ARCHITECT

```
## SESSION C — PM + ARCHITECT QA REPORT

### PM — Login
- Landed on: [screen]
- Tab bar shows: [list tabs]
- Status: ✅ DPR tab / ❌ [describe]

### PM — DPR Screen
- DPR loads: ✅ / ❌
- Content quality: Ready to send / Needs light edit / Needs heavy edit / Blank
- AI-drafted content reflects real events: ✅ / ❌
- Share button works: ✅ / ❌ (share sheet opens)
- Bugs: [list]

### PM — Chat Access
- Chat accessible from mobile: YES / NO
- Where (if yes):
- Gap severity: Minor / Significant / Blocker

### PM — GOAL ALIGNMENT
Can a PM compile and share a DPR without manually writing it?
Answer: YES / PARTIALLY / NO
Reason:

---

### ARCHITECT — Login
- What appears post-login: [describe exactly]
- Crash: YES / NO
- Blank screen: YES / NO
- Any tabs visible: YES / NO — [list if yes]

### ARCHITECT — Usability
- Can read site info: YES / NO
- Can access chat: YES / NO
- Graceful fallback message: YES / NO
- Status: COMPLETELY BROKEN / PARTIAL / ACCEPTABLE

### ARCHITECT — Recommended Fix
[Your recommendation for the minimum fix to unblock this role on mobile]

### ARCHITECT — GOAL ALIGNMENT
Can an architect participate in site communication and track design decisions on mobile?
Answer: YES / PARTIALLY / NO — [explain]

---

### BUG LIST
| # | Role | Screen | Severity | Description |
|---|------|--------|----------|-------------|
| 1 | PM | DPR | | |
| 2 | Architect | Login | P0 | No mobile screens — [describe] |
```
