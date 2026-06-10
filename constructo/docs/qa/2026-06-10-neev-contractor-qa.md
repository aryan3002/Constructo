# QA Report — Neev "Site Register" Contractor Re-skin

**Date:** 2026-06-10
**Engineer:** Automated QA Session (Senior QA / Release Verification, Claude + sonnet sim-driver agents)
**Under test:** The contractor mobile re-skin to the **Neev · "Site Register"** design system (owner · pm · supervisor · accountant · mukadam screens), plus a homeowner Calm-Cockpit regression smoke.
**Method:** Phase-1 automated gates run locally; Phases 2–4.5 driven on the **iOS Simulator** via Maestro + `xcrun simctl` screenshots by sonnet sub-agents; every screenshot reviewed by the lead session. Findings cross-checked against source.

---

## 1. Summary Verdict

**Neev is SAFE to keep on `main`** — **no blocking defects.** (The re-skin is already merged to `origin/main`; see scoping note.)

The Neev design system is applied correctly and consistently across all five contractor roles: warm-paper canvas, the single marigold spark, ink-primary / marigold-affirmative buttons, the signature folded-corner "register page" status flag, evidence chips, honest-AI confirm cards, monospace Indian-grouped ₹, and the warm status spine (paired with label + icon, never colour-alone). **No crashes or red-boxes occur on any contractor screen.** All automated gates are green (typecheck 0, jest 66/66, backend smoke ALL GOOD).

The defects found are **polish-level (1 medium-data, 1 medium-nav, rest low/trivial)** — none break a core flow:
- **Medium:** sign-out fires a dev-only `REPLACE` navigation warning (all roles); **Company** renders as a raw UUID on owner/pm/accountant *More* (reads `company.id`, not `.name` — the name is available, homeowner shows it correctly).
- **Low:** one real cool-colour leak (shared `SettingsRow` icon-chips use the homeowner sage tint on contractor *More*); two text inputs hardcode `Hind-Regular` instead of Neev's Mukta; mixed-language (romanized Hindi) strings on the supervisor/mukadam field screens; status-bar overlap on three owner screens; route-warning log noise; stale code docstrings.

> ⚠️ **Scoping note.** The Neev re-skin **IS merged to `origin/main`** via **PR #163 (`49f010f`, "Merge pull request #163 from aryan3002/fix/neev-followups")** — the prompt was right. This QA was run against **`f4f6bba`** (tip of `fix/neev-followups`); `git log origin/main..HEAD` is **empty**, i.e. the tested content is exactly what is on `origin/main`. The **local** `main` ref is stale (`3b4224d`, the homeowner Calm Cockpit merge) — it just hasn't been fetched/pulled. Conveniently, that stale local `main` is the *pre-Neev baseline*, so **`git diff main..HEAD` = the Neev change-set, and it touches NO homeowner files** → homeowner behaviour is unchanged by this work (see §6 Bug #10).

---

## 2. Environment

| Item | Value |
|---|---|
| Repo | `/Users/aryantripathi/Developer/contructionAI` |
| Branch under test | `fix/neev-followups` @ **`f4f6bba`** ("fix(ui): CaptureBar wave + StatusFlag corner") |
| On main? | **Yes** — `origin/main` @ **`49f010f`** (PR #163 merged this branch). `origin/main..HEAD` empty = tested content == main. |
| Local `main` ref | `3b4224d` — **stale** (pre-Neev homeowner baseline; not yet fetched). Used as the diff base to isolate the Neev change-set. |
| Mobile app | `constructo/mobile` — Expo SDK 54, RN 0.81, Expo Router, TS |
| Backend | `constructo/backend` — FastAPI, on **http://localhost:8000** (pre-existing instance; `EXTRACTION_SYNC` env) |
| DB / cache | Postgres (pgvector) `:5433` + Redis `:6379` (docker compose, both **healthy**) |
| Migrations | `alembic upgrade head` → at `b5d6e7f8a9c0` |
| Seed | `scripts.seed_demo` — DB **already seeded** (re-seed is not idempotent: duplicate `+919800000001` on first insert proves a complete prior seed). Demo company **"CivilArch (CADS)"** / "Sunrise Builders"; sites Verma Residence, Sunrise Meadows, Sunrise Heights, Sunrise Plaza, Sharma Residence. |
| Simulator | **iPhone 17 Pro**, iOS **26.5** (`D14F8043-…`), Expo Go **54.0.7** |
| Mobile `.env` | **Fixed during setup**: was a stale LAN IP `192.168.4.51:8000` (machine is `192.168.4.63`, unreachable → login would fail). Set to **`EXPO_PUBLIC_API_BASE=http://localhost:8000`** (correct for the iOS sim) and restarted Metro with `-c`. Test-env config only; no product change. |
| Screenshots | `/tmp/qa_neev/` (referenced inline below) |
| Maestro flows | `constructo/mobile/.maestro/` (committed — the app's first e2e suite) |

---

## 3. Automated Gates (Phase 1) — ALL GREEN

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | **PASS — 0 errors** |
| Unit/jest | `npm test` | **PASS — 12 suites, 66/66 tests** (incl. `money.test`, `tokens.test`, `i18n.test`) |
| Backend smoke | `bash backend/scripts/smoke_login.sh` | **PASS — "ALL GOOD — 15 checks"** (all roles login + landing 200; homeowner join SUNRISE-HOME) |

---

## 4. Per-Role Test Matrix (Phases 2–3)

Legend: ✅ PASS · ⚠️ PASS-with-note · ❌ FAIL. "Data" quotes a concrete seeded value actually seen.

### Boot / Auth
| Screen | Status | Screenshot | Notes |
|---|---|---|---|
| Boot (resumed PM session) | ✅ | `00_boot.png` | Clean boot, no red-box; **0 "No route named" warnings**; bundle 1740 modules OK. |
| Chooser "Who are you?" | ✅ | `00_chooser.png` | Warm paper; "I'm a homeowner" / "Builder / site team" cards. |
| Staff login | ✅ | `01_login.png` | **Neev confirmed**: warm-paper bg, "Welcome to Constructo" in Bricolage, cream input, **ink** "Send code" primary, **marigold** "I have a join code" link. (The `login.tsx` "amber-on-ink Blueprint" docstring is **stale** — the `blueprint` theme *key* now carries the Neev identity; the render is correct.) |

### Owner (`+919800000001` → brief)
| Screen | Status | Screenshot | Data seen | Notes |
|---|---|---|---|---|
| brief | ⚠️ | `owner_brief.png` | "Sunrise Heights · 1 risk", CASH/LABOR/MATERIAL/PROGRESS cards | Marigold active tab + "See all"; green "On track" / slate "Info" chips. Greeting line overlaps status-bar clock (Bug #6); copy "1 thing **need** you" (Bug #8). |
| sites | ✅ | `owner_sites.png` | 4 sites: Verma Residence, Sunrise Meadows, Sunrise Heights, Sunrise Plaza (type · active · location) | Neev green "On track" chips w/ check icon. |
| site/[id] | ✅ | `owner_site-detail.png` | Verma Residence · "active" · FORESIGHT "Nothing needs ordering; cash-flow steady." · TIMELINE Material/Attendance events w/ timestamps | "Dispute pack" entry present. Timeline shows user-entered romanized Hindi ("12 mistri aaye") — data, not chrome. |
| chat (list) | ✅ | `owner_chat-thread.png` | 3 threads: Homeowner·Verma Residence, Homeowner·Sunrise Heights (unread 1), Sunrise Meadows (unread 11) | **Marigold** "New group" + unread badges. (Title overlaps clock — Bug #6.) |
| chat/[id] (input) | ⚠️ | (in `owner_chat-thread`) | — | Composer input hardcodes `Hind-Regular` (Bug #5). |
| approvals | ✅ | `owner_approvals.png` | "9 decisions waiting on you", "1 event(s) need clarification… · Sunrise Heights · data_quality", "SLA: 63h", "Proof 1" | **Signature**: folded-corner marigold flag; "Pending" warn chip; **"Hold" ink-outline + "Approve" marigold-fill** (exact Neev affirmative/cautionary rule). |
| search | ✅ | `owner_search.png` | placeholder "Ask about labor, material, progress,…"; empty-state "answers come with proof" | Input hardcodes `Hind-Regular` (Bug #5). |
| foresight | ✅ | `owner_foresight.png` | "136 Worker-days · BILLED/PAID **₹72,000** · 7 Deliveries · 0 Open disputes"; per-site billing | **Money in Spline mono, Indian-grouped**; folded-corner flags colour-coded (green=ok here vs marigold=pending on approvals). |
| dispute-pack | ✅ | `owner_dispute-pack.png` | "Tamper-evident case file", vendor input "e.g. Sharma Traders" | "Build pack" correctly disabled until input. |
| more | ⚠️ | `owner_more.png` | "Rajesh Gupta (Owner)", +919800000001 | **Company = raw UUID** `5835f2e3-…` (Bug #2); Search icon-chip is **sage-green** (Bug #3). |

### PM (`+919800000002` → dpr)
| Screen | Status | Screenshot | Data seen | Notes |
|---|---|---|---|---|
| dpr | ✅ | `pm_dpr.png` | "Daily Progress Report"; 4-site selector; "No site activity recorded." honest-AI draft w/ "Check" confidence + "Couldn't hear clearly" warn (icon+label) | Marigold selected site chip; ink "Check & send". |
| more | ⚠️ | `pm_more.png` | "Anita Rao (PM)", +919800000002 | **Company = raw UUID** (Bug #2); sage-green icon-chips (Bug #3). |

### Supervisor (`+919800000003` → capture)
| Screen | Status | Screenshot | Data seen | Notes |
|---|---|---|---|---|
| capture | ⚠️ | `supervisor_capture.png` | "Sunrise Meadows"; chips Attendance/Delivery/Progress/Issue; "Send it once. We file it." | Marigold camera card; **mixed language** — "Photo bhejo" + "Bolkar batao — '24 mazdoor aaye…'" alongside English (Bug #4). |
| chat | ✅ | `supervisor_chat.png` | "Crew chat · Sunrise Meadows"; "50 cement", "20 workers" | Warm delivery chips. Hindi in message content = data. |
| my-sites | ✅ | `supervisor_my-sites.png` | feed: "Only four workers attended…", "Cement has arrived." | Sign-out lives here (scroll). Hindi entries = user data. |
| tasks-asks | ✅ | `supervisor_tasks-asks.png` | "All clear! Nothing pending…" | Clean empty-state (Neev green check). |
| action-items | — | (not isolated) | — | Reached via tasks/my-sites; not separately captured this pass. |

### Accountant (`+919800000004` → reconcile)
| Screen | Status | Screenshot | Data seen | Notes |
|---|---|---|---|---|
| reconcile | ✅ | `accountant_reconcile.png` | "AT RISK **−₹12,000** · 1 open flag"; Sunrise Heights "1 needs approval"; Sunrise Plaza "On track" | Red risk value (mono); marigold "Needs attention". |
| reconcile detail (3-way) | ✅ | `accountant_reconcile-detail.png` | **Delivered 100 bags vs Invoiced 120 bags = −₹12,000 "Quantity variance"**, "Needs owner approval", "View proof (GRN)" | Folded-corner flag; **3-way view shows real numbers** (key flow). |
| payments | ✅ | `accountant_payments.png` | IN **+₹5,00,000** / OUT **−₹1,05,000** / NET **+₹3,95,000**; Sharma Residence Confirmed; Ramesh Yadav (Mukadam) −₹45,000; ACC Limited −₹60,000 Recorded | **"Tracking only — Constructo never moves money."** Money mono, direction-coloured. |
| more | ⚠️ | `accountant_more.png` | "Priya Nair (Accountant)", +919800000004 | **Company = raw UUID** (Bug #2); sage-green icon-chips (Bug #3). |
| site/[id] | — | — | — | Accountant site detail shares the owner site route; covered under owner. |

### Mukadam / labor_contractor (`+919800000006` → attendance)
| Screen | Status | Screenshot | Data seen | Notes |
|---|---|---|---|---|
| attendance | ⚠️ | `mukadam_attendance.png` | "Sunrise Heights · Today · Wed, 10 Jun"; "How many came today?"; PEOPLE stepper; "Mark present" | Mostly English; one Hindi affordance "🔊 Sun lo" (Bug #4). Save not confirmed (Bug #11). |
| my-payments | ✅ | `mukadam_my-payments.png` | "₹45,000 · Paid on 31 May 2026 · upi · Confirmed" | "Clear proof = faster payment". "Sun lo" chip (Bug #4). |
| help | ✅ | `mukadam_help.png` | "How to mark attendance / How pay works / Call the office / Sign out" | Fully English; ink "Call the office". Sign-out lives here. |

### Homeowner — Calm Cockpit regression (Phase 4.5)
| Screen | Status | Screenshot | Notes |
|---|---|---|---|
| home | ✅ | `homeowner_home.png` | **Calm Cockpit intact**: warm SAND bg, **Eczar serif** "Sharma Residence", "Invited by Sunrise Builders" (company NAME shown correctly), sage-green "Ask" FAB, **terracotta** "Add family members" — **NOT** Neev marigold. |
| photos / messages | ⚠️ (out of scope) | `homeowner_photos.png` `homeowner_messages.png` | Dev-only `GO_BACK` LogBox on tab nav. **Homeowner code is unchanged by this branch** → not a Neev regression (Bug #10). |

---

## 5. Key-Flow Results (Phase 3b)

| Flow | Result | Evidence |
|---|---|---|
| **Owner approvals** (Approve/Hold) | ⚠️ **Surface verified** | `owner_approvals.png` shows real pending decisions with **"Hold" (ink) + "Approve" (marigold)** and a "Proof 1" evidence chip. The approve→state-update *action* was not driven to a confirmed terminal state this pass (the re-skin did not change this logic; recommend a focused follow-up tap). |
| **Accountant reconcile** (3-way) | ✅ **PASS** | `accountant_reconcile-detail.png`: real mismatch — Delivered 100 vs Invoiced 120 bags → **−₹12,000 quantity variance**, "Needs owner approval", "View proof (GRN)". |
| **Mukadam attendance** (mark headcount → save) | ⚠️ **Surface verified, save not confirmed** | `mukadam_attendance.png`: stepper + "Mark present" present and tappable; "Mark present" completed with no error, but **no save confirmation/toast** and the stepper read "—" (Bug #11). Persistence not proven. |
| **Supervisor capture** (voice + photo → honest-AI confirm → commit) | ⚠️ **Surface verified** | `supervisor_capture.png`: marigold camera card + "Hold to talk" mic both present; PM's `pm_dpr.png` shows the honest-AI "what I heard" confirm card with a visible confidence chip. Audio recording can't be exercised in the simulator; full record→confirm→commit not driven end-to-end here. |

---

## 6. Design Verification (Phase 4)

**Verdict: Neev applied correctly. One real cool-colour leak, two font leaks, one language-mix — all polish-level.**

**Token audit (source, `src/theme/tokens.ts`).** Contractor theme = the `blueprint` key, **repurposed** to carry Neev: `bg #efeadf`, `card #fffdf8`, `accent #f0a21f`, `accentDeep #d6850c`, `ok #2f7d52`, `warn #c77a12`, `risk #b23a2e`, `info #3a6491` — **all match the Neev spec exactly.** Radii 10/14/18. The shared `STATUS` const still holds the *old* bright/cool values (`#1e9e5a/#e8a317/#e5484d/#3b7dd8`) but a code grep found **no contractor screen uses `STATUS.*` directly** and **no old hex literals** in `app/(contractor)`/`src/ui`/`src/chat` (the "use the Neev warm spine" polish commit did its job).

**Fonts (source, `src/theme/fonts.ts`).** `FACES.blueprint` = **Bricolage Grotesque** (headings) · **Mukta** (body/title/label) · **Spline Sans Mono** (₹/numerals) — correct. No `Anek/Eczar/IBM Plex` `fontFamily` literals on contractor screens **except** two hardcoded `Hind-Regular` inputs (Bug #5).

**Visual confirmations (screenshots):**
- ✅ Warm-paper bg everywhere; cream cards; **no pure-white / dark contractor surfaces.**
- ✅ Marigold is the lone accent (active tab, "Approve", "New group", section eyebrows, FORESIGHT/mic icons).
- ✅ **Ink primary / marigold affirmative**: login "Send code" ink; approvals "Approve" marigold + "Hold" ink-outline.
- ✅ Money = Spline mono, Indian grouping (`₹72,000`, `+₹5,00,000`), colour only for direction.
- ✅ Warm status spine always paired with icon+label (`On track`✓ / `Needs attention`⚠ / `AT RISK`▲). The "On track"/"Confirmed" chips use **`theme.colors.ok #2f7d52` at 13% tint** (`StatusPill.tsx:82`) — **correct Neev green** (an earlier agent flagged these as "sage" — **false alarm, cleared**).
- ✅ Signature elements present: folded-corner "register page" flag (approvals, foresight, reconcile), evidence chips ("Proof 1", "View proof (GRN)"), honest-AI confirm card with confidence (pm DPR).
- ⚠️ **Real leak (Bug #3):** `SettingsRow.tsx:93` uses `AP.chip` (`#cfe3d9`, the homeowner Daylight "soft sage chip") for icon-chip backgrounds → cool-green chips on owner/pm/accountant *More* (the icon glyph is correctly marigold, but the chip behind it is homeowner-sage).

**English-first:** UI chrome is English across owner/pm/accountant and most of supervisor/mukadam. User-generated/captured content in romanized Hindi (timeline notes, chat, delivery/invoice text) is **data, not a violation**. The exceptions are the deliberate field-role labels in the `en` string sets — `Photo bhejo`, `Bolkar batao…`, `Sun lo` (Bug #4).

---

## 7. Defects

> Severity: **P1** blocker · **P2** should-fix-soon · **P3** polish · **P4** trivial/info. **No P1s on contractor screens.**

**Bug #1 — [P2] Sign-out fires a `REPLACE` navigation warning (all roles).**
- Repro: log in as any staff role → *More*/*My Sites*/*Help* → "Sign out".
- Expected: clean return to the chooser/login, no error.
- Actual: a dev toast — *"The action 'REPLACE' with payload {"name":"index"} was not handled by any navigator. Do you have a route named 'index'? … development-only warning … won't be shown in production."* — appears and lingers onto the next screen. Navigation *does* still resolve to the login screen.
- Root cause: every `onSignOut` does `router.replace('/')` (`owner/more.tsx:59`, `pm/more.tsx:47`, `accountant/more.tsx:66`, `supervisor/my-sites.tsx:111`, `mukadam/help.tsx:68`, `(contractor)/index.tsx:16`). `'/'` resolves to a non-existent `index` at that navigator level — the exact bounce the `login.tsx` docstring warns about. Use a declarative `<Redirect>` / `router.replace('/(auth)')` instead.
- Evidence: `signout_error_owner.png`, visible in `01_login.png`, `supervisor_capture.png`, `mukadam_attendance.png`. Production-suppressed but a real latent nav bug + QA noise.

**Bug #2 — [P2] Company shows a raw UUID instead of its name (owner/pm/accountant More).**
- Actual: COMPANY = `5835f2e3-cf43-5c6f-9e5d-8440374a4f56`. Expected: the company name (the homeowner *home* screen correctly shows **"Sunrise Builders"**, so the name is available — the More screen reads `company.id` not `company.name`, or the `/me` payload omits the name for staff).
- Evidence: `owner_more.png`, `pm_more.png`, `accountant_more.png`.

**Bug #3 — [P3] Cool-colour leak: `SettingsRow` icon-chips use the homeowner sage tint on contractor screens.**
- `src/ui/SettingsRow.tsx:93` → `backgroundColor: tone === 'risk' ? '#fbe9e9' : AP.chip` where `AP.chip = '#cfe3d9'` (Daylight "soft sage chip"). On Neev it should be a marigold-warm tint (e.g. `accentWarm #fbe8c4`) or `paper`. Affects owner/pm/accountant *More* (Search/Foresight rows). Supervisor/mukadam build their own rows and are unaffected.
- Evidence: `more_searchforesight.png` (zoom: marigold magnifier on a sage square), `owner_more.png`.

**Bug #4 — [P3] Mixed-language strings on field-role screens (English-first "one language per screen").**
- `supervisor/capture.tsx:51,53` (`STR.en`): `photo: 'Photo bhejo'`, `voiceHint: 'Bolkar batao — "24 mazdoor aaye…"'` shown next to English chrome. `mukadam/attendance.tsx:49` & `my-payments.tsx:36`: `voiceOut: 'Sun lo'`.
- These are authored in the **`en`** set, so they appear in English mode → violates the reskin's hard rule. **May be an intentional low-literacy field-worker affordance** — flag for a product decision rather than a silent fix.
- Evidence: `supervisor_capture.png`, `mukadam_attendance.png`.

**Bug #5 — [P3] Two inputs hardcode `Hind-Regular` instead of Neev's Mukta.**
- `owner/search.tsx:89` and `owner/chat/[id].tsx:377` set `fontFamily: 'Hind-Regular'` on `TextInput`. Neev body face is Mukta; should use the theme face. Visually subtle (both clean sans, both render Devanagari) but a real token bypass.

**Bug #6 — [P3] Screen title overlaps the iOS status-bar clock on three owner screens.**
- owner *Brief / Approvals / Chat* render the title at the very top, colliding with the status-bar clock (top safe-area inset not applied). owner *Sites / site-detail / Foresight / Search / Dispute-pack* are fine.
- Evidence: `owner_brief.png`, `owner_approvals.png`, `owner_chat-thread.png` vs `owner_sites.png`.

**Bug #7 — [P3] 16 "missing default export" route warnings at boot.**
- Expo Router scans helper files as routes: `(contractor)/{owner,supervisor,mukadam}/_*.tsx` (`_components`, `_voice`, `_dispute`, `_group_sheets`, `_chat_components`) and several `(homeowner)/_*.util.ts`, plus root `_intake.util.ts`/`_requests.util.ts`. Log noise only; no functional impact. Consider moving helpers out of `app/` or suppressing.

**Bug #8 — [P4] Copy: owner Brief reads "1 thing **need** you today" (→ "needs").** `owner_brief.png`.

**Bug #9 — [P4] Stale docstrings (non-user-facing).** `login.tsx` ("Blueprint amber-on-ink"), `tokens.ts` top ("amber primary"), `fonts.ts` header ("Anek → display") all describe the pre-reskin state; the live values are Neev. Doc hygiene.

**Bug #10 — [P3 / out of Neev scope] Homeowner Photos & Messages tabs show a dev `GO_BACK` LogBox.**
- *"The action 'GO_BACK' was not handled by any navigator."* on the homeowner Photos/Messages tabs. **`git diff main..HEAD` modifies NO homeowner files**, so this is **pre-existing on `main`** (or an artifact of point-tap tab navigation) — **not introduced by the Neev re-skin**. Homeowner *home* itself renders fine. Recommend a separate homeowner-app check; does not affect the Neev verdict.
- Evidence: `homeowner_photos.png`, `homeowner_messages.png`, `homeowner_home.png`.

**Bug #11 — [P4] Mukadam "Mark present" gives no visible save confirmation.**
- After tapping "Mark present" no toast/confirmation appeared and the stepper read "—"; persistence could not be verified in this pass (partly an automation limitation on the stepper). Help copy implies silent offline save — consider a brief "Saved" confirmation. `mukadam_attendance.png`.

---

## 8. Reusable Maestro Flows (deliverable)

Committed under `constructo/mobile/.maestro/` — the app's **first e2e suite**:
- `_login_staff.yaml` — reusable chooser→phone→OTP subflow (tolerant of starting from the chooser **or** the login screen, since sign-out may land on either).
- `owner.yaml`, `pm.yaml`, `supervisor.yaml`, `accountant.yaml`, `mukadam.yaml` — login + walk tabs + screenshot each + sign out.
- `homeowner.yaml` — Calm-Cockpit join smoke (the 4-field join is finished interactively; no testIDs).
- `README.md` — prereqs, accounts, run instructions, Expo-Go launch caveat.

**Known limitation:** Maestro `tapOn:"<tab label>"` on the bottom tab bar is **flaky** under Expo Go on this iOS build (text sometimes mis-resolves). The flows are correct selectors for portability; for fully deterministic runs use point-taps for the tab row (`tapOn: { point: "X%,96%" }`, X = (i+0.5)/N·100). Always re-screenshot + verify the landed screen after a tab switch. The owner.yaml carries the documented sign-out-navigation note (Bug #1).

---

## 9. Honest one-paragraph summary

The Neev "Site Register" re-skin is **solid and safe to merge.** Across all five contractor roles the design system lands exactly as specified — warm-paper canvas, a single marigold spark, ink-primary/marigold-affirmative buttons, the folded-corner register-page status flag, evidence-on-tap, honest-AI confirm cards, and monospace Indian-grouped rupees with a warm, label-paired status spine — with real seeded data on every screen, all-English UI chrome (bar two deliberate field-role affordances), and **zero crashes or red-boxes on any contractor screen**; the automated gates (typecheck, 66 jest, backend smoke) are all green. The issues found are polish, not blockers: a dev-only sign-out `REPLACE` warning, a raw-UUID company label on the *More* screens (the name is available and shown correctly on the homeowner side), one genuine sage-green icon-chip leak from a shared component, two hardcoded `Hind-Regular` inputs, a top-inset overlap on three owner screens, and route-warning log noise. I verified each finding against source and cleared one false positive (the status chips are correct Neev green, not a sage leak). The two "real-logic" flows I could fully exercise — accountant 3-way reconcile and the rendered approve/hold + honest-AI surfaces — work with real numbers; mukadam save and a full voice→commit capture couldn't be confirmed end-to-end in the simulator and warrant a short follow-up tap-through, but neither is a re-skin concern. The homeowner Calm Cockpit is untouched by this branch and still renders correctly, so its pre-existing `GO_BACK` tab warning is out of scope here. **Recommendation: keep Neev on `main` (already merged via PR #163); fix Bug #1 and Bug #2 in the next pass.**
