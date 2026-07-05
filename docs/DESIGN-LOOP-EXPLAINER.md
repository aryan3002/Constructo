# The Neev Design Loop — The Complete Story

*A plain-language explainer of the Homeowner Design experience: what it is, how it works, what was broken, and what we're building. Written 5 July 2026. Share freely — no code knowledge needed until the appendix.*

---

## 1. What is this, in one paragraph?

When a family builds or renovates a home in India today, "what should it look like?" lives in a WhatsApp jumble: screenshots, Pinterest links, arguments between spouses, a designer guessing, and a contractor pricing materials off half-remembered conversations. The **Design Loop** replaces that jumble with one guided path inside Neev: the family collects and rates inspiration images → the AI reads their taste and proposes design directions → the family decides → a structured **Design Brief** is generated in three "languages" (one for the family, one for the designer, one for the contractor) → the designer reviews and signs off → the family approves → the brief turns into concrete **material selections** the contractor can price and buy. Every step is attributed to a named person, and the AI never decides anything — it only proposes.

## 2. The cast — who's in the loop

| Person | In the app | What they do in the loop |
|---|---|---|
| **Homeowner (owner / co-owner)** | Homeowner app, Design tab | Adds inspiration, rates images, answers the AI's questions, settles taste disagreements, approves themes and the brief. Only owners can approve — that's a money-safety rule. |
| **Family members / advisors** | Homeowner app | Can contribute inspiration and opinions, can see everything — but cannot approve. The app tells them so politely. |
| **The Designer** | The architect app + web `/designer` cockpit | Reviews the brief, reads the family's answers and conflicts, asks for changes or **signs off**. Sign-off is mandatory — no brief reaches pricing without a designer's name on it. |
| **The Contractor** | Contractor surfaces + web | Receives the approved brief, turns it into material specs ("materialize"), routes each selection back to the owner for final approval, then buys and builds. |
| **The AI** | Behind the scenes | Reads images, computes taste **with math, not vibes**, proposes themes and clarifying questions, writes the brief prose. It proposes; humans commit. |

## 3. How the loop works, step by step

Think of it as a relay race where the baton is the family's taste, getting more concrete at every handoff:

**Step 1 — Collect.** The homeowner opens an area (kitchen, living room, pooja room…) and adds inspiration three ways: **upload a photo**, **paste a Pinterest link** (we fetch the image and store our own copy — the link can die later, the taste survives), or **pick from preset packs** (curated starter images for people with no Pinterest and no photos — rate 10 picks and you have a taste profile in a minute).

**Step 2 — Rate.** Each image gets 1–5 stars and quick tags ("love the colours", "too dark"). Both spouses rate independently — disagreement is data, not a problem.

**Step 3 — The machine reads taste.** A vision model extracts what's *in* each image (materials, colours, lighting, density). Then pure math — no AI opinion — combines the ratings and attributes into a **taste model** per area, with a confidence score and, crucially, **conflict detection**: if one owner consistently loves dark wood and the other keeps one-starring it, the system flags it honestly instead of averaging it away.

**Step 4 — The AI proposes, the family disposes.** Once an area has enough ratings, the engine automatically proposes 1–3 **themes** ("Warm Minimal — light oak, ivory, matte") and asks **clarifying questions** where confidence is low ("Matte or glossy cabinets?"). The family approves/adjusts/rejects themes, answers questions, and settles conflicts — accept the AI's suggested middle ground, pick a side, write their own compromise, or hand the call to the designer.

**Step 5 — The Brief.** On demand ("Get my brief"), the engine assembles everything *approved* into a versioned Design Brief with three renderings: **You** (warm, readable — "here's your home's direction"), **Designer-ready** (design intent, room priorities, open questions), and **Contractor-ready** (finish expectations, material families, cost flags). The numbers and material lists come from the deterministic payload; the AI only writes the prose around them.

**Step 6 — The handshake.** The owner sends the brief to the designer → the designer reviews (with full sight of the family's answers and settled conflicts) → either **requests changes** (with a note; the family adjusts and regenerates a new version) or **signs off** → the owner gives final approval → state: approved.

**Step 7 — The payoff.** The contractor hits **Materialize**: the brief becomes pending material specs (real catalog rows — "Kitchen counter: quartz, light family"). Each routed spec lands in the owner's existing decisions inbox for final yes/no. What began as saved screenshots ends as priced, approved materials. The brief locks.

**Every handoff pings the right person** — a bell-inbox entry and a push notification that deep-links straight to the screen where their move is waiting. The Design tab always answers one question at a glance: *whose move is it?*

## 4. The three principles under everything

**1. Determinism — AI proposes, humans commit.** Confidence scores, counts, conflicts, and material lists always come from arithmetic over the family's own ratings. The LLM narrates and suggests; it never invents a number, never approves anything, never spends a rupee. If the AI is wrong, a named human hasn't committed to it yet.

**2. The membrane — authority follows the money.** Anyone in the household can contribute; only owners/co-owners can commit (themes, conflicts, brief, materials). The designer signs off design; the owner approves spend. Every decision row records who, as what role, when. And a stranger from another company doesn't get a "forbidden" error — they get a 404, as if the thing doesn't exist.

**3. Calm honesty.** No red alarms, no fake progress. Disagreement is "Your styles differ — settle it together", not a warning triangle. If something is coming later, the button says so. If a Pinterest link is dead, the error says "copy a fresh link from an open pin", not "error 422".

## 5. What the audit found (July 5, 2026) — honest version

We audited the entire experience with four parallel deep-dives (mobile screens, backend engine, designer surfaces, original specs). The verdict: **the engine is genuinely good — and the loop physically could not run in production.** Four structural breaks:

1. **No ignition.** The endpoints that generate themes, questions, and briefs existed — but *no button anywhere called them*. Every theme you'd ever seen came from a demo script. A real family could rate 50 images and nothing would ever happen.
2. **No signals.** Zero notifications anywhere. Family sends a brief → designer would only find out by opening the app and checking. Designer signs off → family never told.
3. **No sign-off surface.** The state machine *requires* designer sign-off before owner approval — and there was no sign-off button on any screen. Every sent brief was stuck forever.
4. **Wrong authority.** The spec says the family approves themes; the code only let contractor-side roles do it. The people the whole feature is for were locked out of its central decision.

Plus: **Pinterest was broken for everyone** — real Pinterest pages write their HTML attributes in the opposite order from what our parser expected, so *every real pin link failed*. **Presets were placeholder gradients** generated by a script, which is why they looked fake — they were. Two disconnected reference systems confused everyone. And after any approval, the app just said "Done" with no hint of what happens next.

## 6. What we're building — the seven-phase program

Each phase ships on its own; the app gets visibly better after every one.

| Phase | In one sentence | Status |
|---|---|---|
| **0 — Fix the basics** | Land the bug-fix pass: real photo uploads (was saving dead device paths), the Pinterest parser fix, honest counters. | ✅ **Merged (PR #243)** — Pinterest paste-a-pin works once deployed |
| **1 — Ignition & authority** | The engine fires itself (rate past the threshold → themes and questions appear automatically), owners get their decision rights, homeowners can start their own profile, stuck states get exits. | 🔨 **In progress now** |
| **2 — Signals** | Every handoff notifies the right person: bell inbox + push with deep links, owner-web activity rows, designer badges. | Planned, ready to build |
| **3 — Designer cockpit** | Sign-off and request-changes buttons (the mandatory missing step), the family's answers and conflicts visible where the designer decides, materialize on mobile. | Planned, ready to build |
| **4 — Homeowner completion** | Answer the AI's questions in-app, settle conflicts with a real sheet (accept / pick / compromise / "ask our designer"), approve themes, "whose move is it" banner, one-tap Pinterest paste, multi-link paste, board import, and the rate-10-picks quick start. | Planned, ready to build |
| **5 — One surface, visible payoff** | One inspiration surface everywhere (no more duplicate systems), and materialized selections appear in the family's Design tab: "Your brief became 8 material choices — 3 waiting on you." | Planned, ready to build |
| **6 — Prove it, ship it** | One command seeds a full demo world; we walk the whole loop on two phones before deploying to production. | Planned, ready to build |

## 7. The Pinterest story

- **Why it never worked:** our parser assumed `property="og:image" content="…"` order; real Pinterest emits `content` *first*. Every real pin silently failed. **Fixed and merged.** Stale short-links (pin.it codes that Pinterest redirects to its homepage) now get a human answer: "that link expired — copy a fresh one."
- **Making it effortless (Phase 4):** a **"Paste from Pinterest"** one-tap button (reads your clipboard only when you tap — no creepy auto-read), paste **several links at once** and watch them all land, and **board links** import their top pins without any Pinterest account connection (feature-flagged until proven stable — Pinterest can change its page internals anytime).
- **The real prize (in motion):** official Pinterest OAuth "connect your account, sync your boards." The build is small — the wait is Pinterest's app-review process. **Action for us: apply for Standard access now.** Everything is architected so OAuth drops in with zero schema change.

## 8. The presets story

Presets exist for the family member with no Pinterest, no screenshots, no time: **rate 10 designer picks, get a taste profile in a minute.** Today's presets are literally computer-generated colour gradients (placeholders by design). The plan makes them real:

- A **manifest + folder pipeline**: drop real photos into a folder, describe them in one JSON file, run one command — idempotent, safe to re-run forever.
- **Content**: ~6 packs (Warm Minimal, Modern Indian, Earthy Traditional, Soft Neutrals, Bold Contemporary, Classic Heritage) across kitchen / living / bedroom / bath / pooja / facade / balcony. Primary source: **CivilArch's own project photography** — real, owned, on-brand. Anything external gets a licensing check first.
- **The quick-start deck** (Phase 4): any empty area offers "Rate 10 designer picks — 1 minute." Finish the deck and the ignition (Phase 1) fires automatically: themes appear. That's the magic moment for a brand-new user.

## 9. How we're building it (method, briefly)

Every phase has a written plan with test-first tasks (the test that must fail, then the code that makes it pass). Each task is implemented by a fresh agent, reviewed twice (does it match the spec? is it well built?), and committed separately. Every phase ends with a full review, a green test suite (~1,400 backend tests), and a PR. Nothing ships on green checkmarks alone — Phase 6 is literally "walk the whole loop on two phones, live, before deploying." All plans live in `docs/superpowers/plans/2026-07-05-design-loop-*.md` (and in the vault under *02-Product → Design Loop*).

## 10. Glossary — the ten words that matter

- **Area** — one designable zone (kitchen, facade, pooja room). Taste is computed per area.
- **Reference** — one inspiration image, from upload, Pinterest, or a preset. All three become the same thing internally.
- **Ranking** — one person's 1–5 stars + tags on one reference.
- **Taste model** — the per-area math summary of what the family actually likes. Deterministic.
- **Confidence** — how sure the math is (ratings vs. recommended count). Never invented by the AI.
- **Conflict** — a detected, honest disagreement between contributors on one taste dimension.
- **Theme** — an AI-*proposed* design direction (name, palette, materials, rationale) awaiting a human verdict.
- **Clarification** — an AI question that sharpens low-confidence taste; answering feeds back into the math.
- **Brief** — the versioned, three-audience document that carries the family's taste to the designer and contractor. Has a state machine: homeowner review → designer review → signed off → approved → locked.
- **Materialize** — turning an approved brief into real, priceable material selections routed for owner approval. The payoff.

---

## Appendix — for the technically curious

- Engine: `constructo/backend/app/profiler/` — pure-math taste reducer (`taste.py`), vision extraction, themes/brief/clarifications, all behind `/api/v1/design/*`. Live in production (Labs flag defaults on).
- The audit: `docs/superpowers/specs/2026-07-05-design-loop-e2e-design.md`. The plans: `docs/superpowers/plans/2026-07-05-design-loop-*.md` (master + phases 0–6).
- Key architectural choices: no shadow rows in Updates/site-events for notifications (bell inbox + push instead — we learned that pollution lesson the hard way in PR #240); the materials payoff reuses the existing Decision inbox rather than inventing a second approval path; all three image sources converge on one storage + vision + ranking pipeline.
