# Constructo Homeowner — Design System

> **"Calm Cockpit."** A reassuring mobile app for an anxious, often non-resident, Hindi-first Indian homeowner watching their house get built. It answers **"Am I okay?" in 3 seconds** and exists to remove anxiety — premium and residential, never enterprise or industrial.

This project **is** the design system (Direction **C · "Blend"**, chosen and locked by the client). An automated compiler reads it and ships `styles.css` + a component bundle to consuming projects. Link `styles.css`; mount components from `window.ConstructoHomeownerDesignSystem_f56755`.

---

## 1 · Product context

Constructo turns the chaos a construction team already creates on WhatsApp into one trustworthy source of truth, and gives each person their slice. **This system is the HOMEOWNER app** (a sibling "contractor" theme is designed separately).

**Who it's for — "Priya":** building the largest purchase of her life through a builder she only half-trusts, in a process and language she only partly understands. Often **Hindi-first**, sometimes low digital literacy, frequently older, usually on her phone. Not a power user — **reading is the failure mode.**

**The one job — REASSURE.** Success is **earned absence**, not engagement: no streaks, no badges, no dwell-time goals. Everything defuses four anxieties:
- **Silence** (no news) → presence: *"Site quiet 3 days — curing, normal."*
- **Jargon** (a word she can't parse) → plain words.
- **Money** (an unexpected number) → no surprises, always pre-approved.
- **Decision** (a choice with no context) → pre-briefed, reversible.

### Hard constraints (honoured throughout)
- **Multi-script, Devanagari-first.** Eczar + Hind both render Devanagari + Latin (self-hosted, see `tokens/fonts.css`). App is **single-language per screen** (EN *or* हिं) — never both.
- **No fake progress.** Never a % or ring — position in **time** via `TimeBar` (Start → Handover, you-are-here marker).
- **Real photos only.** `PhotoTile`/`EvidenceCard` are built around real human-taken photos; never AI/3D renders.
- **Status = colour + icon + word**, never colour alone (`StatusPill`).
- **Red = genuine delay/risk only.**
- **Voice & photo before forms.** Composer leads with camera + hold-to-talk; typing last.
- **Money:** ₹ Indian-grouped (₹1,20,000), tabular mono numerals.
- **Accessibility:** ≥48px targets, ≥4.5:1 contrast (verified), ≥14px type, respects reduced-motion.

### Sources
No codebase, Figma, or brand kit was provided — the visual language was designed from the written brief. Mood references cited by the client: *Apple Health's calm, Airbnb's warmth (derive the feeling, don't copy).* Two directions ("Aangan" warm-editorial, "Aakaash" daylight-calm) were explored in `directions/`; the client chose the **Blend (C)** and locked the colour roles below. **No logo asset exists yet** — the wordmark in `guidelines/brand-wordmark.card.html` is a placeholder.

---

## 2 · Content fundamentals (voice)

A **calm, warm, honest, trusted person** — never enterprise software, never a construction tool. **Reassure first, then inform.**

- **Person:** speak to her as **"you"**; the app/assistant is **"we"** ("We'll tell you the moment it does"). The assistant has a name — **Nivaan** ("your guide") — and is grounded ("✦ from your site updates") with an honest fallback ("ask your builder").
- **Casing:** sentence case everywhere except short uppercase **eyebrows** (`TODAY`, `THIS WEEK`) and status words in pills. Never SHOUTING.
- **Plain words, never jargon:** "The roof is setting hard — about two weeks," not "RCC slab curing in progress."
- **Numbers earn their place.** No data slop. Money always says *why* and *who approved it*: "Tile upgrade · +₹18,000 · you approved this."
- **Emoji:** only in **human-authored** content (a builder typing "Namaste 🙏"). **Never** in UI chrome, labels, or system copy — those use the bundled line icons.
- **Length:** short. One reassuring line beats a paragraph. The Home answer is three words: *"You're okay."*

Worked examples live in `guidelines/brand-voice.card.html` (the four anxieties → the reassuring rewrite).

---

## 3 · Visual foundations

**Mood:** a warm Indian home at calm morning light. Serif soul, modern bones, residential — not industrial.

### Colour (`tokens/colors.css`)
- **Warm sand canvas** — `--sand-200 #F3EFE6` page, `--surface #FCFAF3` cards, `--sand-100` letter panels. Never clinical pure white.
- **Ink** is a warm near-black (`#2A2519`); secondary text `--ink-600 #6A6047` (5.4:1 on sand). All body colours verified ≥4.5:1.
- **Locked semantic roles:**
  - **Sage green** (`--green-600` fill / `--green-700` text) = **primary actions + "on track"**. Nudged warm to sit on sand; white-on-600 = 5.0:1.
  - **Terracotta clay** (`--clay-600` fill / `--clay-700` text, eyebrows, you-are-here marker) = **warm secondary — celebration + milestones**.
  - **Amber** (`--amber-700` text on `--amber-tint`) = **"needs you" choices** — a choice, not a risk.
  - **Red** (`--red-600`) = **genuine delay / risk ONLY**, never decorative.
  - **Neutral grey** = progress / quiet / info (no extra hue — a disciplined 4-hue + neutral system).

### Type (`tokens/typography.css`)
- **Eczar (serif) — HEADLINES ONLY** (the reassuring voice + the 3-second answer). Never body.
- **Hind (sans) — all body + UI.** Legible, calm, Devanagari-first. 14px floor.
- **IBM Plex Mono — money + tabular numerals.** ₹ grouped Indian-style.
- Scale: hero 44 / h1 28 / h2 22 / h3 18 / title 16 / body 15 / body-sm 14 / eyebrow 11.5 (uppercase, clay-700, 0.2em).

### Shape, elevation, motion
- **Radii:** soft, residential — buttons 14, tiles 18, cards 22, hero 28, bubbles 19, pills full. Pebbles, not boxes.
- **Cards:** warm surface + 1px hairline border (`rgba(42,37,25,.09)`) + a faint paper inset highlight + a low warm lift (`--shadow-card`, ink-tinted, never hard black). "Lifted paper," not a drop shadow.
- **Elevation** is warm and soft: hairline → raise → card → pop. Bottom nav lifts upward.
- **Backgrounds:** a gentle radial sand wash (lighter at top); no AI gradients, no busy patterns. Imagery is real photos, warm-toned, shown in rounded tiles with optional bottom protection-gradient captions and a "+N" count.
- **Borders:** single hairline; dashed only for quiet/empty low-emphasis cards.
- **Transparency/blur:** reserved for sticky chrome (header, bottom nav, composer) — `color-mix` surface at ~88–90% + `blur(8–10px)`.
- **Hover:** primary darkens green-600 → green-700; secondary → sand-2; ghost → green-tint. **Press:** subtle `scale(.97)`, no bounce.
- **Motion (`tokens/motion.css`):** calm ease-out `cubic-bezier(.22,.61,.36,1)`; 140ms taps / 220ms default / 360ms entrances / 600ms gentle reveal. Soft fades + small rises; **no bounce, no infinite decorative loops.** Always honours `prefers-reduced-motion`.
- **Focus:** 2-tone keyboard ring (sand + green).

### Signature elements
1. **The `TimeBar`** — position in *time* with a warm clay you-are-here marker (never a %).
2. **The serif reassurance** — "You're okay." in Eczar on open sand.
3. **The `DecisionCard`** — calm amber, pre-briefed, reversible (never red).

---

## 4 · Iconography

- **One bundled set:** the `Icon` component (`components/icon/`) carries **Lucide** path data embedded as inline SVG — **no CDN, no icon font** (both proved unreliable in testing). Line icons, calm **1.85** default stroke, `currentColor`.
- Use `<Icon name="…" />` everywhere an icon is needed so every status is **colour + icon + word**. See `iconNames` for the ~40 bundled glyphs (check, circle-check, hand, clock, camera, mic, image, images, house, route, wallet, shield-check, badge-check, sparkles, triangle-alert, volume-2, …).
- **No emoji in UI.** Emoji appear only inside human-authored message content.
- **Substitution flagged:** Lucide stands in for a bespoke icon set (none was provided). Swap the path map in `Icon.jsx` if a branded set arrives.

---

## 5 · Index / manifest

**Root**
- `styles.css` — the entry point (imports only). Consumers link this.
- `tokens/` — `fonts.css` (self-hosted Eczar/Hind/IBM Plex Mono, Devanagari+Latin), `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `motion.css`, `base.css`.
- `assets/fonts/` — the self-hosted woff2 binaries.
- `directions/` — the exploration that led here (Home, Home Room, Decision, Journey in directions A/B/C). Reference only.

**Components** (`components/<group>/` — `.jsx` + `.d.ts` + `.prompt.md` + a `@dsCard` html)
- `icon/` — **Icon**
- `buttons/` — **Button**, **IconButton**, **Chip**
- `status/` — **StatusPill**, **TimeBar**
- `cards/` — **Card**, **EvidenceCard**, **DecisionCard**
- `media/` — **PhotoTile**, **Avatar**
- `navigation/` — **BottomNav**
- `feedback/` — **QuietState**

**Starting points:** Button, TimeBar, EvidenceCard, DecisionCard, QuietState, and the full Homeowner app.

**Guidelines** (`guidelines/`) — foundation specimen cards for the Design System tab: Colors (canvas, ink, green, clay, amber, red), Type (display, body, mono, multi-script, scale), Spacing (scale, radius, elevation, motion), Brand (wordmark, voice).

**UI kit** (`ui_kits/homeowner/`) — interactive app recreation: `index.html` + `AppShell`, `HomeScreen`, `JourneyScreen`, `DecisionScreen`, `HomeRoomScreen`. See its `README.md`.

**Namespace:** `window.ConstructoHomeownerDesignSystem_f56755`.
