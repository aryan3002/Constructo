# Fresh brief: a mobile app + design system for a construction company's team

> Blank-slate prompt for Claude Design. Mentions no existing design system and prescribes no palette/type/aesthetic — only the product, its people, and its hard truths. Paste it whole.

---

You're designing, from a **blank slate**, the **visual design system and the key screens** for a mobile app used by the people who **run a construction company and physically build houses in India** — the owner and their on-site crew. Bring your own design point of view: invent the palette, typography, density, shape, motion, iconography, and the signature moments. **Don't default to generic SaaS or Material** — give this a distinct, considered identity that fits its people and their world. Explore **2–3 directions**, then lock one and show it on the key screens.

## The product

The app turns the chaos a construction team already makes on WhatsApp — site photos, voice notes, "how many workers came", delivery slips, "send it over" — into **one trustworthy record**, and gives each person their slice. The intelligence works as an **accelerator**: it **captures** field reality with near-zero friction, **structures** it (headcount, materials, money, risks) into a permanent record, **surfaces** the few things that actually need a human (ranked, with the proof attached), and lets them **act** in seconds. It's a fast, trustworthy power tool — **not a passive dashboard**.

(A separate, calmer app exists for the homeowner watching their house get built — out of scope. This is the **professional builder side**: a more intense, daily-driver audience.)

## Who it's for — two very different humans, one app

One company, many roles, each with a different job and a different relationship to a phone:

- **Owner** — the boss. Time-poor, decisive, money-accountable; often older, Hindi-comfortable; glances between sites. Makes the few money/judgment calls. **Only the owner approves money.**
- **PM / site engineer** — runs the day across sites; reviews and sends reports; **proposes** money decisions to the owner, never approves.
- **Accountant** — back-office; matches delivery slips ↔ invoices ↔ payments, flags mismatches; long focused sessions.
- **Supervisor** — on the site all day, phone in pocket, sun, dust, gloves, noise; often **Hindi-first, variable literacy**. Logs the day by voice/photo.
- **Mukadam (labour lead)** — the **lowest digital literacy**; needs the simplest possible interaction.
- (+ procurement as a hat, a designer role later.)

**The hard tension to solve:** the same product must serve a **power-user moving fast** (wants a lot of information, quickly, decisively) AND a **field worker in the sun with low literacy** (wants ONE obvious thing to do — big, voice-first, in Hindi) — and still feel like **one coherent product**.

## The two moments that must feel great

1. **Decide** — the owner (or PM) opens the app and, in under a minute, clears the 2–3 things that genuinely need them: each a ranked exception with its evidence and a single confident action.
2. **Capture** — a supervisor/mukadam logs the day in seconds: hold-to-talk or a photo, confirm what the AI heard, done. **No forms.**

## Hard truths the design must honour (these are about the product, not the look)

- **Never fake precision.** No invented "% complete" rings or bars. Progress must be honest — a position in time, or a stage with how far **ahead/behind** it runs versus what's expected. If a number isn't known, say so; never fabricate one.
- **Evidence on tap.** Every claim, number, and risk is **one touch from its proof** — the photo, the delivery slip, the voice note, the headcount log. Trust is *shown*, never asserted. The record is append-only — corrections are visible, never silent edits.
- **Money is tracking-only.** The app **records and reconciles** rupee flows; it never moves money (no "Pay" button). Amounts are first-class and must be instantly scannable and trustworthy (**Indian digit grouping**, e.g. ₹1,20,000). Approving money is the **owner's alone**; everyone else **proposes** — the interface must **never offer an action a person isn't allowed to take**.
- **Honest AI.** The AI **drafts**; a human **sends**. Its confidence is visible; low confidence **holds** the action until a person confirms. It never auto-sends and never invents site data.
- **Status must be unmistakable at a glance** — legible to colourblind users and in harsh glare. A status is **never carried by colour alone**.
- **Hindi-first and bilingual.** Much of the crew reads **Devanagari** and has low literacy. Hindi and English are both first-class; the typography must render Devanagari beautifully at every size; numbers/dates/₹ stay numeric and never get "translated".
- **Built for the site, not just the desk.** Outdoor glare, gloves, one hand, noise, patchy signal → **big targets, voice/photo before typing, works offline** (captures queue and sync), never a blocking "no internet" wall.
- **Accessible** (WCAG 2.2 AA): strong contrast, visible focus, generous touch targets.

## What to design

A complete system — **palette, type, spacing/shape, elevation, motion, iconography**, and a **component kit** (the primary action, the status indicator, an evidence/proof card, a ranked "this needs you" card, a money/number cell, the capture controls, empty/quiet states) — then these key screens to prove it:

1. **Supervisor field capture** (Hindi-first) — the voice/photo-first home; the AI-extracted confirm card.
2. **Owner "needs you"** — the ranked exception cards with one-tap, evidence-backed actions (and the owner-only money action).
3. **PM "today"** — role-aware (propose vs. approve) per-site briefs + an AI-drafted report to review and send.
4. **Mukadam capture** — the simplest possible variant for near-zero literacy.
5. *(Optional, if it strengthens the system)* a reconcile / exceptions view.

## Your job

Give this app a **visual identity with a real point of view** — one that feels right for Indian builders and their crews: trustworthy, fast, grounded, made-for-the-field, and unmistakably **not** generic enterprise software. Decide the mood (Is it a tool? a record? a site companion?), the palette, the type, the density philosophy, and **one or two signature moments** that make it memorable and reassuring-yet-decisive. Show me **2–3 distinct directions**, then a single **locked system** rendered on the screens above.
