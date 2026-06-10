# Constructo — Owner & Crew Design System Brief (for Claude Design)

> Paste this whole document into Claude Design. It is the written brief to design a **fresh, comprehensive design system for the contractor side of Constructo — the Owner and their crew** — the same way the homeowner "Calm Cockpit" system was designed from a brief. Explore directions, then lock one.

---

## 0 · The one instruction (read first)

You are designing the visual + interaction system for the **people who run a construction company and build the house** — the Owner and their crew — across **two surfaces**: a **web control plane** (desk work) and a **mobile field app** (on-site).

- **DO evolve from the aesthetic we already love** — our **"Blueprint" web design** (warm paper + ink + safety-amber, light **and** dark, semantic tokens, ledger-grade mono numerals, evidence-first and calm). Its DNA is described in §5 and is the anchor.
- **DO NOT inherit our current *mobile* contractor design** — we don't like it; ignore it entirely. Rethink the mobile field app from scratch in the Blueprint language.
- **This is a sibling to, not a copy of, the homeowner "Calm Cockpit" system.** Different human, opposite job (see §4 and §9). Shared philosophy (honest, evidence-first, no fake progress, Devanagari-first, status = colour + icon + word); different feel (homeowner = calm reassurance; contractor = a fast, dense, trustworthy power tool).

Produce: directions to choose from, then a locked system — tokens (light+dark), type, components, motion, and the signature moments. Cover **both** the web console and the field mobile app as one coherent language.

---

## 1 · The product

**Constructo** turns the chaos a construction team already creates on WhatsApp (photos, voice notes, "bhej do", challans, "kitne log aaye") into **one trustworthy source of truth**, and gives each person their slice. There is a **homeowner** side (a separate, calm app — out of scope here) and this **contractor** side: the company that actually builds the house.

**The contractor-side AI posture is ACCELERATOR** (the homeowner's is "translator behind glass / reassure"). The loop is **CAPTURE → STRUCTURE → SURFACE → ACT**:
- **Capture** — field reality (voice, photo, a number) goes in with near-zero friction.
- **Structure** — AI extracts/classifies it (headcount, materials, money, risks) into an append-only record.
- **Surface** — the system ranks the few things that actually need a human, with the evidence attached.
- **Act** — the owner commits **decisions-from-evidence** in seconds.

**The two wins the design must serve:**
1. **Owner win:** the owner opens the console (or phone) at 7am and **commits 2–3 decisions-from-evidence before 7:15am** — each a ranked exception with its proof and a one-tap action (Approve ₹ / Hold / Assign / Propose).
2. **Field win:** a supervisor/mukadam capture is **point-shoot-done** — hold-to-talk or a photo, confirm, gone. No forms.

**Money is tracking-only** (no payment rail in the product) — we record and reconcile ₹ flows (homeowner→contractor, contractor→supplier), we never move money.

---

## 2 · Who it's for (the roles)

One company, many hats. The system is **role-aware and capability-gated** (RBAC) — what you can *do* (approve money, send a report, change a role) depends on your role, and the UI shows only what you may act on.

| Role | Where | Who they are | Their job in the app |
|---|---|---|---|
| **Owner** | Web (primary) + mobile | The boss. Time-poor, decisive, money-accountable. Often older, often Hindi-comfortable, glances on the phone between sites. | Approve/Hold/Assign the few exceptions that need money or judgment; see the portfolio worst-first; read the week's cash in/out. **Only the owner approves money.** |
| **PM / Site Engineer** | Web + mobile | Runs day-to-day across sites. | Review & **send** the auto-drafted Daily Progress Report; triage operational exceptions; **propose** money decisions to the owner (never approves). |
| **Accountant** | Web (desk) | Back-office, exceptions-first, long indoor sessions (month-close at night). | **Reconciliation cockpit** — match challans↔invoices↔payments, flag mismatches, export to Tally. Read-only on operations; tracking-only on money. |
| **Procurement** (a *hat*, usually PM/supervisor) | Web + mobile | Buys materials. | Raise/track material asks and GRNs. (Supplier portal is later.) |
| **Supervisor** | Mobile (on-site) | On the site, all day, hands dirty, phone in pocket, glare + noise + gloves. Often Hindi-first, variable literacy. | **Capture** the day: headcount, work done, a problem — by voice/photo. Raise asks. Point-shoot-done. |
| **Mukadam** (labour lead) | Mobile (on-site) | Lowest digital literacy. Manages the crew. | The *simplest possible* capture — one big "talk" button, a photo, a number. Must work for someone who barely uses apps. |
| **Designer / Construction-Engineer** | Web (later) | First-class role (planned). | Publish/version drawings, answer design questions. |

> **Two very different humans share one system:** the **desk power-user** (Owner/Accountant/PM at a keyboard, wants density, speed, ⌘K, dark mode for long sessions) and the **field worker** (Supervisor/Mukadam on a phone in the sun, wants ONE obvious action, big targets, voice-first, Hindi). The design must serve both without feeling like two products.

---

## 3 · The two surfaces

**A. Web console — the control plane (desk).** Owner + back-office deep work and all company setup/admin. This is where the *liked* Blueprint already lives. It is a **keyboard-first power tool**: a command palette (⌘K), dense virtualized data grids, a reconciliation cockpit you scan with ↑/↓/j/k, master-detail panes, light **and** dark mode. Think Linear / Ramp / a really good ledger — not generic SaaS.

**B. Field mobile app — capture & act on-site.** Supervisor/mukadam capture; PM/owner glance-and-decide on the go. **This is the surface we're rethinking from scratch.** It must be voice/photo-first, huge tap targets, glove- and glare-friendly, Hindi-first, and carry the same Blueprint soul as the web (paper + ink + amber, ledger numerals, evidence-first) — but sized and paced for a thumb on a noisy site.

One design language, two ergonomics. A number on the web grid and a number on the field card should feel like the same product.

---

## 4 · The thesis (what the *feel* must encode)

The contractor side is a **trustworthy accelerator**, not a calm companion. Its emotional job is **confidence and speed under load**:

- **Evidence-first.** Every claim, number, and risk is one tap from its proof (the challan photo, the voice note, the headcount log). Trust is earned by showing the receipt, never by asserting.
- **Decisions, not dashboards.** Lead with the *few* things that need a human, ranked worst-first, each with a one-tap action. Hide the noise. A screen full of charts is a failure.
- **Calm density.** Power users want a lot on screen — but it must read as a **clean ledger / drawing set / site diary**, never a cluttered enterprise console. Density without anxiety.
- **Honest AI.** AI drafts; humans send. Confidence is shown (a meter), low-confidence blocks the share until a human confirms. Never auto-sends, never invents site data.
- **Authority is visible and respected.** Money is the owner's alone; everyone else *proposes*. The UI never offers an action you can't take — it offers "Propose to owner →" instead.

---

## 5 · The aesthetic anchor — "Blueprint" (evolve THIS)

This is the design we like. **Keep its soul; make it a complete, senior-grade system across both surfaces and both modes.**

### 5.1 What is sacred (non-negotiable — changing these changes the brand)
- **Ink + safety-amber + warm paper.** Warm off-white paper canvas (`#F7F5F0`) — *never clinical white*. Near-black warm ink for chrome/text. **`#F2A100` safety-amber is THE single primary-action colour** (one accent, used sparingly — the CTA, active nav, the brief accent). "The record you can read in the sun."
- **The status spine is a language, learned once, identical everywhere:** `ok #1E9E5A` · `warn #E8A317` · `risk #E5484D` · `info #3B7DD8`. Tune per mode for contrast, never re-hue. **Status is always colour + a distinct icon/shape + a word — never colour alone.**
- **Mono tabular numerals for ALL money / quantities / timestamps** (Spline Sans Mono, `tabular-nums`, right-aligned) — the "ledger feel". Amounts line up like an account book. ₹ uses **Indian digit grouping** (`₹1,20,000`).
- **Evidence-first, calm, no decoration.** Hairline borders and flat "blueprint" elevation (not floaty cards), an **engineered 8px radius** (squared, not pillowy), a faint **blueprint-grid motif on empty canvases only**. No gradients, no glassmorphism, no purple→blue "AI" cliché.

### 5.2 Light + dark are both first-class
- **Light = brand-primary** (the paper-and-amber daytime surface, default on fresh install).
- **Dark = a real companion** for long indoor sessions (the accountant at month-close, night work) — OLED-friendly, glare-free. **Not** dark-only (paper is the brand soul). Amber **lifts** in dark (`#F2A100` → `#FFB72E`) to avoid halation; same meaning.
- Built on **three-tier semantic tokens** (primitive → role → component): components bind to roles (`--surface`, `--brand`, `--text-primary`, `--divider`, `--ring`…), and a theme switch only redefines the primitives. Below are the locked role values.

### 5.3 The token palette (the values to evolve from)

**Light (the default):**
```
surface(canvas) #F7F5F0   surface-card #FFFFFF   surface-sunken #F1EEE6   surface-hover #F1EEE6
surface-selected amber@15%   text-primary #15171C   text-secondary #4A4E57   text-muted #6B6F78
border #C4BEB1   border-strong #9A9486   divider(grid hairline) #D9D4C8
brand #F2A100   brand-hover #D98C00   brand-pressed #C77F00   brand-subtle #FCE8BF
brand-text(amber-as-text) #5A3B00   focus-ring #A06600 (deep amber — amber rings fail 3:1 on paper)
ok #1E9E5A (tint #E4F5EC / text #0F6B3A)   warn #E8A317 (#FCF1D8 / #8A5A00)
risk #E5484D (#FCE7E8 / #B0282C)   info #3B7DD8 (#E4EEFB / #1F5BAE)
elevation: hairline shadows (flat, not floaty)
```

**Dark (the companion):**
```
surface #0E1014   surface-card #14171D   surface-elevated/overlay #1B1F27   surface-sunken #0B0D11   surface-hover #232831
text-primary #ECEEF1 (not pure white — halation)   text-secondary #A6ADB8   text-muted #7B828E
border #2C313B   border-strong #3A4150   divider #23272F
brand #FFB72E (lifted)   brand-hover #FFC54D   focus-ring #FFB72E
ok #3BC07A   warn #F2B638   risk #F26469   info #5C9CEE   (tints darkened to match)
elevation: luminance-lift hairline + faint shadow (shadows barely read on dark)
```

**Data-viz (categorical, colourblind-safe, never the CTA amber):** `#3B7DD8 · #D98C00 · #1E9E5A · #7A5AF8 · #B5651D`. Charts are rare — reserve them for one or two zones (cash sparkline), never decoration.

### 5.4 Type, shape, motion
- **Families (Devanagari-first — the crew reads Hindi):** display = **Anek** (Anek Latin + Anek Devanagari); body/UI = **Hind**; numerals/money/timestamps = **Spline Sans Mono** (tabular). Every face must render Devanagari at all sizes.
- **Type scale:** the web is a desk — needs a **desktop tier** (a brief headline and a 48px-tall dense grid row need different sizes) layered over the mobile scale. Engineered, tight, legible; the mono numeral is a co-lead with the body sans.
- **Radius:** **8px** cards / 12px sheets / pill for chips. Squared and engineered (contrast this with the homeowner's pillowy 22px).
- **Elevation:** light = hairline shadows; dark = luminance-lift borders. Flat, honest, never glassy.
- **Motion:** calm and instant — no FOUC on theme switch, fast transitions, respects reduced-motion. Power tools feel quick, not animated.

---

## 6 · Hard constraints / invariants (non-negotiable)

1. **No fake progress.** Never a "% complete" ring/bar. Progress reads as **stage + variance** against a learned baseline (e.g. "Brickwork · 2 days behind expected"), or a time-bar — never an invented percentage.
2. **Money is tracking-only.** Show, reconcile, export ₹ — never a "Pay" button or payment rail. Owner-only approval; everyone else **proposes**.
3. **Capability-gated everywhere.** The UI shows only actions the role may take. A non-owner on a money item sees **"Propose to owner →"**, never "Approve". Batch/destructive/admin actions gate by role.
4. **Status = colour + icon + word**, always. Never colour alone (accessibility + glance-speed).
5. **Evidence on tap.** Every number/claim/risk expands to its proof (photo / challan / voice / log). An append-only record — entries are versioned/superseded, never silently edited.
6. **Honest AI.** AI output is a **draft** with a visible confidence; a human sends. Low confidence blocks the one-tap share until confirmed. Never auto-send; never fabricate.
7. **Devanagari-first & bilingual.** EN + HI as first-class; the field crew is often Hindi-first with low literacy. Numbers/₹/dates stay numeric (Indian grouping); never let translation alter a digit.
8. **Accessibility — WCAG 2.2 AA in BOTH modes.** ≥4.5:1 body / ≥3:1 large + icons + focus rings; visible focus ring (the deep-amber/lifted-amber `--ring`, not the CTA amber); ≥44–48px tap targets on mobile (≥48 for field capture); high-contrast as an *orthogonal* axis layered on either mode.
9. **On-site reality (mobile).** Glare, gloves, noise, one-handed, patchy connectivity → big targets, voice/photo before forms, optimistic + offline-tolerant capture (queue + sync state), never a blocking "no internet" wall.

---

## 7 · What the design must DO (signature surfaces)

Design these as the proof the system works (web unless noted):

- **Owner Command Center** — 3 columns: **Needs You** (≤3 ranked exception cards, each with proof + a capability-gated one-tap action and ₹ on money kinds) · **Portfolio** (sites worst-first, stage+variance, never %) · **This Week** (real ₹ cash in/out, the one sparkline zone, approvals pending, CSV/Tally export). The 7:15am win.
- **Reconciliation Cockpit** (accountant) — a dense, **keyboard-scanned** queue (↑/↓/j/k, Enter to open) with a master-detail proof strip (challan photo ↔ invoice PDF side-by-side), mismatch flags, and a gated Tally export (step-up OTP on sensitive export). The dark-mode hero surface.
- **Command palette (⌘K)** — capability-filtered, the power-user spine of the web.
- **DPR review** (PM) — the AI-drafted Daily Progress Report with a **confidence meter**; **Send is the only share path**, low-confidence blocks until confirm.
- **Field capture (mobile)** — the supervisor/mukadam home: one giant **hold-to-talk** + **camera**, a confirm card, done. The mukadam variant must work for near-zero digital literacy. Offline-first.
- **Admin / setup control plane** (web) — company, team & roles, vendors, materials, baselines, notifications/SLA, billing (tracking-only) — sectioned, owner-gated, RHF-grade forms, honest "coming soon" for unbuilt sections (never dead inputs).
- **Core components** to specify (light+dark, both surfaces): Button (one amber primary), StatusPill (colour+icon+word), DataGrid row, EvidenceCard / proof strip, BriefCommandCard (the ranked exception + action), ConfidenceMeter, Mono money cell, CommandPalette, SiteSwitcher, NotificationsPanel (bell), empty/quiet states (blueprint-grid motif).

---

## 8 · The anti-slop list (do NOT)

- ❌ Generic SaaS / Material-default look; purple→blue "AI" gradients; glassmorphism; floaty drop-shadow cards.
- ❌ A **second** accent colour competing with the amber (amber is the one primary).
- ❌ Pure clinical white canvas (use warm paper); pure `#FFF` text on dark (halation).
- ❌ **% complete** rings/bars anywhere.
- ❌ Dashboards-of-charts as a homepage; decoration data-viz.
- ❌ Colour-only status; icon-only critical actions.
- ❌ A "Pay"/payment rail; offering an action the role can't take.
- ❌ Forms-first field capture; tiny tap targets; English-only chrome.
- ❌ Making it feel like the *homeowner* app — this is a power tool, not a calm companion (see §9).

---

## 9 · Relationship to the homeowner "Calm Cockpit" (sibling, not twin)

Constructo's two sides share a **philosophy** but deliberately diverge in **feel**. Hold both in mind so the contractor system reads as the confident, ledger-grade sibling:

| | Homeowner ("Calm Cockpit") | **Contractor ("Blueprint") — what you're designing** |
|---|---|---|
| Human | Anxious non-resident homeowner, opens rarely | Owner + crew, power users + field workers, live in it daily |
| AI posture | Translator behind glass — **reassure**, earned absence | **Accelerator** — capture→structure→surface→act |
| Emotional job | "You're okay." Calm. | "Here's the receipt — decide." Confident, fast. |
| Canvas | Warm **sand**, sage-green primary | Warm **paper**, **safety-amber** primary, **+ dark mode** |
| Headlines | **Eczar serif** (editorial, soft) | **Anek** sans (engineered, tight) |
| Density / radius | Spacious, pillowy 22px, one thing at a time | Dense ledger, engineered **8px**, many things ranked |
| Shared | Evidence-on-tap · status = colour+icon+word · no fake % · Devanagari-first · mono ₹ Indian-grouped · honest AI · WCAG 2.2 AA |

Same family, opposite ergonomics. Don't borrow the homeowner's calm spaciousness — borrow only the shared honesty principles.

---

## 10 · Deliverables (what to produce)

1. **2–3 directions** that all honour §5's sacred DNA, then a **single locked system**.
2. **Tokens** — three-tier (primitive → role → component), **light + dark** value sets, the status spine, data-viz set.
3. **Type system** — families (Anek / Hind / Spline Sans Mono), a mobile + desktop scale, the mono-numeral treatment.
4. **Shape / elevation / motion** — radii, light-vs-dark elevation, calm/instant motion, reduced-motion.
5. **Component library** — the §7 components, in both modes and both ergonomics (web dense + mobile field), each with states (default/hover/focus/selected/disabled) and the capability-gated variants.
6. **The signature surfaces** rendered (Owner Command Center, Reconciliation Cockpit, Field Capture) as proof.
7. **Iconography** — one line-icon set, status icons paired to the spine, no emoji in chrome.
8. **Voice/content note** — terse, evidence-first, numbers-earn-their-place; Hindi + English; the ledger tone (not the homeowner's warm-letter tone).

Keep the soul (paper + ink + amber, ledger numerals, evidence-first, light+dark); make it a complete, senior-grade system for the people who build the house.
