# Neev pre-launch review

*24 Oct 2026 · main @ e30d296 · mobile app (Expo SDK 54), backend (FastAPI), web console.*
*Visual version with screenshots: https://claude.ai/artifact/HdnpkRCWJU3U6KDFaCrEBh (private until shared). IDs (S1, T1, D1) are stable so fixes can reference them.*

## Verdict

Neev has a real product underneath. The idea is clear, nearly every screen runs on live data, the empty states are well written, sign-in is polished, and 451 mobile tests pass. It is not ready for store submission yet.

The review found **9 stop-ship problems**. A release build shows junk tabs that crash the app. Anyone can sign in as anyone. New builders who sign up land in one shared company. Settings is a dead end on iPhone. Store requirements are missing: a privacy policy, account deletion for most roles, consent for AI processing, and Android photo permissions that Google Play will flag. A further 9 problems lose user data or show wrong facts, chat included.

On design, the “not up to the mark” feeling doesn’t come from any single screen. The contractor app runs two visual systems, and many screens contradict themselves: “All calm” above four items that need you, “Delayed” in a list and “Healthy 100/100” on the same site’s page. Fixing coherence and honesty will do more for the app than restyling it.

## Stop-ship: fix before submitting

### S1. Release builds show junk tabs that crash the app  
*Reproduced*

In a production build the owner’s tab bar has 13 buttons: the 5 real tabs, squeezed to “B / Si / C / S / A”, plus 8 tabs made from helper files. Tapping one blanks the screen. The mukadam bar gets one extra. Development builds and Expo Go hide this, so it never showed up in testing.

**Why:** Expo Router treats every file under `app/` as a route. It only skips files without a default export in development.

**Fix:** Move the 28 helper files (`_components.tsx`, `_brief.util.ts` and so on) from `app/` into `src/`. Add a test that fails when a non-layout file under `app/` has no default export. Smoke-test an EAS preview build before every submission.

**Where:** `mobile/app/(contractor)/owner/_*.ts(x)` (8 files), `mukadam/_voice.tsx`, and 19 more under `app/`

### S2. Anyone can sign in as anyone  
*Reproduced*

There is no SMS provider. The OTP is the fixed code 000000, and `/auth/request-otp` returns it in its response as `dev_otp`. With an allowlist set, the production guard still accepts the fixed code, and phone numbers are not secrets. Login, OTP and join have no rate limits.

**Fix:** Wire a real OTP provider. SMS to Indian numbers needs TRAI DLT registration (entity, sender ID, template), which takes time, so start now; WhatsApp authentication messages are an alternative. Never return `dev_otp` outside development. Rate-limit and lock out per phone and per IP. Give Apple and Google one review number with a fixed code that only reaches a demo company.

**Where:** `backend/app/auth/otp.py`, `auth/router.py:119`, `config.py:150`

### S3. New builders who sign up share one company  
*Reproduced*

An unknown phone number becomes an owner of a shared company called “Default Company”. The mobile app has no company-setup step, so the second builder who signs up from the store lands in the first builder’s company and sees their sites, team, payments and chat. A teammate who mistypes their number also silently creates a workspace.

**Fix:** Create a company per signup with a short setup step (company name, first site), or make launch invite-only. Ask before creating anything: “This number isn’t registered. Start a new company?”

**Where:** `backend/app/auth/router.py:106-156`

### S4. The service key defaults to a public value  
*Reproduced*

`INGEST_API_KEY` defaults to `dev-ingest-key`, and the production boot check doesn’t cover it. If production runs without it set, anyone can inject site events into any company, read the owner’s phone and brief, and approve decisions through `/bot/reply`.

**Fix:** Add this key and `BRIDGE_KEY` to the fail-closed production check and rotate them. Check the live environment today.

**Where:** `backend/app/config.py:29`, `ingestion/router.py`, `bot/router.py`

### S5. iPhone users get stuck in Settings  
*Verified in code*

Settings, Members, Notifications and Finishes are pushed screens inside the tab navigator. The tab bar hides itself on pushed screens, and these four have no back button. iPhones have no back button and tab screens have no swipe-back, so the only ways out are signing out or force-quitting. This is also where a reviewer goes looking for Delete account.

**Fix:** Move pushed screens into a Stack (this also stops state leaking between visits; see All other findings), or give them the shared header with a back button.

**Where:** `mobile/app/(homeowner)/settings.tsx`, `members.tsx`, `notifications.tsx`, `_layout.tsx`

### S6. Account deletion is incomplete  
*Verified in code*

Only homeowners and owners can delete their account in the app. Site engineers, architects, accountants, PMs and mukadams can’t. After deletion the phone keeps receiving push notifications, and the person’s real name stays on their messages. Google Play also wants a web page where people can request deletion, and there isn’t one.

**Fix:** One shared Account section in every role (language, delete account, sign out). On deletion, delete push tokens and scrub sender names. Publish a deletion-request page on the web.

**Where:** `backend/app/auth/router.py:326`, `push/sender.py:121`; mobile has it only in `(homeowner)/settings.tsx` and `owner/more.tsx`

### S7. No privacy policy, and no consent for AI processing  
*Verified in code*

Neither the app nor the web console links to a privacy policy or terms, and both stores require one (Apple wants it inside the app too). Photos, voice notes and chat messages go to OpenAI or Azure OpenAI for extraction, transcription and drafting. Apple guideline 5.1.2(i) requires telling people and getting explicit permission before sharing personal data with third-party AI.

**Fix:** Write and host a privacy policy and terms, and link both from sign-in and settings. Add a one-time consent screen that names the AI providers and what gets sent.

**Where:** Whole app; no `privacy` or `terms` link exists in `mobile/` or `web/`

### S8. Android photo permissions will be flagged by Google Play  
*Verified in code*

The manifest asks for `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `ACCESS_MEDIA_LOCATION` and the old storage permissions. The app picks photos through the system picker, so it doesn’t need them, and Play’s Photo and Video Permissions policy rejects broad access without a core need. The only user is “Save photo”, which asks for full read access when write-only would do.

**Fix:** Remove them with `android.blockedPermissions`, set `isAccessMediaLocationEnabled` to false, and save with write-only permission.

**Where:** `mobile/app.json`, `(homeowner)/photos.tsx:861`

### S9. Non-owners can end up approving money  
*Verified in code*

Tapping a chat notification sends every non-homeowner (site engineer, accountant, PM, architect, mukadam) into the owner’s screens, where Approve is always shown. The approve, reject and batch endpoints don’t check the role, so the approval goes through. A mukadam’s login can list the ₹72,000 invoice approval.

**Fix:** A role guard in every role layout, role-aware notification routing, owner-only approve/reject/batch on the server, and “Propose to owner” for everyone else.

**Where:** `mobile/app/_layout.tsx:141`, `owner/_components.tsx:394`; `backend/app/approvals/router.py:217-300`

## Wrong facts and lost data

### T1. Chat drops messages

A message sent while another one is still uploading gets deleted from the outbox (reproduced against the real module). One failed message blocks its conversation forever. Requests have no timeout, and Android’s default is no timeout, so one stalled request freezes every chat send until the app restarts.

**Fix:** One lock around outbox writes, drain by message id, skip parked items, add a delete action and request timeouts.  
**Where:** `mobile/src/chat/outbox.ts:86-190`, `src/api/client.ts`

### T2. Signing out leaves the last person’s data on the phone

Cached screens, the chat cache, the live socket and the push token all survive. Unsent outbox items survive too and then post under the next person’s login. Site phones are often shared.

**Fix:** One `resetSession()` on sign-out, deletion and user switch that clears the query cache, local storage, socket and push token.  
**Where:** `mobile/src/auth/AuthContext.tsx:168`

### T3. Expired sessions break things quietly

Logins last 24 hours with no refresh, and nothing handles a 401. Queued offline captures are deleted on a 401. An offline or server-error cold start drops people back to the login chooser.

**Fix:** Keep the session on network errors, handle 401 in one place, add refresh tokens, never drop queued items.  
**Where:** `backend/app/config.py:32`, `mobile/src/offline/useOutbox.ts:17`, `AuthContext.tsx:79`

### T4. Homeowners see the builder’s internal approvals

Homeowner Home shows “Approve ACC cement invoice (₹72,000)? Invoice bills 120 bags but the site logged 100.” That reveals the supplier, the purchase price and a suspected over-billing.

**Fix:** Have `/homeowner/decisions` return homeowner questions only.  
**Where:** `backend/app/homeowner/router.py:2427`

### T5. Homeowner screens state things that aren’t true

“Total paid ₹22,500” is really the sum of change-order cost changes. These are all hard-coded: the “Pre-approved” pill, the milestone “On track” pill (still showing after the handover date passed), “Pending your approval” on every drawing, and the Messages participant list.

**Fix:** Derive every status from data, or remove it.  
**Where:** `(homeowner)/home.tsx:779, 1024`, `updates.tsx:431`, `design.tsx:836`

### T6. Things homeowners send that never arrive

Photos on an issue report aren’t attached to the request. Intake reference photos upload a device `file://` path. The change-comment Send button throws the note away.

**Fix:** Attach photo keys to the request, reuse the profiler’s presigned upload, and wire up or remove Send.  
**Where:** `(homeowner)/issue.tsx:320`, `app/intake.tsx:273`, `updates.tsx:1239`

### T7. Switching language overwrites the design profile

Toggling the language in Settings replaces the household’s confirmed design profile with a fresh AI draft, and each tap costs an AI call.

**Fix:** Remove the call.  
**Where:** `(homeowner)/settings.tsx:163`

### T8. Money actions have no guard rails

Approve on a payment hold is one tap, with no confirmation, no undo and no error message if it fails. On the server any role can create, edit or delete payment records, and a PM can create an owner.

**Fix:** Confirm and undo for money, an error toast on every mutation, role checks on the server.  
**Where:** `owner/brief.tsx:100`, `backend/app/payments/router.py:300`, `sites/router.py:467`

### T9. Site capture can lose or duplicate records

Captures are dropped on a 401. Two queue instances drain at once with no lock, and `/capture` has no idempotency key, so a flaky reconnect can file the same photo twice. The queue isn’t per user. Opening the app offline says “No site assigned”.

**Fix:** One locked drain, an idempotency key, sites cached for offline use, a queue per user.  
**Where:** `mobile/src/offline/useOutbox.ts`, `supervisor/capture.tsx:141`

## Design review

The design has good parts. The front door, sign-in, the site engineer’s Home and the owner’s Brief are calm, legible and clearly made by the same team. The problems are systemic, and these seven account for most of the “not up to the mark” feeling.

### D1. Two design systems in one contractor app, and a third on the web

Owner, site engineer and architect use the homeowner’s Calm Cockpit: sand, sage, serif headings. Accountant, PM and mukadam use Neev Site Register: paper, ink buttons, marigold, grotesque headings and monospace labels. There are three tab bars too: a stock bar with clipped labels, a floating bar with a camera button and a floating bar with a clay button. The web console has a third look (amber Blueprint). An owner and their accountant would think they were using different apps.

**Fix:** Pick one system with two densities. Calm Cockpit is the better base: the best and most-used contractor screens already run on it, and moving accountant, PM and mukadam (about 2,600 lines) costs far less than moving owner, engineer and architect (about 15,000 lines). Give contractor roles a denser type scale and keep Neev’s money and evidence components inside the one system. Reskin the web from the same tokens after launch.

### D2. Screens contradict themselves

For an app whose promise is an honest record, this does the most damage.

- Homeowner Home: “Today · All calm. One thing for you.” sits above “Needs your input (4)” and a chip saying “4 choices for you”.
- Design tab: “Building your brief · 33% complete” sits directly above “Your brief is ready — review and send it”.
- Owner: Verma Duplex is “Delayed” in Sites and “Healthy 100/100 · All clear” on its own page.
- Accountant: “At risk −₹12,000” sits above “0 open flag(s)” and “No money flags right now”.
- PM: the progress-report draft says “Couldn’t hear clearly” on a day with no activity at all.
- Web: “6 need you” sits above “Needs you · 2 open”, and the decision log labels pending items “Approved”.

**Fix:** One server-computed count per concept, statuses derived from data, and a copy pass for each state (empty, one, many, overdue). Drop the 0–100 health score, which breaks your own no-fake-percentages rule.

### D3. Navigation changes from screen to screen

- Four back styles (“‹ Back”, a bare chevron, “‹ Home”, none) and about 26 hard-coded back routes, some to the wrong parent.
- Some screens have a large serif title and the Design tab has none. Twelve owner and accountant screens sit under the status bar.
- The owner, PM, accountant and mukadam tab bars ignore the home indicator, and their labels get clipped.
- The homeowner app has 5 tabs where the spec locks 4. The Photos tab is titled “Media”. The engineer’s “Tasks” tab shows “Asks”.

**Fix:** One Screen and Header component everywhere (title, back, safe area), pushed screens in a Stack, and `router.back()` instead of hard-coded parents.

### D4. Content is cut off where it matters

Request titles are cut at about 15 characters (“Crack in guest bedr…”). Milestone labels shrink to “Found… Found… Struct…”. Chips wrap mid-label (“By / Milestone”, “Add / inspiration”, “Mark / up”). Photo cards carry five actions with two floating buttons on top, and the Ask pill covers the last card.

**Fix:** Let titles wrap to two lines, show three milestone labels (previous, now, next), cap action rows at three with a menu for the rest, and use one floating button per screen.

### D5. One language per screen isn’t holding

- About 365 hard-coded English strings in 61 files. With Hindi selected, the site engineer and architect apps are entirely English, and the homeowner Design tab is English apart from the tab bar.
- English screens mix in Hinglish: “Photo bhejo”, “Bolkar batao”, “Sun lo”.
- Raw values reach the screen: “active”, “residential”, “kitchen”, “1 members”, “flag(s)”.
- The language saved on the server is never applied, so reinstalling resets Hindi users to English. Most roles have no language switch.

**Fix:** Move every string into the catalog (58 files keep private en/hi tables), add a lint rule against raw JSX text, apply the saved language at login, and put the switch in every role’s Account section.

### D6. Details drift off the system

- Bright blue and green status colours on homeowner Updates, in a palette that has no blue. Yellow “Site team” text on Ask at about 2:1 contrast.
- Emoji used as icons (👷 📦 🏠 💰 🔊) next to the Feather icon set.
- Monospace for phone numbers, dates and labels, which reads like debug output. Phone numbers unformatted (+919810000001).
- Duplicated kit pieces: Chip three times, SubHeader four times, StatTile three times, about 86 one-off cards and rows, and 805 lines of unused kit components.

**Fix:** A token audit (no hex values in screens), one icon set, monospace only for money and codes, then delete the duplicates.

### D7. Launch feels slow

No native splash is configured, so launch goes white, then cream, then sand. Thirty font files (5.8 MB, 11 of them unused) load before the first frame, and then a fixed 2.9-second animation plays on every cold start. The Android notification icon is the full-colour app icon, which Android draws as a white square.

**Fix:** Configure `expo-splash-screen` in sand with the mark and hold it until fonts and session are ready. Drop unused fonts. Play the long animation only on first launch. Add a monochrome notification icon.

### What to keep

- The front door, sign-in and join flow
- The site engineer’s Home and the Capture idea
- The owner Brief’s hierarchy: decisions first, sites at a glance, recent decisions
- The Settings and Members layouts
- Empty-state copy such as “All caught up”
- Status shown as icon plus word, and reduced-motion support

## Store submission checklist

### Apple App Store

- ❌ Demo login for the reviewer (needs the review number from S2)
- ❌ Privacy policy link in App Store Connect and inside the app (5.1.1(i))
- ❌ In-app account deletion for every account type (5.1.1(v)); 2 of 7 roles have it
- ❌ Disclosure and explicit consent before sending personal data to third-party AI (5.1.2(i))
- ❌ No placeholder content (2.1): about ten “coming soon” stubs, and the dev gallery opens from a deep link
- ⚠️ Chat between users (1.2): add report message, block user and a published contact
- ⚠️ `supportsTablet` is true, which means iPad screenshots and review on iPad. Set it to false unless you design for iPad
- ⚠️ App Privacy answers: phone number, name, photos, audio, messages, financial info, device ID
- ✅ Export-compliance flag, camera/mic/photo permission text, Xcode 26 support in SDK 54. No third-party login, so Sign in with Apple isn’t needed

### Google Play

- ❌ Data safety form, including a web link for account deletion
- ❌ Photo and video permissions (S8)
- ❌ App access instructions with a test login
- ❌ Privacy policy URL
- ⚠️ New personal developer accounts must run a closed test with 12+ testers for 14 days before production. Start early; organisation accounts are exempt
- ⚠️ AI-generated content: let people report an AI answer (Ask, drafts)
- ⚠️ Notification icon must be monochrome
- ✅ Target API 36 (React Native 0.81)

### Build and release

- ❌ `eas.json` production profile has no `autoIncrement`. With `appVersionSource: remote` the second upload is rejected for a duplicate build number
- ❌ No crash reporting. Add Sentry before the closed test
- ❌ The API base falls back to `http://10.0.2.2:8000`, and `eas update` doesn’t read the build env in `eas.json`. One OTA publish from a dev machine with the default `.env` breaks every install. Fail loudly in release builds and publish with `eas update --environment production`
- ⚠️ The production API uses the raw `azurecontainerapps.io` hostname. Move it to your own domain before binaries ship
- ⚠️ `submit.production` is empty (App Store Connect app ID, Play service account)
- ⚠️ `EXPO_PUBLIC_WEB_BASE` isn’t set, so invite and vendor-confirm links point at the API host and 404

## Security (backend)

| Severity | Issue | Where |
|---|---|---|
| Critical | Every self-signup joins one shared company as an owner (S3) | `auth/router.py:106-156` |
| Critical | Service key defaults to `dev-ingest-key` and isn’t in the prod guard (S4) | `config.py:29` |
| High | Payment records can be created, edited and deleted by any role, on any site | `payments/router.py:300-339` |
| High | Homeowners receive internal approvals with vendor and price (T4) | `homeowner/router.py:2427` |
| High | A PM can create an owner through `POST /users` | `sites/router.py:467` |
| High | Join codes minted without a phone can be redeemed by anyone; codes never expire; no throttle | `homeowner/router.py:351-465` |
| High | Approve, reject and batch don’t check the role (S9) | `approvals/router.py:217-300` |
| High | Deletion leaves push tokens and real names behind (S6) | `auth/router.py:326` |
| Medium | No rate limiting anywhere; fixed OTP accepted with an allowlist (S2) | `auth/otp.py` |
| Medium | 24-hour tokens with no revocation on sign-out | `config.py:32` |
| Medium | `/docs` and `/openapi.json` public in production | `main.py:80` |
| Low | CORS allows private-network origins in production | `main.py:94` |
| Low | A step-up token works as a normal access token | `auth/deps.py:17` |
| Low | SSRF DNS-rebinding window in the URL guard (Labs-only path) | `extraction/url_guard.py:38` |
| Low | In-process scheduler has no leader lock; keep exactly one replica | `scheduler.py:157` |

What held up: access by ID across companies for sites, events, payments, approvals, permits and chat. The reviewer tried it against three real companies and couldn’t break it. The SSRF guard, presigned-upload prefixes and the JWT-secret boot check are real protections.

## Web console

The contractor desk is real software on the live API, with visible keyboard focus and a complete en/hi catalog. Its problems are trust bugs in the owner’s main loop and a frame that breaks on many routes.

- Home’s Approve, Hold and Assign create a new decision instead of acting on the approval, so the item comes back on reload with a duplicate (`features/owner/useDecide.ts:124`).
- The “append-only” decision log labels rows by type, so pending items show “Approved” (`features/owner/DecisionLog.tsx:17`).
- Signing out leaves the previous company’s data on screen for the next person, and an expired token shows “All quiet” forever.
- Seven routes (Approvals, Payments, Permits, Search, Settings, Site Health, Invite) render without the app frame. Payments and Permits overflow sideways.
- PMs land on the owner’s screen. On a phone, owners get a 9-tab bar and the admin console is 664px wide.
- Status and action text sits at 2–3.5:1 contrast, and Tailwind’s opacity variants never generate because colours are CSS variables, so status pills render as hollow boxes.
- Hindi is half connected, and chat (20 files) isn’t translated.
- Three looks: the default amber Blueprint, an optional “neev” skin that is really the homeowner palette, and the mobile Neev.

**Recommendation:** Fix the frame and the trust bugs first. Reskin after launch from the same tokens as the mobile app.

## Plan

### Phase 0: Stop-ship fixes (about 2 weeks)

- [ ] Move helper files out of `app/`, add the route test, smoke-test a release build (S1).
- [ ] Backend: a company per signup with a setup step, owner-only approvals, payment write roles, block PM-to-owner, bind and expire join codes, service-key guard, rate limits, docs off in production (S3, S4, S9).
- [ ] Real OTP provider plus a review number (S2). Start DLT or WhatsApp template approval on day one.
- [ ] Pushed screens into a Stack with one Header (S5, D3).
- [ ] An Account section for every role, `resetSession()`, push-token unregister (S6, T2).
- [ ] Chat outbox lock and timeouts, capture-queue lock and idempotency key, 401 handling (T1, T3, T9).
- [ ] Remove false statuses and the homeowner leak, confirm and undo on money, error toasts (T4–T8).

### Phase 1: Store paperwork and config (about 1 week, alongside Phase 0)

- [ ] Privacy policy, terms, account-deletion web page, AI consent screen.
- [ ] Android permissions, splash screen, notification icon.
- [ ] `eas.json` autoIncrement and submit config, Sentry, API on your own domain, `supportsTablet: false`.
- [ ] Hide “coming soon” stubs, Labs screens and the dev gallery.

### Phase 2: Design coherence (about 2–3 weeks)

- [ ] One system with two densities (D1); one Screen, Header and tab bar (D3).
- [ ] A copy and count pass across every screen so nothing contradicts itself (D2).
- [ ] Truncation and layout pass (D4), i18n sweep with a lint rule (D5), token and icon cleanup, kit de-duplication (D6), faster launch (D7).

### Phase 3: Closed test, then submit (2+ weeks)

- [ ] EAS preview builds to 12+ testers on Play’s closed track and TestFlight, with Sentry watching.
- [ ] Maestro flows per role in CI.
- [ ] Fix what real users hit, then submit to both stores.

### Decisions needed

- **Contractor design direction:** Calm Cockpit for every role, which I recommend (D1), or Neev for every role?
- **Launch roles:** Ship PM, mukadam and procurement, or hide them as the feature ledger says?
- **Sign-up at launch:** Open self-serve for builders, or invite-only?
- **OTP channel:** SMS (needs DLT registration) or WhatsApp authentication messages?

## All other findings

### Homeowner app

- Photos and Updates load only the first 50 items; “By Room” sorts alphabetically, so later rooms vanish — `photos.tsx:732`, `updates.tsx:815`
- The same data is cached under different keys, so Home stays stale after approving and tapping View again shows “decision not found” — `decisions/[id].tsx:234`
- Pushed screens stay mounted: inbox badge sticks, the issue form isn’t reset, a decision note and the chat draft carry over between items — `(homeowner)/_layout.tsx:59-92`
- Load failures show calm empty states (“All caught up”) with no retry — `messages.tsx:182`, `inbox.tsx:66`
- “Show me more” files a new request on every tap; “Something else look off?” files a vague request with no confirmation — `home.tsx:317`
- Share sends only the caption on Android; Hide can’t be undone and applies to the whole device; “My visits” tiles can’t be opened — `photos.tsx:351, 631, 1477`
- Camera denial silently falls back to the gallery; no denial alert offers Open Settings — `messages/[id].tsx:259`
- “Free up space” deletes the whole cache folder, including photos still waiting to send; retention settings are never applied — `storage.tsx:168`
- Homeowners with two properties get `site_required` errors and there is no property picker — `home.tsx:267`
- Dead ends: My Requests rows can’t be tapped; “Read the full letter” links to the same screen — `(homeowner)/requests.tsx:166`, `updates.tsx:861`
- Changes filter “By me” means “no requester”, and savings show in red — `updates.tsx:1296`
- Touch targets under 48px (View 38px, Ask retry 36px, a 32px chip) and about 20 texts below the 14px floor — `home.tsx:706`, `ask.tsx:475`
- Photo grids download full-resolution originals; the drawing preview crops plans — `drawings/[id].tsx:266`
- Two different screens answer `/requests`; `finishes.tsx` is unreachable; the dev gallery ships — `app/requests.tsx`, `app/dev/gallery.tsx`
- Messages polls every 15 seconds for the whole session — `messages.tsx:84`
- Android keyboard may cover message composers under edge-to-edge (test on an Android 11+ release build) — `messages/[id].tsx:405`

### Contractor app

- Twelve screens have no top inset and sit under the status bar — `owner/approvals.tsx:366`, `sites.tsx:130`, `accountant/reconcile.tsx:63`
- “Today you’ve sent” lists only unsent items, and voice notes show as “Photo” — `supervisor/capture.tsx:167, 267, 348`
- The Invite sheet has no scroll or keyboard handling, so the keyboard covers Invite on small phones — `owner/team.tsx:195`
- Labs features are reachable (dispute pack, vendor confirm, audit, survey); the Labs flag also gates the design profiler the architect needs; procurement lands on a “coming soon” page — `backend/app/main.py:153`, `(contractor)/index.tsx`
- Counts go stale across tabs after an approval; no pull-to-refresh on Sites, Specs, Reconcile, Payments or engineer Home — `owner/specs.tsx:54`
- Assign lets a supervisor resolve a money decision through “Send reply” — `owner/approvals.tsx:284`, `supervisor/task/[id].tsx:50`
- Proof chips show ID fragments (“Message 3f2a9c1b”) and can’t be tapped — `owner/search.tsx:136`, `owner/_components.tsx:63`
- Engineer Home says “due today” for any due date — `supervisor/home.tsx:227`
- Transcript correction is a ±1 stepper only, without Indian grouping or button labels — `src/audio/TranscriptConfirm.tsx:151`
- Mukadam photo plus voice files two attendance records, and Mark present has no double-tap guard — `mukadam/attendance.tsx:156, 171`
- Microphone permission is requested as soon as a screen opens — `src/audio/HoldToTalk.tsx:108`
- The Album renders every full-resolution photo in one ScrollView and has no back button — `owner/album.tsx:84`
- Hidden tabs keep polling (8s, 15s, 30s), which costs data on prepaid plans — `src/chat/useChatThread.ts:422`
- Audit progress lives only in memory, and a retry duplicates findings — `supervisor/audit/[id].tsx:64`
- Pilot names in production copy (“Lokesh”, “CivilArch checklists”) — `owner/audit.tsx:92`
- Accountant More shows the raw company ID — `accountant/more.tsx:90`
- The role picker keeps the last choice across members; “Copy link” opens the share sheet and then says “Copied!” — `owner/team.tsx:596`
- The PM progress report uses the UTC date, so it shows the wrong day between midnight and 5:30am IST — `pm/dpr.tsx:125`

### Shared foundations

- Notification taps that launch the app from killed are probably lost — `app/_layout.tsx` (no `getLastNotificationResponse`)
- Read receipts go out while the thread isn’t on screen — `src/chat/useChatThread.ts:480`
- Polling stops whenever any socket is connected, even for threads it isn’t subscribed to — `useChatThread.ts:392`
- Full chat history is re-downloaded on every open; the cache keeps only the newest 2,000 messages and rewrites the whole thread per message — `useChatThread.ts:399`, `src/chat/cache.ts`
- Android AsyncStorage is capped at 6 MB and chat caches grow without limit — `src/chat/cache.ts`
- Bottom sheets are unreachable by VoiceOver because the backdrop wraps the sheet, including the OTP field for account deletion (about 23 places) — `src/ui/StepUpModal.tsx:125`, `src/auth/ui/GuideSheet.tsx:64`
- The app marks you signed in before your role and site are restored, so screens flicker — `AuthContext.tsx:90`
- Toasts always show a green check, so errors look like success; about 31 raw English server errors reach the screen — `src/ui/Toast.tsx`
- The shared chat kit uses 11–12px text, below the homeowner floor — `src/chat/MessageView.tsx:608`
- CalmCard shows status by border colour alone — `src/ui/CalmCard.tsx:41`
- No `maxFontSizeMultiplier` anywhere, so large system text may clip fixed-height elements — `src/ui/`
- Queries aren’t connected to NetInfo, retry 3 times on 401/403, and notification permission is requested over the login success animation — `app/_layout.tsx`, `AuthContext.tsx:96`

### Web console

- PMs can’t reach `/pm`; `/reconcile` forces the accountant nav; the Latest and Spec desk tabs never highlight — `RoleLanding.tsx:16`, `ReconcilePage.tsx:43`
- A 404 falls back to mock data with a “Mock events” badge in production code — `web/src/api/client.ts:155`
- Every decision type gets Approve and Reject, even “choose tile A or B” — `pages/approvals/ApprovalRow.tsx`
- Dead or unfinished: `/dpr` has no link; Intake is an empty tab; notification toggles say “Coming soon — saved locally”; `/components` is public — `App.tsx`
- Hard-coded avatar initials (OW, PM, SV, MK), a “Control plane” heading with a raw company ID, “across 1 items”, “24.00 nos” — `ui/AvatarMenu.tsx`, `features/admin/AdminConsole.tsx`
- The skin sync runs outside the login gate and makes failing calls on the login pages; there is no skip link — `main.tsx:27`

## How this review was done

- Ran the whole stack locally (Postgres with pgvector, Redis, the API) and loaded the repo’s demo seeds for every role.
- Drove the mobile app at iPhone size and captured 121 screenshots across 7 roles, plus Hindi mode.
- Built a production export to check release-only behaviour.
- Ran five parallel code reviews: homeowner, contractor, shared foundations, backend security and the web console. Every stop-ship item below was then reproduced or re-checked in the code before it went into this report.
- Screenshots come from the web build of the app (react-native-web), so blur and fonts differ slightly on phones. Some photos show placeholders because this sandbox blocked external image hosts.
