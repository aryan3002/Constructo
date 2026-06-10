# Kickoff brief — continue the contractor "Neev" re-skin (fresh session)

> Paste this into a new Claude Code session in this repo to continue the contractor mobile re-skin. The project memory already carries the summary ([[contractor-neev-reskin]]); this is the explicit, self-contained kickoff.

---

You're continuing a **re-skin of the contractor React Native / Expo app to the "Neev · Site Register" design system**. The homeowner app was already re-skinned to its own system ("Calm Cockpit") and merged to `main` — **mirror that playbook exactly**.

## Ground yourself first (read in this order)
1. The **Neev design system** — installed as a local skill (like the homeowner one): **`constructo/.claude/skills/constructo-contractor-design/`** — read `readme.md`, `tokens/colors.css`, `tokens/typography.css`, and skim `components/` + `ui_kits/neev-app/`. (It's gitignored/local, same as `constructo-homeowner-design`.) This is the WEB reference you translate FROM (HTML/CSS/JSX; the app is React Native — translate, don't copy).
2. Memory `contractor-neev-reskin.md` (current state) and `language-english-first.md` (the hard language rule).
3. The **homeowner re-skin on `main`** as the proven pattern: `constructo/mobile/src/theme/tokens.ts` (the `daylight` theme), `src/ui/` kit, `app/(homeowner)/` screens — Neev is the contractor twin of this.

## Where things stand — Phase 0 is DONE
On branch **`feat/contractor-neev`** (off `main`, pushed): the contractor `blueprint` theme key now carries the **Neev** identity.
- **Fonts** (`src/theme/fonts.ts`): Bricolage Grotesque (Latin display) + Mukta (Devanagari+Latin body) + Spline Sans Mono (₹) — `FACES.blueprint` set; loaded via `@expo-google-fonts`.
- **Tokens** (`src/theme/tokens.ts`): `BLUEPRINT_COLORS` → warm paper `#EFEADF`, ink `#1B1916`, single marigold `#F0A21F`; **primary action is INK** (marigold is the capture/affirmative spark only); money **ink-first**; own warm status spine (ok `#2F7D52` · warn `#C77A12` · risk `#B23A2E` · info `#3A6491`). Sturdy radii (10/14/18). `TYPE_BLUEPRINT` → Neev scale (display 34 Bricolage, body 15.5 Mukta, ₹ 18 Spline mono).
- typecheck + 58 jest green. **Work on `feat/contractor-neev`; keep both green at every step.**

## Locked Neev rules (don't drift)
- Warm concrete paper canvas; deep ink chrome/text; **marigold `#F0A21F` is the ONE spark** (capture mic + the single affirmative "yes" like Approve/Order/Send). **Primary buttons are INK; cautionary (Hold/stop) is ink-outline.** Never two marigold fills competing.
- **Money / all numbers = Spline Sans Mono, tabular**, Indian grouping (`₹1,24,000`); ink by default, colour only for direction (`−₹4,000` risk-red out / `+₹2,50,000` ok-green in). Bricolage is **headings only** (Latin); Mukta carries Hindi + body.
- **No fake %** — honest stage + variance ("1 day behind"), never a ring/bar.
- **Evidence on tap** (slip/PO/voice/attendance → proof); append-only record.
- **Money tracking-only**; **capability-gated**: non-owner on a money item shows **"Propose to owner →"**, never Approve.
- **Honest AI**: draft + visible confidence; low confidence holds the send.
- **Status = shape + label + colour**, never colour alone. Signature: the **folded-corner "register page" status flag** + the marigold capture mic + the "filed into the record" stamp.

## HARD language rule (NEW — apply from the start)
**English-first, ONE language per screen.** Default everything to **English**; Hindi is a per-user toggle that re-renders the whole screen in Hindi. **Never show English and Hindi on the same screen** — collapse Neev's bilingual labels (`मंज़ूर करें · Approve`, `अंतर · VARIANCE`) to single-language. Keep real i18n (en/hi); numbers/₹/dates stay numeric.

## The plan (phased — report at each gate, like the homeowner)
- **PHASE 1 — the Neev kit** (`src/ui/`, contractor-facing): the shared theme-aware primitives (Button, Card, StatusPill) already cascade to Neev colours/fonts — verify + tune them. Then build Neev's signature components: **MoneyCell** (ink-first tabular ₹), **CaptureBar** (hold-to-talk mic), **ConfirmCard** (honest-AI confirm), **NeedsYouCard** (ranked exception + tone prop: affirmative=marigold / cautionary=ink), **EvidenceCard** (proof), **EmptyState** (all-clear / offline), and the **folded-corner status flag**. Keep contractor (`blueprint`) changes isolated — DON'T touch the homeowner `daylight` theme.
- **PHASE 2 — the screens** (`app/(contractor)/`): ~30 across **owner · pm · accountant · supervisor · mukadam**. Parallel fan-out — one screen per PR, each in its own git worktree branched from `origin/feat/contractor-neev`, typecheck+jest green, small PR. (Use the supervisor `capture` + owner `brief`/`approvals` as the reference screens first.)

> **Chat/messages is a SHARED, theme-aware kit — do NOT re-skin it per-side.** `src/chat/` (`ChatComposer`, `MessageFeed`, `MessageView` → `MessageBubble`/`CaptureCard`, `useChatThread`, `feed`) is used by BOTH the homeowner and contractor and reads `theme.colors`/`theme.radii` with zero hardcoded hexes — so it already renders Neev on contractor + Calm Cockpit on homeowner automatically. In Phase 2: just **verify chat looks right in Neev** and keep any thin per-side inbox-row wrappers (e.g. contractor `_chat_components.tsx`/`ConversationRow`, homeowner `_messages_components.tsx`) theme-token-driven. Don't fork the bubbles/composer.

## Verify / gotchas (learned on the homeowner)
- `cd constructo/mobile && npm run typecheck && npx jest` after every change. CI gates mobile (typecheck+jest), backend (ruff+pytest), web, bridge.
- **NEVER put a test file under `app/`** — Expo Router evaluates every file there at launch and `describe()` crashes the app; tests live in `src/`. (See `expo-router-tab-route-gotcha` memory.)
- **Give display fonts generous lineHeight** (~1.25×) or iOS clips the tops; the image picker fails if launched while a Modal is dismissing (launch picker first, close sheet after); typecheck/jest **don't** catch RN render bugs — verify on device.
- When dispatching parallel screen agents in worktrees: pin them to branch from **`origin/feat/contractor-neev`** explicitly (a fresh worktree otherwise bases off `main`), and symlink `node_modules` from the main checkout before typechecking.

## Out of scope (afterwards)
The **web** console re-skin (align the Blueprint web → Neev) is a **separate follow-on AFTER the mobile lands** — recommendation: keep the web's dark mode + dense grids + ⌘K, swap only its identity to Neev ("Neev Desk"). Don't start it now.

Start with **Phase 1 (the kit)** on `feat/contractor-neev`, report back with a render before fanning out the screens.
