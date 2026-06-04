---
name: constructo-design-system
description: The locked visual language and UX principles for Constructo — the AI-native construction-management product for India SMB contractors. Use this skill WHENEVER building, designing, styling, or reviewing ANY Constructo UI — the React web dashboard, Android app screens, components, the WhatsApp bot's message formatting, or the homeowner app — even if the user just says "build the dashboard", "add a screen", "style this", or "make a component". It encodes the color tokens, typography, components, motion, and accessibility rules so every screen stays on-brand instead of defaulting to generic SaaS. The contractor WEB console is now a light+dark dual-mode system on semantic tokens (full spec in vault `11-Contractor-Web-Experience/`). Trigger on any frontend/UI/screen/component/styling work in this repo.
---

# Constructo Design System — "Blueprint & Daylight"

Apply this to every Constructo interface. Full design docs live in the product vault under `07-Design/` (Principles, Design System, IA, Auth, Role Flows, WhatsApp Bot, Core Flows, Homeowner, Notifications, Accessibility). For the **contractor web console** specifically, the authority is `11-Contractor-Web-Experience/` — the senior-grade **light+dark design system** (`01`), IA & shell (`02`), screen-by-screen (`03`), frontend architecture (`04`), component library (`05`), setup/admin control plane (`06`), and build plan (`07`). This skill is the working summary — read it before writing UI code, and follow the vault docs for screen-level detail.

## The product in one line
Turn the chaos a construction team already creates on WhatsApp into one trustworthy source of operational truth, and hand each role exactly their slice — in the language and format they already use (Hindi-first, voice/photo-first, evidence-on-tap).

## Three surfaces, three temperatures
- **WhatsApp bot** — capture & query. Invisible, polite, one-tap, Hindi/Hinglish. No rich UI; format with text, lists, emoji, document sends.
- **Contractor app + web** — review, decide, act. Confident, grounded, evidence-dense. Theme: **Site / "Blueprint"** — now **light + dark** dual-mode on the web (`data-theme="light"|"dark"`, OS-default + user override); the Expo contractor app stays light for now.
- **Homeowner app** — reassure. Calm, warm, card-based. Theme: **Daylight.**

## Five principles (in priority order)
1. **Evidence on tap** — every number/alert/claim is one tap from its proof (timestamped photo, challan, voice extraction, message). This is the soul. Build a reusable `EvidenceCard` with a `Show proof ▾` reveal.
2. **Voice & photo before forms** — for supervisor/mukadam, a form is a failure. Default input = photo or hold-to-talk. Typing is last resort.
3. **Exceptions, not activity** — never dump logs at decision-makers. Lead with the ≤3 things needing attention. Empty = a positive signal (hide empty cards).
4. **Calm confidence, never enterprise** — dense where the owner wants control, spacious/warm where the homeowner wants reassurance. No spreadsheet-grid homepages, no 12-field forms.
5. **Honest AI** — when unsure, say so and ask ONE short tappable question; never invent site data. Mark low-confidence (<0.6) events visibly. AI drafts are human-reviewed before they travel up/out.

## Color tokens

**Status spine (identical on all surfaces — a language users learn once):**
```
--ok:   #1E9E5A   (on track / matched / present / done)
--warn: #E8A317   (attention / pending / variance in tolerance)
--risk: #E5484D   (money/schedule/safety risk / mismatch / blocked)
--info: #3B7DD8   (change / neutral update)
```
Always pair status color with an icon or shape — never color alone (colorblind + sunlight).

**Site theme — "Blueprint."** The **web** is now **dual-mode (Light + Dark)** on a 3-tier semantic-token system (primitive → role → component). Full spec, all ramps & contrast proofs: `11-Contractor-Web-Experience/01 - Design System (Light and Dark)`.

Legacy tokens (still used by the **Expo contractor app**; kept as `var()` aliases on web for one release during retrofit):
```
--ink #15171C   --paper #F7F5F0   --paper-2 #FFFFFF   --line #D9D4C8
--amber #F2A100  --amber-deep #C77F00   --text #15171C   --text-mute #6B6F78
```

**Web semantic roles** — components bind to THESE, never raw hex; redefined per `data-theme`:
```
                    LIGHT      DARK
--surface           #F7F5F0    #0E1014    app canvas
--surface-card      #FFFFFF    #14171D    cards, grid body, sidebar
--surface-sunken    #F1EEE6    #0B0D11    grid header, input track, wells
--surface-hover     #F1EEE6    #232831    row/control hover
--text-primary      #15171C    #ECEEF1
--text-secondary    #4A4E57    #A6ADB8
--text-muted        #6B6F78    #7B828E
--border            #C4BEB1    #2C313B
--divider           #D9D4C8    #23272F
--brand             #F2A100    #FFB72E    THE one primary action (amber LIFTS in dark)
--text-on-brand     #15171C    #15171C    dark ink on amber, both modes (9:1+)
--ring  (focus)     #A06600    #FFB72E    deep amber on paper — NOT #F2A100
```
Status spine keeps its hues across modes; each gets `-solid` / `-bg` (tint) / `-fg` (text) per mode — e.g. light `--risk-fg #B0282C` on `--risk-bg #FCE7E8`; dark lifts to `--risk-solid #F26469`. (Full table: 11/01 §2.2.)

> ⚠ **Amber rule (real bug-source).** `#F2A100` on warm paper is only **1.9:1** — it FAILS as text, a thin line, an icon, or a focus ring on light. **Amber is for FILLS** (button, active-nav pill) with dark ink on top, or the active-nav left-bar + tint bg. For amber-as-text use `--brand-text` (`#5A3B00` light). In dark, lifted `#FFB72E` clears 3:1, so amber lines/rings are fine there. (The live `ApprovalRow` writes `accent-[var(--amber)]` — a **non-existent token**; fix to `--brand`.)

> **Token rename.** The live `--c-*` names (`--c-primary`, `--c-paper`, `--c-line`, `--c-text`, …) are renamed to the semantic scheme above (`--c-primary`→`--brand`, `--c-paper`→`--surface`, `--c-line`→`--divider`, `--c-text`→`--text-primary`, …) and kept as `var()` aliases for one release so no live page breaks during retrofit.

**Theming architecture:** semantic roles redefined inside `[data-theme="light"]` / `[data-theme="dark"]`; default = `prefers-color-scheme` with a persisted user override; set the attribute pre-paint to avoid FOUC. High-contrast ("Sunlight") becomes an **orthogonal** `data-contrast="high"` axis layered on either mode, not a third theme.

**Daylight theme (homeowner app):**
```
--bg: #FBFAF7    --card: #FFFFFF
--accent: #2F8F6F        (calm green-teal primary)
--accent-warm: #E7B66A   (milestones / celebration)
--text: #1E2230
```

## Typography (multi-script, Devanagari-first — non-negotiable)
Every font must render Hindi (Devanagari) + Latin beautifully at small sizes.
- **Display/headlines:** Anek (Anek Latin + Anek Devanagari)
- **Body/UI:** Hind or Mukta (engineered for Devanagari + Latin UI legibility)
- **Numerals/amounts/timestamps:** Spline Sans Mono or IBM Plex Mono (tabular figures, "ledger" feel)

Scale (mobile px): Display 28/34 · H1 22/28 · H2 18/24 · Body 16/24 · Small 14/20 · Micro 12/16. **Never below 14px for on-site content.** Homeowner app: one notch larger, lighter weight.

## Layout, spacing, components
- Base unit **4px**; scale 4/8/12/16/24/32/48.
- **Tap targets ≥ 48×48px everywhere** (gloves, sun, older owners) — not optional.
- Radius: Site 8px cards / 12px sheets (squared, engineered); Homeowner 16px (soft).
- Elevation: Site = hairline + subtle shadow (flat blueprint); Homeowner = soft diffuse.
- Reusable kit: `EvidenceCard`, `CaptureBar` (big 📷 + 🎙 hold-to-talk), `BriefCommandCard` (≤3 risks, exceptions-first, inline Approve/Hold/Assign), `ClarificationChip` (one-line + 2–3 tap answers), `StatusPill`, `SiteSwitcher` (context header), `ApprovalRow`, `TimelineItem`.

## Motion
- Site: fast/confident (120–200ms). Signature: "Show proof" quick reveal; brief cards stagger in (~40ms) on load.
- Homeowner: calm (200–320ms); milestone-complete = small celebration, used sparingly.
- Respect `prefers-reduced-motion`; never delay reading critical data with animation.

## Accessibility & field conditions (first-class)
- Contrast ≥ 4.5:1; status = color + icon, never color alone.
- Sunlight max-contrast toggle on Site app.
- Voice-first paths for every supervisor/mukadam action; icon+label (never icon-only) for critical actions.
- Offline-tolerant capture: queue photos/voice, never lose data, show sync status, optimistic UI.
- Hindi/Hinglish first, regional by geography; show the user THEIR words back, never our jargon.
- ₹ + lakh/crore + Indian digit grouping for money.

## Anti-slop guardrails — do NOT
- ❌ Inter / Roboto / system-font defaults (use Anek + Hind)
- ❌ Purple→blue gradient on white (the AI cliché)
- ❌ A dashboard that opens to a spreadsheet grid
- ❌ Icon-only critical buttons for low-literacy users
- ❌ Color-only status
- ❌ 12-field "create site" forms (ask name + type, learn the rest)
- ❌ Clinical pure-white Site surfaces (use warm --paper)

## When building UI
1. Pick the surface → pick the theme. Contractor web = **Blueprint Light/Dark** (`data-theme="light"|"dark"`); homeowner = **Daylight**. Bind components to **semantic role tokens**, never raw hex.
2. Reach for the existing component kit before inventing.
3. Make evidence reachable in one tap on any data point.
4. Default inputs to photo/voice for field roles.
5. Verify against the accessibility checklist in `07-Design/09 - Accessibility and Localization.md` — and for the web, contrast must pass in **both** modes.
6. **Contractor web:** the authority is `11-Contractor-Web-Experience/` (light+dark tokens, IA/shell, screens, frontend architecture, component library, setup/admin, build plan). It's a **control plane, not a widened phone** (master-detail, dense grids, ⌘K command palette, keyboard-first, full setup/admin). Honor: no fake `%`-complete ring (time-bar + `SiteBaseline` variance), payments **tracking-only** (no rail), amber-as-fill-only. The existing `web/` still uses default Tailwind in places — migrate toward these tokens when touching it (W0 of the build plan adopts the token system first).
