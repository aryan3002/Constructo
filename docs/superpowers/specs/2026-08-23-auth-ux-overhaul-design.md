# Auth UX overhaul — login, sign-in, join, and the "what's what" guide

**Date:** 2026-08-23 · **Branch:** `claude/login-signup-ux-overhaul-31c1e3` · **Scope:** UI/UX only (mobile + web). No backend changes.

## 1. Why

The signed-out experience is the first thing every pilot user touches, and today it is the least consistent part of the product:

- Three mobile screens (`(auth)/index`, `homeowner-login`, `login`, `join`) each hand-roll the phone field, OTP field, back button and error line. Nothing explains **what a join code is**, **what the one-time code is**, or **which door is mine**.
- Raw backend error strings leak to the user ("This number is not enabled for the pilot", "Unknown join code", "Invalid OTP") with no next step.
- The builder login has no resend / change-number affordance; the join screen asks for four fields on one page with a disabled button and no hint why.
- A **brand-new builder** (any new phone auto-becomes an `owner` at `/auth/login`) lands on the Brief with zero orientation. A new homeowner gets a Welcome card but no tour of the tabs.
- Web login is a bare card with a pre-filled dev OTP and no explanation; `/join/:token` asks you to accept a role before telling you what that role can do. `web/src/pages/Login.tsx` is dead code.

Goal: **one consistent, self-explaining entry experience across mobile and web**, where every screen tells the user what's what, what happens next, and what to do when something goes wrong.

## 2. Ground truth the guide must tell honestly

| Fact (from backend) | What the UI must say |
|---|---|
| There is no password anywhere. Phone + 6-digit one-time code (OTP). Dev OTP = `000000`. | "No password. We text you a one-time code." Dev hint only in `__DEV__` / `import.meta.env.DEV`. |
| Homeowners can only enter with a **join code** issued by their builder (`/homeowner/join`). Returning homeowners sign in with phone only. | Homeowner door = "I have a join code" (first time) vs "Welcome back" (returning). "Your builder sends the code (or a link) on WhatsApp/SMS." |
| Builders / site team sign in with phone. A **new number becomes a new owner workspace**. Invited staff must use the number they were invited with. | "Use the number your company invited. A new number starts a fresh builder workspace." |
| Pilot allowlist → `403 not_allowed`. Deactivated → `403 deactivated`. Bad OTP → `401 invalid_otp`. Bad code → `404 invalid_code`. Used invite → `409 already_claimed`. | Each maps to a friendly sentence **plus a next step** (see §6). |

## 3. Decisions (made autonomously — revisit if wrong)

1. **Both clients, mobile first.** Mobile is the homeowner + field surface; web is builder-only. Same words, same step structure, same error copy on both.
2. **No new backend.** The join code cannot be pre-validated (no preview endpoint); the join flow validates on final submit and jumps back to the code step on `invalid_code`.
3. **Guide = three layers**, not a separate "help centre":
   - **Inline hints** on every field (what it is, where to find it).
   - **"What's what" sheet** (`?` in every auth header) — one scrollable reference: two doors · join code · one-time code · roles · "not enabled yet?" · privacy.
   - **Post-login welcome tour** — role-aware "Here's what's what" screen shown **once per user per device** (homeowner: extend the existing Welcome; builder/staff: new `(contractor)/welcome`).
4. **Language toggle (EN / हिं) lives in the auth header** on both clients — users pick their language before reading anything else.
5. **Web keeps a single OTP input** (accessibility + existing tests); mobile gets a 6-box OTP field backed by one hidden input (SMS autofill keeps working).
6. **Delete dead web code**: `web/src/pages/Login.tsx` + `Login.test.tsx` (unreferenced).
7. **Respect Reduce Motion** everywhere; keep the CalmVerify settle (no spinners) as the one "success" moment.

## 4. Shared vocabulary (copy is identical on mobile + web)

| Key | EN | HI |
|---|---|---|
| front door title | Welcome to Neev | Neev में आपका स्वागत है |
| front door sub | One app, two doors. Pick yours. | एक ऐप, दो दरवाज़े। अपना चुनें। |
| homeowner card | I'm a homeowner | मैं घर-मालिक हूँ |
| homeowner card sub | Follow your home being built — photos, updates, decisions. | अपने घर का बनना देखें — तस्वीरें, अपडेट, फ़ैसले। |
| homeowner card how | Enter with the join code your builder sent | बिल्डर से मिला जॉइन कोड डालकर आएँ |
| staff card | Builder / site team | बिल्डर / साइट टीम |
| staff card sub | Run your sites and crew — owner, PM, supervisor, accountant, mukadam, architect. | अपनी साइट और टीम चलाएँ — मालिक, PM, सुपरवाइज़र, अकाउंटेंट, मुकादम, आर्किटेक्ट। |
| staff card how | Sign in with your phone number | अपने फ़ोन नंबर से साइन इन करें |
| not sure | Not sure which one? | पक्का नहीं कौन सा? |
| no password | No password. We text you a one-time code. | कोई पासवर्ड नहीं। हम एक बार का कोड भेजते हैं। |
| phone label | Phone number | फ़ोन नंबर |
| phone hint (staff) | Use the number your company invited. A new number starts a fresh builder workspace. | वही नंबर डालें जिस पर आपकी कंपनी ने बुलाया। नया नंबर नया बिल्डर वर्कस्पेस बनाता है। |
| phone hint (homeowner) | The number you'll use to sign in from now on. | वह नंबर जिससे आप आगे से साइन इन करेंगे। |
| continue | Continue | आगे बढ़ें |
| send code | Send code | कोड भेजें |
| otp title | Enter the code | कोड डालें |
| otp sent to | We texted a 6-digit code to {phone} | हमने {phone} पर 6 अंकों का कोड भेजा |
| change number | Change number | नंबर बदलें |
| resend in | Resend in {s}s | {s} सेकंड में दोबारा भेजें |
| resend | Resend code | कोड दोबारा भेजें |
| code resent | Code sent again | कोड दोबारा भेज दिया |
| checking | Checking… | जाँच हो रही है… |
| verified | Verified · welcome in | सत्यापित · स्वागत है |
| join title | Join your home | अपने घर से जुड़ें |
| join code label | Join code | जॉइन कोड |
| join code hint | Your builder shares it on WhatsApp or SMS. Tapped a link? It fills in by itself. | आपका बिल्डर इसे WhatsApp या SMS पर भेजता है। लिंक टैप किया? यह खुद भर जाएगा। |
| where find code | Where do I find my code? | मेरा कोड कहाँ मिलेगा? |
| name label | Your name | आपका नाम |
| name hint | So your family and builder see a name, not a number. | ताकि परिवार और बिल्डर को नंबर नहीं, नाम दिखे। |
| join cta | Join my home | मेरे घर से जुड़ें |
| step of | Step {n} of {total} | चरण {n} / {total} |
| help | What's what | क्या क्या है |
| welcome back | Welcome back | वापस स्वागत है |
| first time | First time here? I have a join code → | पहली बार? मेरे पास जॉइन कोड है → |
| homeowner link (from staff) | Homeowner? Use your join code → | घर-मालिक? अपना जॉइन कोड इस्तेमाल करें → |
| staff link (from homeowner) | Builder or site team? Sign in → | बिल्डर या साइट टीम? साइन इन करें → |

## 5. Mobile design (`constructo/mobile`)

### 5.1 Shared auth kit — `src/auth/ui/`

All screens compose these; none hand-roll inputs any more.

- **`AuthFrame`** — `Screen` + header row: back (or none on the front door), `Logo`, right-side cluster `[EN|हिं] [?]`. Props: `title`, `subtitle`, `step?: {n,total}` (renders `StepDots` + "Step n of total"), `footer?` (the cross-link), `children`. Opens `GuideSheet` from `?`. Theme-agnostic (works in Daylight and Neev).
- **`StepDots`** — 2–3 dots, active = accent, done = text, idle = line. Reduce-motion safe (no animation).
- **`PhoneField`** — fixed `+91` chip + 10-digit input (`phone-pad`, `autoComplete="tel"`), groups as `98765 43210` while typing; stores digits only; exposes `valid` (10 digits, first digit 6–9). Label + hint + error slot. 48px min height, 16px text.
- **`OtpField`** — 6 visual boxes over one hidden `TextInput` (`oneTimeCode` / `one-time-code`), `maxLength 6`, caret box highlighted, `onComplete` when 6 digits. Error state outlines boxes in `risk`. Tapping anywhere focuses.
- **`ResendCode`** — "Resend in 30s" → "Resend code" link, 30s cooldown, optional "Code sent again" confirmation; driven by the pure `useCountdown`.
- **`AuthError`** — error card: icon + message + optional action button (e.g. "Use a join code"). Never colour-only.
- **`GuideSheet`** — bottom sheet (RN `Modal`, slide-up, scrim) with the "What's what" reference. Content comes from `src/auth/guide.content.ts` (EN/HI). Optional `initialSection` to jump (e.g. join code). Sections:
  1. **Two doors** — homeowner vs builder, how each gets in.
  2. **Join code** — what it is, where it comes from, link autofill, "ask your builder to re-send".
  3. **One-time code** — no passwords, 6 digits by SMS, resend after 30s, `000000` hint only in dev.
  4. **Who's who on a site** — Owner · PM · Supervisor · Accountant · Mukadam · Architect · Homeowner (one line each).
  5. **Number not enabled?** — pilot allowlist explained: "Ask your Neev contact to add your number."
  6. **Your number & privacy** — used only to sign you in and show your name to your team.
- **`LangToggle`** — small pill using `useT().setLang`.

### 5.2 Pure logic — `src/auth/auth.util.ts` (+ tests in `src/auth/auth.util.test.ts`)

- `digitsOnly`, `formatIndianMobile(digits)`, `isValidIndianMobile(digits)`, `toE164(digits)` (`+91` + 10 digits), `maskPhone('+919876543210') → '+91 98765 43210'`.
- `mapAuthError(err, t): { message, action?: 'useJoinCode' | 'signIn' | 'help' | 'retry' }` keyed on `ApiError.code` (`not_allowed`, `deactivated`, `invalid_otp`, `invalid_code`, `already_claimed`, `not_found`) and network failure.
- `homeFor(role)` — moved out of `login.tsx` so index, login and the welcome gate share one map.
- `welcomeKey(userId)` for the once-per-device flag.

### 5.3 Screens

**Front door `(auth)/index`** — `AuthFrame` (no back; lang + `?`). Title/sub from §4. Two `RoleCard`s, each now with a third "how you get in" line and the chevron. Under the cards: a quiet "Not sure which one?" link → `GuideSheet` (section 1). Footer line: "No password. We text you a one-time code." Stagger-rise kept.

**Builder login `(auth)/login`** — Neev theme. Step 1/2 "Your phone number": `PhoneField` (hint: staff phone hint) + `Continue` (disabled until valid). Step 2/2 "Enter the code": "We texted a 6-digit code to +91 98765 43210 · Change number", `OtpField` auto-submits, `ResendCode`, `CalmVerify` on submit (unchanged settle). Errors via `AuthError` (§6). Footer: "Homeowner? Use your join code →". After auth: if `welcomeKey(me.id)` unset → `Redirect` to `/(contractor)/welcome`, else `homeFor(role)`.

**Homeowner login `(auth)/homeowner-login`** — same two steps in Daylight. Subtitle "Enter your number — we'll text a one-time code." + "No password to remember." `not a homeowner` → `AuthError` with action button **Use a join code** (→ join). Footer: "First time here? I have a join code →".

**Join `(auth)/join`** — three steps, one screen, same frame:
1. **Your join code** — code input (`autoCapitalize none`), hint + "Where do I find my code?" → `GuideSheet(section 2)`. `Continue` (disabled until non-empty). Deep-link `?code=` pre-fills and skips to step 2.
2. **About you** — `Your name` (hint) + `PhoneField` (homeowner hint). `Send code` requests OTP, starts the resend cooldown, goes to step 3.
3. **Enter the code** — "We texted … · Change number", `OtpField` auto-submits `joinAsHomeowner(code, phone, otp, name)`, `ResendCode`, `CalmVerify` → `(homeowner)/welcome` with the JoinOut params (unchanged).
   Errors: `invalid_code` → back to step 1 with `AuthError`; `already_claimed` → `AuthError` with action **Sign in instead** (→ homeowner-login); `invalid_otp` → stay on step 3, clear boxes.
   Footer: "Builder or site team? Sign in →".

**Homeowner welcome `(homeowner)/welcome`** — keep the templated-truth greeting, role pill and calm card; add a **"What's what"** list (Home · Photos · Updates · Messages · Design · Ask) — icon + tab name + one line each, from `guide.content.ts`, so it reads as the tour of the bar they're about to see. CTAs unchanged.

**Builder welcome `(contractor)/tour`** (new; named `tour` so it never shares the `/welcome` URL with the homeowner welcome) — Neev theme, once per user per device (`AsyncStorage` `neev.welcome.<userId>`). "Welcome to Neev" / company name (from `me.company_name`) / role pill. "Here's what's what" rows for the role's real tabs:
- owner: Brief · Sites · Chat · Specs · Approvals
- supervisor: Home · Tasks · Capture · Chat · More
- pm: DPR · Chat · More
- accountant: Reconcile · Payments · More
- labor_contractor: Attendance · My payments · Help
- architect: Home · Brief · Selections · Chat · More
- other: a generic "Your sites on Neev" line.
A one-line **"New here?"** note for owners: "This number started a fresh workspace. Set up your company and first site on the Neev web dashboard." CTA "Go to {first tab}" → `homeFor(role)` and sets the flag. No skip needed (it's one tap).

### 5.4 Motion & a11y

- Step changes: `FadeInUp` (240ms) on the step body; rise dropped under Reduce Motion.
- All tap targets ≥ 48px; labels always rendered (never placeholder-only); `accessibilityRole`/`Label` on every control; OTP boxes expose one `TextInput` with `accessibilityLabel="6-digit code"`.
- Status/error never colour-only (icon + words).

## 6. Error copy (both clients)

| Backend | Message | Next step |
|---|---|---|
| `401 invalid_otp` | That code didn't match. Check the SMS and try again. | clear code; resend available |
| `403 not_allowed` | This number isn't enabled for Neev yet. | action: **What's what → "Number not enabled?"** |
| `403 deactivated` | This account was deactivated. Ask your company owner to restore it. | change number |
| `404 invalid_code` | We don't recognise that join code. Check it with your builder. | back to code step |
| `404 not_found` (property) | That home is no longer on Neev. Ask your builder for a new code. | back to code step |
| `409 already_claimed` | This invite was already used. If that was you, sign in instead. | action: **Sign in** |
| `403 phone_mismatch` | This code was sent to a different number. Use the number your builder invited, or ask them for a new code. | change number |
| `409 invite_used` / `invite_revoked` (web staff invite) | This invite was already used… / This invite was cancelled. Ask your company owner for a new one. | sign in / — |
| not homeowner (client) | This number belongs to a builder account, not a homeowner. | action: **Use a join code** / **Builder sign in** |
| network | Can't reach Neev. Check your connection and try again. | retry |
| other | Something went wrong. Please try again. | retry |

HI equivalents live next to EN in the i18n catalogs.

## 7. Web design (`constructo/web`)

- **`pages/auth/AuthLayout.tsx`** — replaces `AuthCard` for signed-out screens. ≥ `md`: two columns — left **brand panel** (ink `#15171c` bg, amber mark, "Neev", "Your site command center", a 3-step "How signing in works" list: phone → code → you're in, and a "Homeowner?" note: "The Neev app is your door — ask your builder for a join code."), right: the form card. `< md`: stacked, the brand panel collapses to a slim header and the 3-step list becomes a `<details>` "How it works". Header cluster: `EN | हिं` toggle + `?` that opens the **"What's what"** `Modal` (same six sections as mobile, from `pages/auth/guide.content.ts`).
- **`pages/auth/fields.tsx`** — add `PhoneField` (fixed `+91` prefix, 10-digit grouping, `inputMode=tel`), `OtpField` (single input, 6-digit, `tracking-[0.5em]`, `autoComplete=one-time-code`), `ResendCode` (30s cooldown), `AuthError` (icon + message + optional action), `StepDots`. Keep `TextField`/`SelectField`/`AuthCard` (first-run and settings still use them).
- **`Login.tsx`** — two steps with step dots; hints from §4; OTP auto-submits at 6 digits (the "Sign in" button remains for keyboard users); dev OTP **not** pre-filled, but shown as a hint in `DEV`; errors via `mapAuthError` (`pages/auth/authErrors.ts`, tested). Routing logic (next / owner first-run) unchanged.
- **`Join.tsx`** — `AuthLayout`; shows the **role card before accepting** ("As {role} you'll …" = the coachmark copy) so "Accept & join" is informed; error states via `AuthError`.
- **`OwnerFirstRun.tsx`** — wrapped in `AuthLayout` (brand panel shows the 4 setup steps instead of the sign-in steps); form internals unchanged.
- Delete `pages/Login.tsx` + `pages/Login.test.tsx`.
- i18n: new `auth.*` / `guide.*` keys in `en.ts` + `hi.ts`; the catalog parity test must stay green.

## 8. Testing

- **Mobile** (`npm run typecheck`, `npx jest src/auth`): pure tests for phone formatting/validation/E.164/mask, `mapAuthError` for every code in §6, `homeFor` map, guide content EN/HI parity + every role present, countdown reducer. UI is not mountable in this repo's jest harness (see `wave0-kit.test.tsx`), so screens are verified by typecheck + simulator run.
- **Web** (`npm run build` — NOT `lint` — and `npm test`): update `auth/Login.test.tsx` for the new labels/steps, add `authErrors.test.ts`, `fields.test.tsx` (PhoneField grouping, OtpField auto-submit, ResendCode cooldown), `AuthLayout` smoke, `Join` role-card-before-accept. Browser verification of `/login`, `/join/:token` (mocks) at desktop + mobile widths.

## 9. Implementation notes (2026-08-23)

- Shipped on branch `claude/login-signup-ux-overhaul-31c1e3`; both clients verified live (mobile via Expo web on :8082 against the local backend, web via Vite on :5173).
- Pre-existing bug fixed on the way: `DrawnCheck` restarted (and never finished) its stroke whenever the parent re-rendered mid-draw, so `CalmVerify.onSettled` could never fire and the user was stuck on a half-drawn check. The callback now lives in a ref.
- Web `ApiError` gained an optional `code` (the backend envelope code) so §6 mapping works without string-matching messages.
- Web fonts: the web theme declares Anek/Hind but never loads them (app-wide, pre-existing) — flagged as a separate task.

## 10. Out of scope

Backend changes (join-code preview endpoint, real SMS), owner first-run on mobile (the web dashboard owns company/site setup — the builder welcome says so), Hindi copy review by a native speaker (flagged for the founder), password/email auth of any kind.
