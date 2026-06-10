# Constructo — State of the Product & The Forward Roadmap

> **Author:** Written with Claude (founder-level review), 2026-06-09
> **For:** Aryan (founder)
> **Purpose:** The one document that explains, honestly, *where we are, how we got here, and exactly how we move forward* — end to end. Read this when you feel scattered. It is the map.
>
> **The strategy in one line:** *Converge, don't amputate. Keep the whole vision — but make the **path** deterministic so the **scope** stops scattering you.*

---

## How to read this

This is long on purpose — you asked to "know everything, from the start." It has six parts and an appendix:

1. **Part I — How we got here** (the honest origin story)
2. **Part II — Where you actually are** (the state of the union, with real numbers)
3. **Part III — The strategy you chose, turned into doctrine** (the Determinism Doctrine + the Production Bar)
4. **Part IV — The roadmap** (Phase 0 → 4, each with a verifiable exit gate)
5. **Part V — How to never feel scattered again** (your operating system)
6. **Part VI — Your next 5 actions** (start today)
7. **Appendix — the four-layer audit** (the raw truth, for reference)

The single most important reframe, before anything else:

> **You do not have a scattered *product*. You have a focused product spread across too many *fronts*, and you have never put it in a real person's hands.** Your vision is coherent. Your engineering is disciplined. Your design is locked. The scatter is real, but it lives in *focus and validation*, not in the work itself. That is a far better problem than the one you think you have — and the way out is a **sequence, not a restart.**

---

# Part I — How we got here (the honest origin story)

## The seed
The insight the whole company stands on is correct and rare: **WhatsApp is the real operating system of Indian residential construction.** Voice notes, site photos, delivery challans, "kitne log aaye," "bhej do" — six roles, six groups, six versions of the truth, disputes settled by hierarchy and memory instead of facts. Information never travels upward cleanly.

Your answer: an **honest AI "trust membrane"** that metabolizes that chaos into **one append-only, evidence-anchored record**, and hands each person their own honest slice of it. The doctrine you wrote and have held for 465 commits:

- **AI proposes, a named human commits.** Raw AI never reaches the person who can't sanity-check it.
- **The metabolism, not the mouth, is the product. The membrane is the moat.**
- Two faces of the same engine: for the **contractor** it's an *accelerator* ("3 decisions from evidence before 7:15am"); for the **homeowner** it's a *translator behind glass* ("you can relax — nothing needs you today").

This is a genuinely good thesis. It has not drifted.

## What you built, in order
- **Wave 0–2 + Phase A/B/C — the "WhatsApp Brain" MVP** (late May): capture → extract → Owner Brief → web dashboard + WhatsApp send. Proven on real data, Azure-wired. *The foundation everything stands on.*
- **Homeowner AI-native** (08-): the "Reassure" surface, trust-membrane constitution, the famous magic moments. Core built (SettleBar, authority gate, quiet-period, Hindi read-path, vision captions).
- **Contractor AI-native** (09-): the mirror image, accelerator posture, CA1–CA9.
- **Contractor Web Experience** (11-): the control plane — Owner Command Center, Reconciliation Cockpit, ⌘K, full Setup/Admin. **The most-finished thread after the MVP** (~30 PRs).
- **In-App Chat** (12-, 26 docs): "make the thread the product." Built Phases 0–3, then re-conceived a second time as "Unified Rich Chat." *The hottest, most-churned thread.*
- **Real-data dogfood** (09/14): 26 months of your family's "Tripathi Dream Home" / CivilArch WhatsApp history imported into **production**.
- **Redesigns**: original "Blueprint & Daylight" → homeowner "Calm Cockpit" (locked as a skill) → the brand-new "owner-crew" contractor redesign briefs.

## How it got scattered (the honest mechanism)
Three habits, none of them fatal, compounded:

1. **You spec faster than you validate.** There is a "Gap Analysis (Built vs Specced vs Ideal)" doc in *both* 08- and 09-. The spec races ahead; the build chases; the customer is never asked.
2. **You finish *engineering* relentlessly but re-frame *strategy* relentlessly.** You don't leave things half-coded — you leave them half-*decided*, ship a version anyway, then re-frame and ship again. (Chat conceived twice, contractor design twice, homeowner UI three times.)
3. **You opened four fronts because each new angle was genuinely good.** Homeowner → contractor → homeowner, web interleaved with mobile. Your own strategy doc scored the contractor wedge #1 (23/23) and the homeowner lens *last* (16/23) and said *"do not split focus now"* — and then you split focus, because you could build anything, so you built everything.

**The emotional truth:** the scatter is a symptom of *ambition and capability without a forcing function.* The forcing function you've been missing is a real user. That's it. That's the whole disease.

---

# Part II — Where you actually are (the state of the union)

Distilled from a four-layer audit (backend, frontend, vault/vision, delivery/ops). The full findings are in the Appendix. The honest summary:

## What is genuinely STRONG (you can't feel this from the inside)
- **Vision:** coherent, differentiated, stable across 465 commits. This is a real company's spine.
- **Engineering discipline:** **161 PRs, 160 merged, 0 abandoned.** Real CI (pytest + ruff + alembic + typecheck + build + bundle-budget across all four surfaces). Idempotent seeders. A working Dockerfile and a live deploy. *People who "can't ship" do not have a 99% merge rate.*
- **Design:** **locked, not chaotic.** Two coherent systems — Blueprint (contractor) and Calm Cockpit (homeowner). No competing design systems live in the code, no duplicate component sets. The orphaned Stitch tokens are dead files, not a live fork.
- **Backend foundation:** clean async FastAPI + SQLAlchemy, systematic multi-tenancy, an event-sourcing spine, and several genuinely production-grade subsystems (approvals state machine, DPR, reconciliation matching, nightly brief, extraction pipeline, semantic search).
- **Homeowner app:** ~90% wired to real data and coherent (Calm Cockpit, honest SettleBar instead of fake % rings, positive empty states).

## What is actually WRONG (three different problems, three different fixes)
1. **Focus — too many fronts.** Four products at once (homeowner mobile, contractor mobile, contractor web, chat-as-platform) across two surfaces and a two-sided market. The scatter is here, not in the code.
2. **Validation — the void.** Gates read **0/5, 0/2, 0/2**, untouched since day one. "CivilArch / Tripathi" is your *own family's data*, not a customer. **Nothing "feels production-level" because production-level isn't a code-quality bar — it's "a real person depends on this daily," and nobody does yet.**
3. **Production-hygiene emergency** (urgent, regardless of strategy): a **live backend + live database on the public internet**, seeded with a real family's names/phones/money talk, with **live DB password + every AI/cloud key in a plaintext `.env`** you flagged to rotate "before going public" — and the purge may never have run. Login is wide open (anyone logs in with OTP `000000`). Nothing leaked to git, but this is exposed.

## The hollow features (the "half of it doesn't work" feeling — real, but a finish-or-cut list, not a rebuild)
- OTP login is stubbed (`000000` lets anyone in).
- Homeowner data-masking has gaps (a real PII-leak path: vendor names, wages, unpublished drafts).
- Vision/image analysis is frozen (method exists, commented out).
- `dispute-pack` and `vendor-confirm` are **routes that accept requests and do nothing.**
- Admin/dashboard roll-ups are stubs; permit alerts never actually run.
- **Contractor mobile is ~2,000 lines of dead "coming soon" code** shipped in the app.
- Translation is faked (locale-aware rendering, but no real translation pipeline).
- Chat is the flagship but spartan (no replies, edit, typing, receipts).

**None of these require a rebuild.** Each is a single decision: **Finish, Quarantine (label it "Labs"), or Cut.**

---

# Part III — The strategy you chose, turned into doctrine

You made three calls. Here they are, honored and turned into a working doctrine.

| Your call | What it means | How the plan honors it |
|---|---|---|
| **Production-grade & coherent first** | Make it real and stop the scatter *before* chasing users | Phases 0–2 are pure hardening/coherence. No new fronts until the core is bulletproof. |
| **"Everything, more deterministic" — not one wedge** | Keep the whole vision; make it reliable | **Converge, don't amputate.** Nothing is deleted from the vision. Fuzzy things get *quarantined*, not killed. The *path* is sequenced so the *scope* doesn't scatter you. |
| **Pilots: family contractor + a homeowner** | You can reach both sides | You will dogfood the **complete two-sided loop** on real humans — the one thing an "everything" product must prove. |

## The Determinism Doctrine (your new spine)

"More deterministic" is the most important word you said. It lands in three places, and the entire roadmap is built on it:

### 1. A deterministic *product*
- **AI only ever proposes; a named human commits.** (You already believe this — now enforce it everywhere with no exceptions.)
- **Exact numbers never come from the LLM.** Sums, counts, money — deterministic reducers over the ledger, always. The LLM narrates; it never calculates.
- **Anything probabilistic that can't be made reliable is quarantined behind a `Labs` flag** and *labeled as experimental* — never shown as a finished feature. Vision captions, design AI, auto-translation, half-wired RAG: these become honest "Labs" or they get finished to determinism. **No route pretends to work.**

> This *is* "production-grade." A product is trustworthy when its core is deterministic and its experiments are honestly labeled.

### 2. Deterministic *surfaces*
- **One Production Bar** (defined below). Nothing ships below it.
- **Coherence means: nothing in the app lies to the user.** No hollow routes, no dead "coming soon" subtrees, no half-skinned screens. Either it's real, or it's clearly Labs, or it's not in the build.

### 3. A deterministic *process*
- **WIP = 1 front.** Finish-before-start. The cure for four-fronts-at-once is not "work harder on four" — it's "one at a time, to completion."
- **Defined phases with verifiable exit gates** (Part IV). A phase isn't "done" because it feels done; it's done when its gate passes a check you can run.
- **One source of truth** for "what state is everything in" (the Feature Ledger, Part IV / Phase 1).

## The Production Bar (your definition of "done")
Write this on the wall. A feature is **production-grade** if and only if:

1. **Wired** — talks to real data end-to-end (no mock/seed dependency to function).
2. **Honest states** — has real empty, loading, and error states (no blank screens, no fake data).
3. **Tested** — at least one end-to-end test covering its golden path, green in CI.
4. **Membrane-safe** — respects the trust membrane (no raw AI or hidden field reaches the wrong eyes; authz checked).
5. **Secure** — no auth bypass, no secret in plaintext, input validated.
6. **Deterministic-or-Labs** — either fully reliable, or explicitly flagged `Labs` and labeled experimental in the UI.

If it fails any of the six, it is **not done** — it's Finish, Quarantine, or Cut.

---

# Part IV — The roadmap (end to end)

Five phases. Each has an **objective**, the **work**, and a **gate you can actually verify**. Sized for a solo, AI-assisted founder. Times are honest estimates, not promises — the *gates* are what matter, not the calendar.

> **The golden path** (the one loop everything serves): **supervisor captures (voice/photo) → extraction → event ledger → owner brief + approvals/reconcile → homeowner's published slice + Home Room.** This single loop, working end-to-end on real people, *is* the product. Every phase moves it closer to bulletproof.

---

## Phase 0 — Secure the house *(Days 1–3 — BLOCKER, do this first)*
**Objective:** stop the one thing that is genuinely dangerous right now, regardless of strategy.

**Work:**
1. **Confirm the prod data state.** Check whether the Tripathi/CivilArch real data is still queryable in prod Neon. If yes → run the importer's `--purge` (DB rows + R2 objects) **or** take the deployment private until you're ready.
2. **Rotate every credential** — Neon password, Azure OpenAI / AI Services / Speech / Translator / Doc Intelligence keys, Cloudflare R2 access key + secret, Sarvam key. Treat them as exposed-to-self. Move them into **Azure Container App secrets** (the `secretref:` pattern your `DEPLOY.md` already shows) — stop pasting into `.env`.
3. **Close the OTP `000000` hole.** Either wire a real SMS provider, or — for a private pilot — lock login to an allowlist of known phone numbers. No public, bypassable auth.
4. **Decide prod posture.** Either *actively pilot it* (then turn on cost budget alerts at $20/$50 and a `/healthz` monitor) or *tear it down* until Phase 3.

**Gate (verify all):** no real PII reachable by an outsider · no live key in a plaintext file · login cannot be bypassed · you know exactly what is deployed and what it costs per month.

---

## Phase 1 — The Great Convergence *(Weeks 1–2)*
**Objective:** make the whole product *honest and coherent* — every surface tells the truth — and create the single source of truth that ends the scatter.

**Work:**
1. **Build the Feature Ledger** — one table listing *every* route/screen/feature across all four surfaces, each tagged `REAL / THIN / STUB / DEAD`, with a decision: **FINISH / QUARANTINE(Labs) / CUT**. This becomes the law. *(I can generate the first draft from the audit — it's mostly done in the Appendix.)*
2. **Resolve the two live contradictions — in writing:**
   - **Owner-crew redesign:** pick **evolve-Blueprint** *or* **blank-slate** — you currently hold both mandates in the same folder, authored the same day. You cannot do both. (Recommendation: *evolve* — you already have a locked, loved system; a blank slate re-opens a closed decision.)
   - **Chat doctrine:** "chat-everywhere platform" vs "absorb-workflows wedge." Write the one sentence you'll hold. (Recommendation: *"Win the record, rent the transport — absorb workflows, don't fight a chat war."*)
3. **Quarantine contractor mobile cleanly.** Remove the 2,000 lines of dead "coming soon" from the shipped app (move behind a flag / a clearly-marked branch). *Keep the vision; stop shipping the ghost.*
4. **Delete genuinely dead code** — orphaned Stitch tokens, unused web `fixtures.ts`.
5. **Repo hygiene** — prune the ~150 merged remote branches, GC the 16 worktrees (1.2 GB), adopt delete-on-merge, turn on required CI status checks on `main`.

**Gate:** every screen in every shipped surface is honest (no hollow routes; Labs clearly labeled) · the Feature Ledger exists and is the source of truth · both contradictions are decided in writing · `git branch -r | wc -l` is back under ~20 · CI is a required merge check.

---

## Phase 2 — Harden the deterministic spine to the Production Bar *(Weeks 3–5)*
**Objective:** bring the **golden path** — and only the golden path — to the full Production Bar. This is where "production-grade & coherent" is actually achieved.

**Work:**
1. **Take every step of the golden-path loop to the six-point Bar:** end-to-end tests, honest states, authz, security.
2. **Close the homeowner masking leak** (the real PII risk) — audit every homeowner response for vendor names, wages, unpublished drafts; add field-level masking; add a cross-role visibility test matrix.
3. **Lean into determinism; quarantine the fuzzy.** Vision captions, design AI, faked translation, half-wired RAG → *finish to deterministic reliability* or *move behind `Labs`* with honest UI labeling. Make the deterministic reducers the visible default. (This is the "more deterministic" you asked for, made concrete.)
4. **Finish-or-cut the hollow backend routes** (`dispute-pack`, `vendor-confirm`, dashboard stubs, permit sweep): either wire them or return a clear `501`/remove them. No silent no-ops.
5. **One golden-path end-to-end test in CI** — "capture → extraction → ledger → brief → approval → homeowner slice" as a single automated check.

**Gate:** the golden path works end-to-end on seed data, tests green in CI · zero PII leaks across the membrane (test proves it) · nothing fuzzy is shown as real · every route is real or honestly Labs · the OTP/auth path is production-secure.

---

## Phase 3 — Prove the whole loop on real people *(Weeks 5–7)*
**Objective:** the thing that finally makes it *feel* production-level — a real person depending on it daily.

**Work:**
1. **Turn on the two pilots** on a **current, active** project (not the historical import): the **family/CivilArch contractor** capturing on a live site, and the **homeowner** receiving the calm slice.
2. **Run the real two-sided loop daily.** Contractor captures → record → owner brief/approvals → homeowner's published slice. This is the *complete* product, on real humans — the payoff of choosing "everything."
3. **Watch the kill-gate signals** (even though validation wasn't your stated #1): *mukadam opens it unprompted · owner makes ≥2 decisions-from-evidence before 7:15am · read-back correction <15% · homeowner earns an "all caught up" day.* Production-grade is only *proven* when a real person leans on it.
4. **Tight fix loop** — patch what breaks under real use. This is the work that converts "demo-able" into "trustworthy."

**Gate:** both the family contractor and the homeowner use it on a real, current project for **2 weeks** · the loop holds without you hand-holding it · you have a list of *real* (observed, not imagined) gaps to drive Phase 4.

---

## Phase 4 — Expand deliberately, behind the bar *(Week 8+)*
**Objective:** now — and only now — grow the surface area, one front at a time, each meeting the same bar.

**Candidates, in the order the pilots will likely pull them:**
- Contractor **mobile field app** (un-quarantine it) — *if the supervisor pilot pulls for a phone-native capture.*
- **Chat-as-platform** expansion — guided by the doctrine you wrote in Phase 1.
- The **owner-crew redesign** — built on the direction you chose in Phase 1.
- **Constructo MCP** ("bring your house to any AI") — the deliberate bet, once the record is trustworthy.
- Additional roles, additional sites, the second real customer.

**Gate (standing):** each new surface ships only when it meets the Production Bar · WIP stays at 1 front · the Feature Ledger stays honest.

---

# Part V — How to never feel scattered again (your operating system)

The roadmap fixes *today*. This fixes *forever*. These are the rules that keep the disease from coming back:

1. **WIP = 1 front.** Finish-before-start. The cure for four-fronts isn't more effort — it's one at a time.
2. **The Feature Ledger is law.** Every feature is `REAL / THIN / STUB / DEAD` with a `FINISH / QUARANTINE / CUT` decision. Update it before you start anything. It is your single source of truth for "where are we."
3. **The Production Bar is the definition of done.** Six points. Nothing ships below it. Fuzzy = `Labs`, honestly labeled.
4. **Spec no faster than you validate.** New module ⇒ a real user pulled for it. Tape this over the desk: *"don't build new modules until a real user pulls."*
5. **Repo hygiene is part of the work.** Delete-on-merge. Cap worktrees. A clean tree is a clean mind.
6. **Weekly 30-minute "State of the Union" ritual.** Update the Ledger. Confirm the gate for the current phase. Pick the *one* next thing. That's it.
7. **Your identity:** *"We make construction's chaos deterministic. We don't ship things that lie."* When in doubt, that sentence decides.

---

# Part VI — Your next 5 actions (start today)

1. **Phase 0 security** — confirm the prod purge, rotate the keys, close the OTP hole. *(I can start walking you through this immediately.)*
2. **Generate the Feature Ledger** — first draft from the audit. *(I can produce this next as `13 - State and Roadmap/01 - Feature Ledger.md`.)*
3. **Decide the two contradictions** — owner-crew (evolve vs blank-slate) and the chat doctrine. *15 minutes, your call; I'll lay out the options.*
4. **Write the golden path + Production Bar** into the repo as the team's law. *(I can draft.)*
5. **Line up the two pilots** — pick the *current, active* CivilArch site and the homeowner, so Phase 3 has real targets.

> You don't need to do all five today. You need to do **#1 today** and let the rest follow the sequence. One front at a time. That is the whole discipline.

---

# Appendix — The four-layer audit (the raw truth)

## A. Backend
- **Stack:** Python 3.12, FastAPI, async SQLAlchemy, Postgres 16 + pgvector (Neon), Redis/RQ, APScheduler, OpenAI/Azure OpenAI, S3/R2, JWT auth. `uv` managed. **31 routers, 36 models, 33 migrations, 121 test files.**
- **Production-grade:** async foundation, multi-tenancy, approvals state machine, DPR, reconciliation matching, nightly brief, extraction pipeline (with deterministic fallback), semantic search, event-sourcing spine.
- **Roughly:** ~110 real/mostly-real endpoints · ~20 thin · ~20 stub.
- **Broken/incomplete:** OTP login stubbed (`000000`) · homeowner masking gaps (PII risk) · vision frozen · `dispute-pack`/`vendor-confirm` routes-only · admin/dashboard stubs · permit sweep never invoked · translation faked · no end-to-end tests for the core workflow.
- **Top risks:** (1) OTP unsecured — **blocker** · (2) homeowner masking — data-leak · (3) stub endpoints that silently no-op · (4) no enforced CI gate · (5) chat groups missing unread/activity tracking.

## B. Frontend
- **Mobile:** Expo Router + TypeScript, React Query + Zustand, typed fetch client. **Homeowner app ~90% wired, coherent ("Calm Cockpit, Direction C"), honest placeholders.**
- **Contractor:** **web app is live and ~95% wired** (43 pages: owner brief, PM today, supervisor capture, reconcile, approvals, search, DPR, admin). **Contractor *mobile* is ~2,000 lines of dead "coming soon."**
- **The scatter is NOT in design:** two coherent locked systems (Blueprint + Calm Cockpit), no duplicate component sets, no live competing design system. Orphaned Stitch tokens = dead files.
- **Chat:** flagship and real but spartan — inbox + thread + send + a clever Capture Rail work; replies/edit/typing/receipts missing.
- **Top problems:** (1) dead contractor-mobile subtree · (2) manual mobile↔web token sync (desync risk) · (3) chat too bare vs the "thread is the product" vision · (4) inconsistent "coming soon" branding · (5) orphaned web fixtures.

## C. Vault / vision
- **One coherent thesis**, stable across 465 commits: WhatsApp-chaos → trust-membrane → metabolized ledger → role-shaped honest slices; contractor=accelerator, homeowner=translator.
- **The drift is in focus, not vision:** target-user pendulum (homeowner→contractor→homeowner), UI re-conceived ~4×, chat conceived 2×, two contradictory owner-crew briefs authored the same day.
- **Strong research & metrics philosophy** (TAM/SAM/SOM, Powerplay/Velora competition, per-active-site pricing, decisions-from-evidence as the metric — not engagement). **GTM doc is an empty placeholder. Validation gates: 0/5, 0/2, 0/2.**
- **No customer yet — a real *dataset*, not a real *user*.** The Tripathi/CivilArch import is a dogfood asset and a privacy liability, not validation.

## D. Delivery / ops
- **Healthy delivery:** 161 PRs, **160 merged (99%), 0 abandoned.** Real 4-job CI (backend pytest+ruff+alembic, web build+budget+vitest, bridge typecheck, mobile typecheck+jest). Idempotent seeders. Verified Dockerfile. Detailed `DEPLOY.md`.
- **Dangerous production posture:** **live Azure backend (HTTP 200) + live Neon DB (:5432 open) on the public internet**, seeded with real family PII, **live credentials in a plaintext `.env`** (never committed — good — but un-rotated), purge **unconfirmed**.
- **Scatter, quantified:** 40 local branches, **155 remote** (never pruned), 16 worktrees (1.2 GB). Convergent, not chaotic — but real cognitive overhead.
- **Top ops risks:** (1) un-rotated live creds · (2) real PII on public prod, purge unconfirmed · (3) deployed-and-forgotten cloud cost/attack-surface · (4) branch/worktree sprawl · (5) no enforced merge gate / no live smoke test.

---

*End of document. The map exists now. The next move is Phase 0, today.*
