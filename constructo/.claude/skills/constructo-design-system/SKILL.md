---
name: constructo-design-system
description: The locked visual language and UX principles for Constructo — the AI-native construction-management product for India SMB contractors. Use this skill WHENEVER building, designing, styling, or reviewing ANY Constructo UI — the React web dashboard, Android app screens, components, the WhatsApp bot's message formatting, or the homeowner app — even if the user just says "build the dashboard", "add a screen", "style this", or "make a component". It encodes the color tokens, typography, components, motion, and accessibility rules so every screen stays on-brand instead of defaulting to generic SaaS. Trigger on any frontend/UI/screen/component/styling work in this repo.
---

# Constructo Design System — "Blueprint & Daylight"

Apply this to every Constructo interface. Full design docs live in the product vault under `07-Design/` (Principles, Design System, IA, Auth, Role Flows, WhatsApp Bot, Core Flows, Homeowner, Notifications, Accessibility). This skill is the working summary — read it before writing UI code, and follow the vault docs for screen-level detail.

## The product in one line
Turn the chaos a construction team already creates on WhatsApp into one trustworthy source of operational truth, and hand each role exactly their slice — in the language and format they already use (Hindi-first, voice/photo-first, evidence-on-tap).

## Three surfaces, three temperatures
- **WhatsApp bot** — capture & query. Invisible, polite, one-tap, Hindi/Hinglish. No rich UI; format with text, lists, emoji, document sends.
- **Contractor app + web** — review, decide, act. Confident, grounded, evidence-dense. Theme: **Site / "Blueprint."**
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

**Site theme (contractor app + web):**
```
--ink: #15171C   --ink-2: #22262E    (dark chrome / text on light)
--paper: #F7F5F0  --paper-2: #FFFFFF  (warm off-white surfaces, NOT clinical white)
--line: #D9D4C8                        (hairlines / blueprint grid)
--amber: #F2A100  --amber-deep: #C77F00 (PRIMARY action/brand — hi-vis, sunlight-readable)
--text: #15171C   --text-mute: #6B6F78
```

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
1. Pick the surface → pick the theme (Site vs Daylight) → set `data-theme`.
2. Reach for the existing component kit before inventing.
3. Make evidence reachable in one tap on any data point.
4. Default inputs to photo/voice for field roles.
5. Verify against the accessibility checklist in `07-Design/09 - Accessibility and Localization.md`.
6. The existing React dashboard (this repo's `web/`) currently uses default Tailwind — when touching it, migrate toward these tokens.
