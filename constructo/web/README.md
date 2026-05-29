# Constructo Web

The owner/PM dashboard for Constructo — a window into construction sites built
on top of the FastAPI backend (`/api/v1`).

React 18 + Vite + TypeScript · TanStack Query · React Router · Tailwind CSS ·
Vitest + Testing Library.

## Quick start

```bash
cd web
npm install

# Run fully on in-memory mock data (no backend needed):
VITE_USE_MOCKS=true npm run dev
# → http://localhost:5173  (login with any phone, OTP 000000)
```

Copy `.env.example` to `.env` to set defaults instead of inline env vars:

```bash
cp .env.example .env
```

## Environment variables

| Var              | Default                 | Purpose                                                        |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| `VITE_API_BASE`  | `http://localhost:8000` | Backend base URL. Trailing slash is trimmed.                   |
| `VITE_USE_MOCKS` | _(unset → real API)_    | When `true`, the entire UI runs on in-memory mock fixtures.    |

### Run against a real backend

```bash
cd web
VITE_API_BASE=http://localhost:8000 VITE_USE_MOCKS=false npm run dev
```

The login form posts `{ phone, otp }` to `POST /api/v1/auth/login` (OTP `000000`
works on the dev backend), stores the returned JWT in `localStorage`, and sends
it as `Authorization: Bearer <token>` on every subsequent request.

The site events endpoint (`GET /api/v1/sites/{id}/events`) may not exist on the
backend yet. If it returns 404, the site detail page falls back to mock events
and shows a "Mock events" badge.

## Scripts

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Start the Vite dev server.                          |
| `npm run build`    | Typecheck (`tsc -b`) then build for production.     |
| `npm run preview`  | Preview the production build locally.               |
| `npm run test`     | Run the Vitest suite once.                          |
| `npm run test:watch` | Watch mode.                                       |

## Routes

| Route        | Page         | Description                                                                 |
| ------------ | ------------ | --------------------------------------------------------------------------- |
| `/login`     | Login        | Phone + OTP → token, redirect to dashboard.                                 |
| `/`          | Dashboard    | Today's owner brief; per-site cards, top risks first, counts, "Run brief now". |
| `/sites`     | Sites        | List of sites; click through to detail.                                     |
| `/sites/:id` | Site detail  | Event timeline with type badge, confidence, needs-clarification, evidence.  |
| `/groups`    | Groups       | WhatsApp group → site mapping form + list.                                  |

All routes except `/login` require a stored token.

## Project layout

```
web/
  src/
    api/        Typed client + React Query hooks
      types.ts  Shared API types (see below) — reusable by a future RN app
      client.ts Fetch client; mock-aware (VITE_USE_MOCKS)
      hooks.ts  TanStack Query hooks
      auth.ts   Token storage
      config.ts Env config
    components/ BriefCard, EventTimeline, Layout, RequireAuth, states
    pages/      Login, Dashboard, Sites, SiteDetail, Groups
    mocks/      In-memory fixtures
    lib/        Formatting + severity sort/colors
    test/       Vitest setup
```

## Shared API types (`src/api/types.ts`)

`Paginated<T>`, `LoginRequest`, `LoginResponse`, `Site`, `SiteStatus`,
`Risk`, `RiskSeverity`, `BriefSiteCounts`, `BriefSite`, `OwnerBriefPayload`,
`OwnerBrief`, `RunBriefRequest`, `RunBriefResponse`, `WhatsappGroup`,
`CreateWhatsappGroupRequest`, `SiteEvent`, `SiteEventType`.

These mirror the backend's snake_case JSON shapes and carry no runtime
dependencies, so a later React Native app can import the file as-is.

## Mobile

The UI is mobile-responsive (owners check on phones): a collapsible nav, single
-column layouts that expand to grids on larger screens, and touch-friendly
controls.
```
