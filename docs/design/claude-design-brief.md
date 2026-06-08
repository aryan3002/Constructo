# Constructo — Product & Brand Brief for Claude Design

*Paste this into Claude Design's design-system setup (or Remix chat) to have it **create a fresh design system** from scratch. Pin the HARD CONSTRAINTS; everything aesthetic is Claude's to invent.*

---

Create a design system for this product. I want you to **design the visual language yourself** — I'm not importing an existing one. Honor the hard constraints below; treat everything under "OPEN" as yours to explore. Show me a couple of directions before committing.

**The product (one line):** Constructo turns the chaos a construction team already creates on WhatsApp into one trustworthy source of truth, and gives each person their slice. **This design system is for the HOMEOWNER app** — used by an Indian family while their house is being built. (A sibling "contractor" theme will be designed separately.)

**Who uses it:** An anxious, often non-resident homeowner ("Priya") building the largest purchase of her life through a builder she only half-trusts, in a process and language she only partly understands. Often **Hindi-first**, sometimes low digital literacy, frequently older, usually on her phone and on the move. Not a power user — for her, **reading is the failure mode.**

**The one job / the feeling — REASSURE.** She opens the app, learns *"you're okay — nothing needs you today,"* and closes it calm. Success is **earned absence**, not engagement — no streaks, no badges, no dwell-time goals. Everything exists to answer **"Am I okay?" in 3 seconds** and to defuse four anxieties: **Silence** (no news), **Jargon** (a word she can't parse), **Money** (an unexpected number), **Decision** (a choice with no context). Tone: a calm, warm, honest, trusted person — **never** enterprise software, **never** a construction-industry tool. Premium and residential, not industrial.

**HARD CONSTRAINTS — design AROUND these; do not break them:**
- **Multi-script, Devanagari-first.** Every typeface must render Hindi (Devanagari) + Latin beautifully at small sizes. The app ships **single-language per screen** (English OR Hindi, user-selectable) — never both on one screen.
- **No fake progress.** NEVER a percentage or progress ring ("63% done"). Show position in **time** (a Start → Handover timeline with a "you-are-here" marker) — a frozen % manufactures the very anxiety we remove.
- **Real photos only.** Never AI-generated or 3D renders of the house — only real photos a human took. Design the photo/gallery/hero components around real imagery.
- **Status = color + icon + word**, never color alone (sunlight, colorblind, low-literacy). Reserve **red for genuine delay/risk only** — never decorative.
- **Voice & photo before forms.** Default capture inputs = a big photo button + hold-to-talk; typing is the last resort.
- **Money:** ₹ Indian-grouped (₹1,20,000), tabular/mono numerals.
- **Accessibility:** ≥48px tap targets, ≥4.5:1 contrast, legible type (never below 14px), respects reduced-motion.

**OPEN — your call; explore freely and show me options:**
- The whole **palette** and overall mood (warm/cool/editorial/minimal — surprise me, but it must read calm, reassuring, and premium; residential, not industrial).
- **Type** families (within the Devanagari-first rule), scale, and personality.
- **Component shapes**, radius, elevation/shadow language, iconography.
- **Motion** language (calm, not urgent).
- The **navigation/shell** feel.
- A **signature element** that makes this app unmistakably itself.

**ANTI-SLOP — avoid these defaults:**
- ❌ Generic Inter/Roboto/system-font blandness.
- ❌ Purple→blue AI gradients on white (the AI cliché).
- ❌ A dashboard that opens to a spreadsheet/grid.
- ❌ Safety-orange / construction-yellow industrial styling.
- ❌ Clinical pure-white surfaces; gamified streaks/badges.

**What I want back:**
1. **Two distinct design directions** — each with a mood, palette, type pairing, and a sample **Home screen** (the "Am I okay?" screen).
2. After I pick one, the **full design system**: color tokens, type scale, spacing + radius, elevation, motion, and a **core component kit** — card, status pill, a **time-bar progress** component (not a ring), an **evidence / "show proof"** card, photo tile, bottom navigation, primary/secondary buttons, and a calm **empty/quiet state**.
3. Then **publish** it so every new screen I create inherits it.

---

## A first screen to validate the system (paste as your first prototype, High fidelity · Mobile)

> Design the **HOME** screen of Constructo — the calm homeowner app above. It answers "Am I okay?" in 3 seconds. A real photo of a half-built house up top with a warm greeting ("Good morning, Priya") and a single status chip ("On track · ~Nov 2026"). Below it: a status card with a **time-bar** (Started Jan 2026 ●——◇— ~Handover Nov 2026, with a you-are-here dot — NOT a percentage) and one plain-language status sentence; a row of glanceable shortcut tiles (Next up · Photos · This week · Changes ₹2,40,000); a "Latest from site" photo strip; and a warm "weekly summary" card. A clean bottom navigation (Home · Photos · Updates · Design) and a floating "Ask" action. Use the design system you just created. Calm, warm, premium — no percentages, real photos only.

## Language modes (prepend as the FIRST line of any screen prompt)
- **English:** `Render ALL on-screen text in ENGLISH ONLY. No Hindi/Devanagari anywhere.`
- **Hindi:** `Render ALL on-screen text in HINDI (Devanagari) ONLY — translate the UI + nav (Home→होम, Photos→तस्वीरें, Updates→अपडेट, Design→डिज़ाइन); use English only for names, "Constructo", and numbers/₹/OTP/PDF.`
