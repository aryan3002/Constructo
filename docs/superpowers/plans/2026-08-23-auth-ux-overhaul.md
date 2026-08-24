# Auth UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One consistent, self-explaining signed-out experience (front door → phone → one-time code → welcome tour) on mobile and web, with a "What's what" guide reachable from every auth screen.

**Architecture:** Mobile gets a small auth kit in `src/auth/ui/` (AuthFrame, PhoneField, OtpField, ResendCode, AuthError, GuideSheet, StepDots, LangToggle) over pure helpers in `src/auth/auth.util.ts`; the four `(auth)` screens and two welcome screens compose it. Web mirrors the same vocabulary with `pages/auth/AuthLayout.tsx`, new field primitives in `pages/auth/fields.tsx`, `authErrors.ts`, and `guide.content.ts`. Copy is shared word-for-word via the i18n catalogs (spec §4, §6).

**Tech Stack:** Expo Router / React Native (`constructo/mobile`, jest-expo pure-logic tests), React + Vite + Tailwind + vitest/RTL (`constructo/web`). No backend changes.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-23-auth-ux-overhaul-design.md` — copy in §4, error copy in §6. Use those exact strings.
- Mobile tests live under `src/` only, never `app/` (Expo Router evaluates `app/` modules at startup).
- Mobile jest cannot mount RN components — test pure logic only; screens verified via `npm run typecheck` + simulator.
- Web verification is `npm run build` (tsc -b, stricter) + `npm test`; `npm run lint` is not sufficient.
- All tap targets ≥ 48px; labels always rendered; status/error never colour-only; honour Reduce Motion (`useReducedMotion`).
- Dev OTP hint `000000` only under `__DEV__` (mobile) / `import.meta.env.DEV` (web). Never pre-fill the OTP.
- Phone = fixed `+91` + 10 digits; E.164 sent to the API (`+91XXXXXXXXXX`).
- Themes: front door / homeowner screens = Daylight; builder login + builder welcome = Neev. Use theme tokens, no hard-coded colours except the ink/amber brand panel on web.

---

## File map

### Mobile (`constructo/mobile`)
| File | Responsibility |
|---|---|
| `src/auth/auth.util.ts` (new) | phone digits/format/validate/E.164/mask, `mapAuthError`, `homeFor`, `welcomeKey` |
| `src/auth/auth.util.test.ts` (new) | tests for the above |
| `src/auth/guide.content.ts` (new) | "What's what" sections + role tab tours, EN/HI, typed |
| `src/auth/guide.content.test.ts` (new) | EN/HI parity + all roles covered |
| `src/auth/useCountdown.ts` (new) | 30s resend cooldown hook (pure reducer + hook) |
| `src/auth/ui/AuthFrame.tsx`, `StepDots.tsx`, `PhoneField.tsx`, `OtpField.tsx`, `ResendCode.tsx`, `AuthError.tsx`, `GuideSheet.tsx`, `LangToggle.tsx`, `index.ts` (new) | the kit |
| `src/i18n/en.ts`, `src/i18n/hi.ts` | new `auth.*` keys (§4, §6) |
| `app/(auth)/index.tsx`, `login.tsx`, `homeowner-login.tsx`, `join.tsx` | rebuilt on the kit |
| `app/(homeowner)/welcome.tsx` | + "What's what" tab tour |
| `app/(contractor)/welcome.tsx` (new) | builder welcome tour, once per user |

### Web (`constructo/web`)
| File | Responsibility |
|---|---|
| `src/pages/auth/authErrors.ts` + `.test.ts` (new) | `mapAuthError` |
| `src/pages/auth/guide.content.ts` (new) | same six sections (EN/HI via i18n keys) |
| `src/pages/auth/AuthLayout.tsx` + `.test.tsx` (new) | two-column frame, lang toggle, `?` guide modal |
| `src/pages/auth/fields.tsx` + `fields.test.tsx` | + `PhoneField`, `OtpField`, `ResendCode`, `AuthError`, `StepDots` |
| `src/pages/auth/Login.tsx`, `Login.test.tsx` | rebuilt |
| `src/pages/auth/Join.tsx` | role card before accept, AuthLayout |
| `src/pages/auth/OwnerFirstRun.tsx` | wrapped in AuthLayout |
| `src/i18n/en.ts`, `hi.ts` | new keys |
| `src/pages/Login.tsx`, `src/pages/Login.test.tsx` | **delete** |

---

## Part A — Mobile

### Task A1: Pure auth helpers

**Files:** Create `src/auth/auth.util.ts`, `src/auth/auth.util.test.ts`. Modify `src/i18n/en.ts`, `src/i18n/hi.ts` (add the §6 error keys + §4 keys — full list in Task A2; A1 only needs `auth.err.*`).

**Produces:**
```ts
export function digitsOnly(s: string): string                 // strips non-digits, drops a leading 91/0 when > 10 digits
export function formatIndianMobile(digits: string): string   // '9876543210' → '98765 43210'
export function isValidIndianMobile(digits: string): boolean // 10 digits, first 6–9
export function toE164(digits: string): string               // '+91' + digits
export function maskPhone(e164: string): string              // '+919876543210' → '+91 98765 43210'
export type AuthErrorAction = 'useJoinCode' | 'signIn' | 'help' | 'retry' | 'changeNumber' | 'backToCode'
export interface AuthErrorView { message: string; action?: AuthErrorAction; helpSection?: GuideSectionId }
export function mapAuthError(err: unknown, t: (k: string) => string): AuthErrorView
export function homeFor(role: Role | null): string
export function welcomeKey(userId: string): string           // `neev.welcome.${userId}`
```
`mapAuthError` reads `ApiError.code` (`not_allowed`, `deactivated`, `invalid_otp`, `invalid_code`, `not_found`, `already_claimed`) and `ApiError.status === 0` / `TypeError` as network. It returns `t('auth.err.<code>')` and the §6 action.

- [ ] Write `auth.util.test.ts` covering: `digitsOnly('+91 98765-43210') === '9876543210'`, `digitsOnly('09876543210') === '9876543210'`, `formatIndianMobile('98765') === '98765'`, `formatIndianMobile('9876543210') === '98765 43210'`, `isValidIndianMobile` true for `9876543210`, false for `5876543210` / `98765`, `toE164('9876543210') === '+919876543210'`, `maskPhone('+919876543210') === '+91 98765 43210'`, `mapAuthError(new ApiError(403,'not_allowed','x'), t)` → `{message:'auth.err.not_allowed', action:'help', helpSection:'notEnabled'}`, every §6 code, network `TypeError` → `auth.err.network` / `retry`, unknown → `auth.err.generic` / `retry`, `homeFor('owner') === '/(contractor)/owner/brief'` … all 7 roles + null.
- [ ] Run `npx jest src/auth` → fails (module missing).
- [ ] Implement `auth.util.ts`; add `auth.err.*` keys to `en.ts`/`hi.ts`.
- [ ] Run tests → pass. Commit `feat(mobile): pure auth helpers (phone, error map, homeFor)`.

### Task A2: i18n copy + guide content

**Files:** Modify `src/i18n/en.ts`, `src/i18n/hi.ts`. Create `src/auth/guide.content.ts`, `src/auth/guide.content.test.ts`.

Add under `auth:` (EN; HI beside it — spec §4/§6):
`frontTitle, frontSub, homeownerCard, homeownerCardSub, homeownerCardHow, staffCard, staffCardSub, staffCardHow, notSure, noPassword, phoneLabel, phoneHintStaff, phoneHintHomeowner, continue, sendCode, otpTitle, otpSentTo ('…{phone}'), changeNumber, resendIn ('{s}'), resend, codeResent, checking, verified, joinTitle, joinSub, joinCodeLabel, joinCodeHint, whereFindCode, nameLabel, nameHint, joinCta, stepOf ('{n}','{total}'), help, welcomeBack, homeownerLoginSubtitle, firstTime, homeownerLink, staffLink, staffPhoneTitle, devOtpHint, err.invalid_otp, err.not_allowed, err.deactivated, err.invalid_code, err.not_found, err.already_claimed, err.not_homeowner, err.network, err.generic, action.useJoinCode, action.signIn, action.help, action.retry, action.changeNumber, action.backToCode, welcome.builderTitle, welcome.whatsWhat, welcome.newOwnerNote, welcome.goTo ('{tab}')`.
Keep existing keys still used elsewhere (`signOut`, `verify`, `notHomeowner`…).

`guide.content.ts`:
```ts
export type GuideSectionId = 'doors' | 'joinCode' | 'otp' | 'roles' | 'notEnabled' | 'privacy'
export interface GuideSection { id: GuideSectionId; icon: FeatherName; title: string; body: string[]; }
export function guideSections(lang: 'en'|'hi', opts: { dev: boolean }): GuideSection[]
export interface TourRow { icon: FeatherName; title: string; body: string }
export function roleTour(role: Role | 'homeowner', lang: 'en'|'hi'): TourRow[]   // spec §5.3 tab lists
export const ROLE_LABEL: Record<Role | 'homeowner', { en: string; hi: string }>
```
- [ ] Test: both langs return 6 sections with the ids in order; `otp` body includes `000000` only when `dev: true`; `roleTour` returns ≥3 rows for each of owner/supervisor/pm/accountant/labor_contractor/architect/homeowner in both langs; no empty strings.
- [ ] Implement; run `npx jest src/auth` + `npm run typecheck`. Commit `feat(mobile): auth copy + what's-what guide content (en/hi)`.

### Task A3: Auth kit components

**Files:** Create `src/auth/useCountdown.ts`, `src/auth/ui/{AuthFrame,StepDots,PhoneField,OtpField,ResendCode,AuthError,GuideSheet,LangToggle,index}.tsx`.

**Produces (props):**
```ts
AuthFrame: { title: string; subtitle?: ReactNode; back?: boolean | (() => void); step?: { n: number; total: number }; footer?: ReactNode; guideSection?: GuideSectionId; children }
StepDots: { n: number; total: number }
PhoneField: { digits: string; onChange(d: string): void; hint?: string; error?: boolean; autoFocus?: boolean; onSubmit?(): void }
OtpField: { value: string; onChange(v: string): void; onComplete?(v: string): void; error?: boolean; autoFocus?: boolean; disabled?: boolean }
ResendCode: { seconds: number; onResend(): void; busy?: boolean; resent?: boolean }
AuthError: { view: AuthErrorView | null; onAction?(a: AuthErrorAction): void; actionLabel?: string }
GuideSheet: { open: boolean; onClose(): void; initialSection?: GuideSectionId }
LangToggle: {}
useCountdown(): { seconds: number; start(s?: number): void }   // default 30, clears on unmount
```
Behaviour notes: `AuthFrame` header = back arrow (48px hit), `Logo size 40`, spacer, `LangToggle`, `?` button (opens `GuideSheet`). `OtpField` renders 6 boxes (52×56, `radii.control`, active box border = accent, error = risk) over an absolutely-positioned transparent `TextInput` with `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, `keyboardType="number-pad"`, `maxLength 6`; calls `onComplete` once when length hits 6. `PhoneField` = `+91` chip (paper bg) + input showing `formatIndianMobile(digits)`, `onChangeText` → `digitsOnly` capped at 10. `GuideSheet` = RN `Modal` (`animationType="slide"` unless reduced motion → `"fade"`), scrim `rgba(0,0,0,.35)`, sheet with `radii.sheet` top corners, max 85% height, `ScrollView` of sections (icon + title + bullet lines), close button ≥48px; scrolls `initialSection` into view via `onLayout` offsets.

- [ ] Implement all; export from `src/auth/ui/index.ts`.
- [ ] `npm run typecheck` passes. Commit `feat(mobile): shared auth kit (frame, phone/otp fields, resend, error, guide sheet)`.

### Task A4: Front door + builder login

**Files:** Rewrite `app/(auth)/index.tsx`, `app/(auth)/login.tsx`.

- Front door: `AuthFrame` (no back, `title=t('auth.frontTitle')`, `subtitle=t('auth.frontSub')`), two `RoleCard`s (add `how` line under subtitle in accent colour with a small `arrow-right-circle` glyph), "Not sure which one?" link → opens `GuideSheet` section `doors` (expose `AuthFrame` `openGuide` via a ref OR render your own `GuideSheet`; simplest: front door owns a `GuideSheet` state), footer `t('auth.noPassword')`.
- Builder login (Neev): state `step: 'phone' | 'otp'`, `digits`, `otp`, `errorView`, `verifyPhase/settled`, `useCountdown`. Step 1: `AuthFrame step={1,2}` title `t('auth.staffPhoneTitle')`, `PhoneField hint=phoneHintStaff`, `Button Continue disabled={!isValidIndianMobile(digits)}` → `authApi.requestOtp(toE164(digits))` (errors → `AuthError`), `start()`, step 2. Step 2: title `otpTitle`, sub `otpSentTo(maskPhone)` + `changeNumber` link (→ step 1, clear otp/error), `OtpField onComplete=verify`, `ResendCode`, dev hint, `CalmVerify` when `verifyPhase`. `verify` = `authApi.login(toE164(digits), otp)` → `refresh()`; errors → `mapAuthError`, clear otp. After auth: `const [needsWelcome, setNeedsWelcome] = useState<boolean|null>(null)`; on `me` resolved read `AsyncStorage.getItem(welcomeKey(me.id))`; redirect to `/(contractor)/welcome` when unset else `homeFor(role)` (homeowner role → `/(homeowner)/home`). Footer: `Link /(auth)/join` → `t('auth.homeownerLink')`.
- [ ] `npm run typecheck`. Commit `feat(mobile): front door + builder login on the auth kit`.

### Task A5: Homeowner login + join

**Files:** Rewrite `app/(auth)/homeowner-login.tsx`, `app/(auth)/join.tsx`.

- Homeowner login: identical two-step body in Daylight; subtitle `homeownerLoginSubtitle` + `noPassword`; `me.role !== 'homeowner'` → `signOut()`, `errorView = { message: t('auth.err.not_homeowner'), action: 'useJoinCode' }`, `AuthError` action button → `router.push('/(auth)/join')`; footer `firstTime` → join.
- Join: `step: 1|2|3`. Deep-link `code` → step 2. Step 1 `AuthFrame step={1,3}` title `joinTitle` sub `joinSub`: code `TextInput` (label `joinCodeLabel`, hint `joinCodeHint`, `autoCapitalize none`, `autoCorrect false`), "Where do I find my code?" → `GuideSheet(joinCode)`, `Continue disabled={!code.trim()}`. Step 2: name field (label/hint) + `PhoneField hint=phoneHintHomeowner`, `Send code disabled={!name.trim() || !valid}` → `requestOtp`, `start()`, step 3. Step 3: `otpSentTo` + `changeNumber` (→ step 2), `OtpField onComplete=join`, `ResendCode`, `CalmVerify` → `router.replace('/(homeowner)/welcome', params)` unchanged. Errors: `backToCode` → `setStep(1)`; `signIn` → `router.replace('/(auth)/homeowner-login')`; `invalid_otp` → clear otp. Footer `staffLink` → `/(auth)/login`.
- [ ] `npm run typecheck`. Commit `feat(mobile): homeowner login + 3-step join on the auth kit`.

### Task A6: Welcome tours

**Files:** Modify `app/(homeowner)/welcome.tsx`; create `app/(contractor)/welcome.tsx`.

- Homeowner: after the calm card, a `FadeInUp delay={120}` block: `Eyebrow` "What's what" (`auth.welcome.whatsWhat`) + rows from `roleTour('homeowner', L)` (icon circle 36px in `accentWarm`, `BodyStrong` title, `Small muted` body). CTAs unchanged.
- Builder welcome: `ThemeProvider` is provided by the group layout. Read `me`, `role`; rows from `roleTour(role)`; `StatusPill` role label; owner-only `newOwnerNote` card (info tint, `info` icon); CTA `t('auth.welcome.goTo', {tab: rows[0].title})` → `AsyncStorage.setItem(welcomeKey(me.id),'1')` then `router.replace(homeFor(role))`. Guard: if `status !== 'authed'` render null (layout already redirects guests).
- [ ] `npm run typecheck`; `npx jest src/auth`. Commit `feat(mobile): role-aware welcome tours (homeowner + builder)`.

## Part B — Web

### Task B1: Error map + guide content + i18n

**Files:** Create `src/pages/auth/authErrors.ts`, `authErrors.test.ts`, `guide.content.ts`. Modify `src/i18n/en.ts`, `hi.ts`.

```ts
export type AuthErrorAction = 'useJoinCode' | 'signIn' | 'help' | 'retry' | 'changeNumber'
export interface AuthErrorView { messageKey: TranslationKey; action?: AuthErrorAction; helpSection?: GuideSectionId }
export function mapAuthError(err: unknown): AuthErrorView
```
Keys (flat, web style): `auth.front.*` not needed (web has no chooser); add `auth.phone.hint`, `auth.otp.title`, `auth.otp.sent_to`, `auth.action.continue`, `auth.action.change_phone` (exists), `auth.action.resend_in`, `auth.code_resent`, `auth.step_of`, `auth.no_password`, `auth.homeowner_note`, `auth.how.title`, `auth.how.step1..3`, `auth.guide.title`, `auth.guide.<section>.title/.body1..n`, `auth.err.<code>` ×9, `auth.action.use_join_code|help|retry`, `join.role_card.title` ("As {role}, you'll…"). HI for each.
- [ ] Test every §6 code → key/action; network (`TypeError`) → `auth.err.network`/retry.
- [ ] Implement; `npm test -- authErrors`. Commit `feat(web): auth error map + guide content + copy`.

### Task B2: Field primitives + AuthLayout

**Files:** Modify `src/pages/auth/fields.tsx`; create `fields.test.tsx`, `AuthLayout.tsx`, `AuthLayout.test.tsx`.

```tsx
PhoneField: { label; hint?; digits: string; onChange(d: string): void; error?: boolean; autoFocus? }   // renders "+91" prefix + formatted input, inputMode tel
OtpField:   { label; hint?; value: string; onChange(v): void; onComplete?(v): void; error?: boolean; autoFocus? } // single input, maxLength 6, numeric, tracking-[0.5em], text-center
ResendCode: { seconds: number; onResend(): void; resent?: boolean }
AuthError:  { view: AuthErrorView | null; onAction?(a: AuthErrorAction): void }
StepDots:   { n: number; total: number }
useCountdown(): { seconds: number; start(s?: number): void }
AuthLayout: { children; steps?: 'signin' | 'firstrun'; title?: string }   // brand panel + card + lang toggle + "?" guide Modal
```
Phone helpers: reuse the same `digitsOnly/formatIndianMobile/isValidIndianMobile/toE164/maskPhone` — put them in `src/pages/auth/phone.ts` (+ tests, same cases as mobile A1).
- [ ] Tests: PhoneField formats `9876543210` → `98765 43210` and emits digits; OtpField calls `onComplete` once at 6 digits and ignores letters; ResendCode shows "Resend in 30s" then enables; AuthLayout renders the 3 how-it-works steps, toggles EN→HI, opens the guide dialog on `?`.
- [ ] Implement; `npm test -- fields AuthLayout`. Commit `feat(web): auth field primitives + AuthLayout with what's-what guide`.

### Task B3: Login / Join / OwnerFirstRun + delete dead page

**Files:** Rewrite `src/pages/auth/Login.tsx`, update `Login.test.tsx`; modify `Join.tsx`, `OwnerFirstRun.tsx`; delete `src/pages/Login.tsx`, `src/pages/Login.test.tsx`.

- Login: `AuthLayout steps='signin'`; step 1 `StepDots 1/2` + `PhoneField` (hint) + `Continue`; step 2 `otp.sent_to` + change number, `OtpField` auto-submits, `ResendCode`, `AuthError`, dev hint; routing logic unchanged (`next`, `ownerIsSetUp`). Remove `DEV_OTP` prefill.
- Join: `AuthLayout`; role card (`join.role_card.title` + coachmark body + role icon) shown in the preview state above the accept/sign-in button; `AuthError` for errors.
- OwnerFirstRun: wrap in `AuthLayout steps='firstrun'`; keep internals.
- [ ] Update `Login.test.tsx` (phone typed as 10 digits, "Continue", then OTP field `One-time code`, auto-submit) and keep the `next`/first-run cases.
- [ ] `npm test`, `npm run build`. Commit `feat(web): login/join/first-run on AuthLayout; drop dead Login page`.

### Task B4: Browser verification
- [ ] `preview_start` the web dev server (mocks on), visit `/login` desktop + mobile widths, `/join/<token>`, `/welcome`; read console for errors; screenshot proof.

## Part C — Wrap-up
- [ ] Mobile: `npm run typecheck && npx jest`; if a simulator is available, `run` the app and screenshot front door → builder login → OTP → welcome.
- [ ] Update `docs/superpowers/specs/...` if any decision changed; mirror plan into vault `07-Design/14 - Auth UX Overhaul Plan.md`.
- [ ] Push branch, open PR to `main` with before/after screenshots.
