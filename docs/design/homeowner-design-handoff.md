# Constructo Homeowner App — Design Handoff Spec

**Audience:** engineering agents implementing the homeowner app.
**Status:** design decisions locked (UI/UX phase complete). This is the single source of truth for building the homeowner UI.
**Design language:** "Calm Cockpit" — Uber-grade glanceable clarity + warm editorial voice + a signature *living-home* hero.
**Stack:** React Native + Expo (Expo Router), existing token system in `constructo/mobile/src/ui/theme`. This doc **updates the "Daylight" theme** to the new Calm Cockpit values below.
**Companion files:** `homeowner-DESIGN.md` (design-system source), `homeowner-stitch-prompt-library.md` (per-screen prompts + reference renders in Stitch project `14655651634697253072`), `homeowner-screen-plan.md`.

---

## 0. Product north star (governs every UI judgment call)
The app's one job is **REASSURE** → "earned absence": the user opens it, learns *"you're okay — nothing needs you today,"* and closes it calm. **Empty = good news, said out loud.** Never measure/encourage engagement. The whole UI is organized to defuse four anxieties: **Silence · Jargon · Money · Decision.**

Five rules that override aesthetics:
1. **Evidence on tap** — every claim/number is one tap from its proof.
2. **Voice & photo before forms** — typing is the last resort for capture.
3. **Exceptions, not activity** — lead with the ≤1–3 things needing attention; hide empty cards.
4. **Calm, never enterprise** — no spreadsheet/dashboard homepages, no 12-field forms.
5. **Honest AI** — when unsure, say so + offer "ask your builder"; never invent site data; AI text is human-reviewed before it shows.

---

## 1. Language system (TWO modes — build as first-class i18n)

The app ships **single-language per screen**, user-selectable, **never two languages on one screen**. This is a hard product requirement.

| Mode | Rule |
|---|---|
| **English** | 100% English UI. Numbers stay numeric; ₹ uses **Indian digit grouping** (`₹1,20,000`, never `₹120,000`). |
| **Hindi** | Hindi (Devanagari) UI, warm and natural. English allowed **only** for: proper nouns/names (e.g. "Priya", "Bengaluru"), the brand "Constructo", and unavoidable tokens (OTP, PDF, ₹, numbers, dates). **No English gloss beside the Hindi.** Translate ALL UI chrome including the bottom nav (Home→होम, Photos→तस्वीरें, Updates→अपडेट, Design→डिज़ाइन). |

**Implementation:**
- Use a real i18n layer (e.g. `i18next`/`react-i18next` or `expo-localization` + a string catalog). Two locales: `en`, `hi`. Every visible string comes from the catalog — **no hardcoded UI text**.
- Language is a **user/account setting** (persisted, server-synced), with an in-app toggle in **Settings → Language**. Default to the OS locale on first run, fall back to English.
- **Per-member language** is supported (a mixed-language household: one member reads Hindi, another English) — language is per *user*, not per *device*.
- **Numbers/dates/₹ are locale-aware but never "translated"**: Western Arabic digits by default in both modes; Indian grouping for ₹ (`Intl`/custom formatter); dates as `DD MMM` / relative ("आज" / "today").
- **AI-generated copy** (captions, summaries, status sentences, profiles) is generated **natively in the active language**, not translated after. The backend already has a translation read-path (`TranslationClient`) with a numeric guard — reuse it; never let translation alter a digit/date/₹.
- **Typography must render Devanagari** at all sizes (see §3) — this is why the type stack is Anek/Hind, not a Latin-only font.
- **Layout must tolerate Hindi text expansion** (~15–20% longer): flexible/auto-sizing containers, never fixed-width text, allow 2-line wrap on labels.

> Design references in Stitch show bilingual dual-labels for illustration only. The real app picks one side per the active mode.

---

## 2. App shell & navigation

### 2.1 Bottom navigation — FLOATING + TRANSLUCENT (WhatsApp-style)
A **floating, slightly transparent** bottom tab bar (not edge-to-edge, not opaque). Content scrolls **behind** it.

- **4 destinations only:** Home · Photos · Updates · Design. Each = **icon + label** (never icon-only). Active item tinted **Calm Pine** `#1E7A63`; inactive `text-muted` `#5B6166`.
- **Floating:** detached from the screen edges — horizontal margin `16px` each side, sits `~12px` above the bottom safe-area inset. Corner radius **`28px`** (pill-like) or `24px`. Drop shadow: soft warm `0 6px 20px rgba(60,50,30,0.12)`.
- **Translucent (frosted glass, like WhatsApp):** semi-transparent background with a **backdrop blur**.
  - RN: wrap in **`expo-blur` `BlurView`** (`intensity` ≈ 40–60, `tint="light"`) with a translucent fill on top: background `rgba(250,246,238,0.72)` (warm paper @ ~72% opacity). On Android where blur is weaker, fall back to a higher-opacity fill `rgba(250,246,238,0.92)`.
  - A hairline top inner border `rgba(0,0,0,0.04)` for definition.
- **Height:** `64px` content + safe-area; tap targets ≥ `48×48px`.
- **Behavior:** persists across the 4 tabs; does **not** hide on scroll (calm, predictable). Sub-routes (viewers, flows, settings) are pushed screens that **cover** the bar (full-screen) — the bar is only on the 4 top-level tabs.

### 2.2 Floating "Ask" pill
A persistent pill that opens the grounded assistant, on all 4 tabs.
- Sits **above** the bottom bar, right-aligned, `16px` from the right edge, `~12px` above the bar.
- Pill shape (`borderRadius: 9999`), **Calm Pine** fill, white text + ✨ icon. Label localized ("Ask" / "पूछें" — short form; full "Have a question? Ask" / "कोई सवाल? पूछें" when space allows).
- Height ≥ `48px`. Soft shadow. Subtle scale-down on press.

### 2.3 Top bar (Home only)
Home has no standard header — the living-home hero IS the header. Overlaid on the hero: "Constructo" wordmark (top-left), a circular **avatar/settings** button (top-right, 48px) → opens Settings. Other tabs use a simple title + subtitle header.

### 2.4 Routing map (Expo Router)
```
(homeowner)/
  home        → Tab 1   (states: on-track | needs-attention | quiet)
  photos      → Tab 2   → photo/[id] (full-screen viewer, pushed)
  updates     → Tab 3   (sub-tabs: timeline | milestones | changes | property)
  design      → Tab 4   → design/intake (3 steps), design/plan/[id]
  settings, members, notifications  (pushed from Home avatar)
  flag, requests, decision/[id], ask, recap, handover, inbox  (pushed/modal)
(auth)/ login, join, welcome, household   (pre-app)
```
Settings/Members/Notifications/flows are **pushed screens, never a 5th tab.**

---

## 3. Design tokens

> These **replace the current Daylight theme values** in `src/ui/theme`. Keep the same token *names* where they exist; update the *values*. Add a `secondary` (warm clay) token.

### 3.1 Color
**Surfaces**
| Token | Value | Usage |
|---|---|---|
| `bg` / canvas | `#FAF6EE` | App background ("Warm Paper" — never pure white) |
| `card` | `#FFFFFF` | Cards / content surfaces |
| `surfaceLow` | `#F5F0E5` | Inset surfaces, search fields |
| `line` / outline | `#D9D2C2` | Hairlines / dividers |
| `textPrimary` | `#1E2230` | Body / headings |
| `textMuted` | `#5B6166` | Metadata, captions, inactive nav |

**Brand**
| Token | Value | Usage |
|---|---|---|
| `accent` / `primary` (**Calm Pine**) | `#1E7A63` | Primary actions, active nav, "on track", time-bar fill, Ask pill |
| `accentDeep` | `#155C4A` | Pressed/hover primary |
| `primaryContainer` | `#CDE7DD` | Soft green chips / selected states |
| `secondary` (**Warm Clay**) | `#C5683B` | **Celebration/milestones ONLY** — never warnings |
| `secondaryContainer` | `#F4D9C6` | Soft clay chips, weekly-summary accent bg |

**Status spine (identical everywhere; ALWAYS render color + icon + word — never color alone)**
| Token | Value | Icon | Meaning |
|---|---|---|---|
| `ok` | `#1E9E5A` | ✓ | on track / done / matched |
| `warn` | `#E8A317` | ! / clock | needs attention / pending |
| `risk` | `#E5484D` | △ | genuine delay / money risk **only** (never decorative) |
| `info` | `#3B7DD8` | ⇄ / i | change / neutral update |
| `quiet` (muted grey) | `#8C8A82` | clock | quiet-period (calm, **never red**) |

### 3.2 Typography (Devanagari-first; never below 14px)
Fonts (already installed via `@expo-google-fonts`): **Anek** (Anek Latin + Anek Devanagari) = display/headlines; **Hind** = body/UI; **Spline Sans Mono** = numbers/₹/dates.

| Token | Size/Line | Weight | Family | Usage |
|---|---|---|---|---|
| `display` | 34/40, -0.02em | 700 | Anek | hero greeting |
| `h1` | 28/34, -0.01em | 700 | Anek | screen titles |
| `h2` | 22/28, -0.01em | 600 | Anek | section/card headings |
| `title` | 18/24 | 600 | Anek | card titles |
| `bodyLg` | 18/28 | 400 | Hind | primary reading copy (status sentence) |
| `body` | 16/24 | 400 | Hind | default body |
| `label` | 14/20 | 500 | Hind | labels, captions, nav |
| `dataNum` | 16/22 | 600 | Spline Sans Mono | ₹ amounts, counts |
| `monoSm` | 13/18, 0.02em | 500 | Spline Sans Mono | dates, timestamps, eyebrows |

Money: always `₹` leading, no space, Indian grouping (`₹2,40,000`). Dates: `DD MMM` / relative.

### 3.3 Spacing — 4px base
`xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32`. Screen side margin = **20px** (`gutter`). Between major sections = **24–32px**.

### 3.4 Radius
`chip/input 12 · card 16 · hero/large 20 · sheet (top) 24 · pill/button 9999`.

### 3.5 Elevation (soft, warm, residential)
- Card shadow: `0 8px 24px rgba(60,50,30,0.06)`.
- Floating nav/pill shadow: `0 6px 20px rgba(60,50,30,0.12)`.
- Hero: full-bleed image + bottom-up dark scrim gradient (so white overlay text stays legible on any photo).
- Press feedback: scale to `0.98` + slight shadow tighten.

### 3.6 Motion (calm: 200–320ms, soft ease-out)
| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Cards / sections | mount | fade + 8px rise | 240ms | ease-out |
| Time-bar fill | data load | width grow | 300ms | ease-out |
| Milestone complete | event | warm-clay "confetti-lite", once, dismissible | 600ms | ease-out |
| Quiet-period card | mount | **fade only, never pulse** | 240ms | linear |
| Bottom sheet | open | rise from bottom + backdrop dim/blur | 280ms | ease-out |
| Press (cards/buttons) | touch | scale 0.98 | 120ms | ease-in-out |
| Status sentence | mount | **no animation that delays reading** | — | — |
Respect `prefers-reduced-motion` / Reduce Motion (disable rises/confetti, keep fades).

---

## 4. Core components (props + states)

> Build these as reusable RN components. Several exist already in `src/ui` (extend, don't duplicate): `SettleBar` (=time-bar), `EvidenceCard`, `StatusPill`, `CalmCard`, `HomeWidget`, `Card`, `Button`.

### LivingHomeHero
Full-bleed real photo + bottom scrim. Props: `imageUri`, `greeting`, `propertyName`, `statusChip {tone, icon, label}`, `onAvatarPress`. **Never** an AI/3D render — real photo only. Height ~`45%` of viewport (40% in needs-attention/quiet states). Empty (brand new project): a warm placeholder photo + "Starting soon".

### TimeBar (`SettleBar` — NEVER a percentage/ring)
Horizontal bar showing position between start and handover. Props: `startDate`, `handoverDate`, `milestoneTicks[]`, `youAreHere` (computed `(today−start)/(handover−start)`). Renders: left label "Started Jan 2026" (mono), right label "~Handover Nov 2026" (mono), Calm-Pine fill, a warm "you-are-here" dot, faint completed-milestone ticks. **No `%` text anywhere.** Bar height `8–12px`. If dates unknown → "Starting soon" state, no bar fill.

### StatusCard
Wraps TimeBar + current milestone title (Anek) + one-line **status sentence** (AI, bodyLg) + a `✦ Reviewed by site` trust badge. White card overlapping the hero bottom by `24px`.

### StatusPill / StatusDot
`{tone: ok|warn|risk|info|quiet, icon, label}`. Tinted pill bg = tone @ ~15% opacity, tone-colored icon + high-contrast text. **Always icon + word.** Used in hero chip, timeline cards, requests, etc.

### NeedsAttentionCard
Shows only when one item needs the user. Props: `title`, `context`, `costLine` (e.g. "+₹0 · reversible"), `onReview`. Amber (`warn`) left border, eyebrow "NEEDS YOU · 1 of 1". **One item at a time.** Absent when nothing needs her.

### EvidenceCard ("Show proof ▾")
Any claim expands in place to its proof (timestamped photo / challan / voice / message). Props: `claim`, `statusTone`, `evidence[]`, `defaultOpen`. Expand animation 120–200ms.

### ShortcutRail / HomeWidget
Row of compact tappable tiles (88px): `eyebrow` (caps label), `primary` (value), optional thumbnail/icon, `onPress`. Tiles with nothing to say **collapse/hide**. e.g. NEXT UP, PHOTOS, THIS WEEK, CHANGES (mono ₹).

### PhotoTile + Caption
Real photo, AI caption (active language), date, room chip, `ⓘ` jargon-translate, actions Save/Share/Hide (Hide is **per-member, reversible**). Video tiles show ▶.

### DecisionCard (pre-brief)
`why-now`, `options[] {photo, label, meaning, costLine}`, taste cross-link (advisory chip, never blocking), choices, `reversibleUntil`. Never a bare "Approve?".

### WeeklySummaryCard
Warm-clay left accent, eyebrow "THIS WEEK · <range>", 2-line AI summary, `🔊 Listen` (TTS) + "Read the full letter →". The full letter has 4 fixed sections (What got done / Coming next / Needs you / Delays).

### CaptureBar (Flag / capture)
Two big inputs: **📷 Photo** + **🎙 Hold-to-talk** (each ≥`72px`), tiny "type" link. Optimistic confirm, offline-tolerant (queue + sync status), never a blocking network wall.

### Buttons
`primary` (Calm Pine fill, white, ≥48px, icon+word) · `secondary` (Pine outline, transparent) · celebration accents use Warm Clay. Min height 48px.

---

## 5. Screen specs (states + content rules)

> For each screen's full layout/copy, see `homeowner-stitch-prompt-library.md` (prompts) and the rendered references in the Stitch project. Below: the implementation-critical states/edge cases per screen.

**Home** (3 states, same shell):
- *On-track*: hero (green chip) + StatusCard + ShortcutRail + Latest-from-site strip + WeeklySummaryCard.
- *Needs-attention*: amber chip + NeedsAttentionCard above StatusCard. One item only.
- *Quiet*: muted-grey chip + QuietPeriodCard (explains the silence, **never red, never pulsing**). Triggered when no published photo/update for ~48–72h; reason comes from the contractor's confirmed quiet-period (backend `quiet_periods`), never invented.
- Cards are **conditional** — render only if they have content.

**Photos:** AI search bar (text + 🎤), "Latest" hero, segmented [All · By Room · By Milestone · My visits], grouped grid (date/room/milestone), `+` FAB for her own uploads. Quiet tile when sparse. Captions in active language. Empty: calm "No photos yet — your builder will start sharing soon."

**Photo viewer (pushed, full-screen):** caption + date + room + author + `ⓘ` translate, Save/Share/Hide, swipe filmstrip.

**Updates:** sub-tabs Timeline / Milestones / Changes / Property.
- *Timeline*: pinned WeeklySummaryCard + feed of card archetypes (milestone ✓ / progress ⇄ / delay △ / change ⇄ / quiet grey). **Delay card MUST carry revised-date + reason + impact** (enforce in UI — don't render a delay without them).
- *Milestones*: vertical tracker, **range estimates** ("usually 10–18 days, day 8"), evidence packet on done items. No %.
- *Changes*: pinned running-total + ChangeStory cards (WHAT/WHY/+₹/+days/WHO approved). Money shown story-first.
- *Property*: per-room stage chips (✓structure ▦plaster), **no %**; tap room → filter Photos.

**Design:** Style Profile card · Plans (PDF + AI "what changed" + Approve/Ask-first; amber "Pending your approval") · Room-by-room cards (coherence tone ✓/~, **advisory, never blocking, never red**) · Inspiration board (real photos, provenance) · Monthly digest (warm-clay).
**Design Intake (3 steps):** Step1 real-photo preference grid + 🎙 voice + skip; Step3 AI Hinglish/English profile + grounding badge + per-room chips + 🎙 adjust-by-voice + confirm (confetti-lite).

**Action flows:** Decision detail (pre-brief, reversible-until) · Flag issue (capture-first 2-step) · My Requests (Open/Resolved, real reply threads, SLA promise) · Ask/Assistant (grounded, cites sources, **abstains + "send to team"** on money/structural).

**Onboarding/Settings:** Login (phone + 6 mono OTP boxes; SMS primary, resend countdown) · Welcome (templated truth) · Household (members + roles + design-say) · Settings hub (rows + live subtitles) · Members (named roles + capability lines + graceful authority — never a grey lock) · Notifications (As-it-happens/Daily/Weekly/Pause; spikes always punch through).

**Net-new:** Handover (Checklist/Walkthrough/Warranty, **count bar not %**, photo-required snags) · 60-sec recap (stories player, real photos only) · Inbox (NEEDS YOU vs GOOD TO KNOW; "All caught up" empty state).

---

## 6. Global states & edge cases
- **Empty states are designed, never blank** — and framed as reassurance ("All calm tonight — nothing needs you"). Conditional cards hide entirely when empty (no "0 pending").
- **Loading:** soft skeletons matching card shapes; never block the status answer. The Home status answer should render from cache first.
- **Offline:** capture is **local-first** (write to outbox, confirm optimistically), show a small sync indicator (⏳ queued / 🔄 syncing / ✓ synced / ⚠ needs attention). **Never a blocking "No internet" wall** — show last-known data, labeled.
- **Long text / Hindi expansion:** all labels wrap to 2 lines max; truncate body with "…" + tap-to-expand; never clip Devanagari (line-height accommodates matras).
- **Missing data:** show honest "—" or "Not shared yet", never a fabricated value. AI low-confidence shows a quiet marker, never a confident guess.
- **Long money values:** mono digits, Indian grouping, never wrap mid-number.
- **Shared/low-end device:** identity per-login (not per-device), no sensitive data in lock-screen previews, cap media cache (cloud is source of truth — deleting cache never deletes the record).

---

## 7. Accessibility (WCAG 2.2 AA floor)
- Contrast ≥ 4.5:1 body / ≥ 3:1 large & icons; **status = color + icon + word, never color alone.**
- Tap targets ≥ 48×48 (field-capture inputs ≥ 72).
- Full localization: TalkBack/VoiceOver labels in the active language; proof images have text alternatives; live-region for sync status.
- **Voice-out (TTS)** available on summaries/confirmations (`expo-speech`), in the active language.
- OS font-scale to ≥200% without clipping (test Devanagari at 200%).
- Respect Reduce Motion; logical focus order; no swipe-only/long-press-only critical actions.

---

## 8. Hard "do NOT" list (these break the product)
- ❌ Any **percentage / progress ring / "% complete"** → use the **time-bar**.
- ❌ **AI-generated or 3D house renders** → only real photos a human took.
- ❌ **Two languages on one screen** (see §1).
- ❌ Inter/Roboto/system-font defaults → use Anek + Hind.
- ❌ Purple→blue AI gradients; safety-orange / construction-yellow industrial styling.
- ❌ Spreadsheet-grid or dashboard homepages; 12-field forms.
- ❌ Icon-only critical buttons; color-only status.
- ❌ **Red used decoratively** (red = genuine delay/risk only); alarms without a next step; gamified streaks/badges.
- ❌ Clinical pure-white app background → use Warm Paper.
- ❌ An **opaque, edge-to-edge bottom bar** → it must float + be translucent (§2.1).

---

## 9. Implementation pointers (this repo)
- Update `src/ui/theme` Daylight tokens to §3 values; add `secondary`/`secondaryContainer` (warm clay) and a `quiet` status tone.
- Bottom bar: replace the current tab bar with a floating translucent `BlurView` container (`expo-blur` already viable on Expo 54); see §2.1 for fallbacks.
- Add i18n catalog (`en`/`hi`) and route all strings through it; wire the Settings → Language toggle to a persisted, server-synced per-user setting; default from `expo-localization`.
- Reuse existing components: `SettleBar` (time-bar), `EvidenceCard`, `StatusPill`, `CalmCard`, `HomeWidget`. Build the rest from §4.
- Real reference renders for every screen live in Stitch project `14655651634697253072` ("Constructo — Homeowner (Fresh Redesign)") — use them as the visual target; export HTML/CSS from Stitch per screen for exact measurements if needed.

---

*Contractor app ("Blueprint" amber-on-ink, multi-role) is a separate handoff — not covered here.*
