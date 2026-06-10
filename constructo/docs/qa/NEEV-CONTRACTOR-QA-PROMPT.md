# QA Prompt — Neev (Site Register) contractor mobile re-skin

> Hand this whole prompt to a Claude (Sonnet) coding agent running in this repo with an iOS simulator available. It is self-contained.

---

You are doing a thorough QA pass on the **"Neev / Site Register"** re-skin of the **contractor mobile app** (Expo / React Native), which was just merged to `main`. Your job: verify it builds, runs, every screen renders correctly for every role, the key flows work, the Neev design system is correctly applied (no old "Blueprint"/Anek styling leaking through), the UI is English-first, and there are **no regressions or crashes**. Then write a QA report and leave behind reusable Maestro flows.

Be rigorous and **evidence-based**: never write "looks good" without a screenshot or command output. Report every failure with exact reproduction steps. Do **not** change product behavior or design — this is QA, not a feature change. If you hit a trivial crash-blocker (e.g. an undefined import), you may fix it and note it clearly; otherwise file a bug, don't fix.

## Repo & app

- Repo root: `/Users/aryantripathi/Developer/contructionAI`
- Mobile app: `constructo/mobile` (Expo SDK 54, React Native 0.81, Expo Router, TypeScript)
- Backend: `constructo/backend` (FastAPI, `uv`, Postgres+pgvector, Redis)
- Contractor personas: `owner`, `pm`, `supervisor`, `accountant`, `labor_contractor` (mukadam). (`procurement` is a placeholder — skip.)
- Design system under test: **Neev** (contractor). The **homeowner** app uses a separate "Calm Cockpit" system — only smoke-check it for regressions at the end.

## Environment setup (run these, in order)

```bash
# 1) Postgres + Redis
cd /Users/aryantripathi/Developer/contructionAI/constructo
docker compose up -d && docker compose ps   # both should be healthy

# 2) Migrate + seed demo data
cd /Users/aryantripathi/Developer/contructionAI/constructo/backend
export DATABASE_URL="postgresql+asyncpg://constructo:constructo@localhost:5433/constructo"
uv run alembic upgrade head
uv run python -m scripts.seed_demo            # creates company "Sunrise Builders", 3 sites, 6 users, events, decisions, homeowner slice

# 3) Start the API (port 8000)
EXTRACTION_SYNC=true uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
# (leave running in its own terminal)

# 4) Backend sanity — every role logs in
bash /Users/aryantripathi/Developer/contructionAI/constructo/backend/scripts/smoke_login.sh   # expect "ALL GOOD"

# 5) Mobile — point at the backend, then run on the iOS simulator
cd /Users/aryantripathi/Developer/contructionAI/constructo/mobile
# For the iOS simulator, the API base must be localhost:8000 (NOT Metro :8081):
#   ensure .env contains:  EXPO_PUBLIC_API_BASE=http://localhost:8000
npm install
npx expo start -c        # -c clears the Metro cache so EXPO_PUBLIC_* re-inline
# then press 'i' to open the iOS simulator (or run `npm run ios`)
```

Gotchas: API base must be `:8000` (8081 is Metro). After any `.env` change, restart with `-c`. `expo-audio`/`expo-camera`/`expo-secure-store` do **not** work on web — **use the iOS simulator, not `--web`.**

## Test accounts (phone + OTP `000000`)

| Role | Phone | Lands on |
|---|---|---|
| owner | +919800000001 | `owner/brief` |
| pm | +919800000002 | `pm/dpr` |
| supervisor | +919800000003 | `supervisor/capture` |
| accountant | +919800000004 | `accountant/reconcile` |
| mukadam (labor_contractor) | +919800000006 | `mukadam/attendance` |
| homeowner (join code `SUNRISE-HOME`) | any phone | `(homeowner)/home` |

## PHASE 1 — Automated gates (do first; cheap; blockers if red)

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/mobile
npm run typecheck    # must be clean (0 errors)
npm test             # jest — expect ~66 passing
```
Report any failure here as a **blocker** before touching the simulator.

## PHASE 2 — Boot & smoke

- Launch the app on the iOS simulator. Confirm the **login screen renders** with Neev styling (warm paper background, marigold accent), no red error overlay.
- Watch the Metro log: there must be **no "No route named …" warnings** and no unhandled JS exceptions on boot.

## PHASE 3 — Per-role walkthrough (the matrix)

For **each** role below: log in (phone + `000000`) → confirm it lands on the right screen → visit **every** screen in that role's navigation → for each screen verify: **(a)** renders with no crash/red-box, **(b)** shows real seeded data (not an empty/placeholder state), **(c)** Neev design applied (see Phase 4), **(d)** text is English-first, **(e)** take a screenshot.

- **owner:** `brief`, `sites`, `site/[id]`, `chat`, `chat/[id]`, `approvals`, `search`, `foresight`, `dispute-pack`, `more`
- **pm:** `dpr`, `more`
- **supervisor:** `capture`, `my-sites`, `action-items`, `tasks-asks`, `chat`
- **accountant:** `reconcile`, `payments`, `site/[id]`, `more`
- **mukadam:** `attendance`, `my-payments`, `help`

Then exercise the **key flows** (the ones with real logic):
- **supervisor → capture:** record a voice note AND take a photo → confirm the honest-AI "confirm card" appears with a draft + confidence, and committing creates an event.
- **owner → brief/approvals:** open a pending decision → Approve / Hold → state updates.
- **accountant → reconcile:** open a mismatch → verify the 3-way match view renders with real numbers.
- **mukadam → attendance:** mark a headcount via voice/text → it saves.

## PHASE 4 — Neev design verification (no Blueprint/Anek leaks)

On contractor screens, confirm:
- Background is **warm paper `#efeadf`** (and cards `#fffdf8`) — **never** clinical white `#ffffff`.
- The only accent is **marigold `#f0a21f`** (pressed `#d6850c`). Flag any teal/old-amber leak.
- Fonts: headlines = **Bricolage Grotesque**, body/labels = **Mukta**, money/₹ = **Spline Sans Mono**. Flag any **Anek/Hind/IBM Plex** (those are old/homeowner faces).
- Status colors are warm: ok `#2f7d52`, warn `#c77a12`, risk (brick) `#b23a2e` — and always paired with a label/icon, never colour-alone.

## PHASE 4.5 — Homeowner regression smoke (the merge touched shared kit)

Log in via join code `SUNRISE-HOME` → confirm `(homeowner)/home` renders in **Calm Cockpit** styling (warm sand, sage green — NOT Neev marigold), and the messages/photos/updates tabs load. Just confirm nothing broke; no deep pass needed.

## DRIVING THE SIMULATOR — pick one

- **Recommended — Maestro** (deterministic, and leaves reusable regression tests): install `curl -Ls "https://get.maestro.mobile.dev" | bash`; author one flow per role under `constructo/mobile/.maestro/` (launch → login → tap through screens → `takeScreenshot`); run `maestro test constructo/mobile/.maestro/`. Commit these flows — they become the app's first e2e suite.
- **Fallback — manual:** screenshots via `xcrun simctl io booted screenshot /tmp/qa_<screen>.png`; tap through the simulator directly.

## PHASE 5 — The report

Write `constructo/docs/qa/<today>-neev-contractor-qa.md` matching the existing QA-doc format (see `constructo/docs/qa/2026-06-07-chat-groups-device-test.md`):
1. **Environment** table (backend host, DB, seed, commit SHA of `main`, simulator/device).
2. **Automated results** (typecheck, jest, smoke_login).
3. **Per-role test matrix:** one row per screen — `role · screen · PASS/FAIL · screenshot path · notes`.
4. **Key-flow results** (capture, approve, reconcile, attendance).
5. **Design verification** results (Phase 4 checks).
6. **Defects:** `Bug #n — severity · screen · steps to reproduce · expected vs actual · screenshot`.
7. **Verdict:** Is Neev safe to keep on `main`, or are there blockers? List the must-fix items.

Save all screenshots under `/tmp/qa_neev/` and reference them by path. Do not mutate the seed DB beyond normal app actions. End with a one-paragraph honest summary.
