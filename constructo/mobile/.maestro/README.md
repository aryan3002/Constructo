# Maestro e2e flows — Constructo mobile (first e2e suite)

Deterministic UI flows that log in as each contractor role (and the homeowner),
walk every screen in that role's nav, and capture a screenshot per screen. Born
out of the 2026-06-10 Neev contractor QA pass — see
`constructo/docs/qa/2026-06-10-neev-contractor-qa.md`.

## Prereqs
- iOS Simulator booted with **Expo Go** installed, and the Constructo project
  **already open** in Expo Go (the flows drive UI; they do not boot the bundler).
  - Start the bundler: `cd constructo/mobile && npx expo start -c`, press `i`.
  - Backend running and reachable at the `.env` `EXPO_PUBLIC_API_BASE`
    (use `http://localhost:8000` for the simulator).
- Seeded demo DB (`uv run python -m scripts.seed_demo`), accounts below.
- Maestro installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`
  (`export PATH="$PATH:$HOME/.maestro/bin"`).

## Accounts (phone + dev OTP `000000`)
| Role        | Phone           | Lands on            |
|-------------|-----------------|---------------------|
| owner       | +919800000001   | owner/brief         |
| pm          | +919800000002   | pm/dpr              |
| supervisor  | +919800000003   | supervisor/capture  |
| accountant  | +919800000004   | accountant/reconcile|
| mukadam     | +919800000006   | mukadam/attendance  |
| homeowner   | join SUNRISE-HOME | (homeowner)/home  |

Each role flow begins by signing out (if a session is live) so it can start
from the "Who are you?" chooser — this is how a tester switches roles.

## Run
```bash
export PATH="$PATH:$HOME/.maestro/bin"
# one role:
maestro test constructo/mobile/.maestro/owner.yaml
# whole suite (runs every *.yaml except the _login subflow):
maestro test constructo/mobile/.maestro/
```
Screenshots are written to `/tmp/qa_neev/<role>_<screen>.png`.

## Files
- `_login_staff.yaml` — reusable subflow: chooser → phone → OTP → verify. Takes
  `PHONE` env. Assumes it starts from the chooser (sign out first).
- `owner.yaml`, `pm.yaml`, `supervisor.yaml`, `accountant.yaml`, `mukadam.yaml`
- `homeowner.yaml` — Calm Cockpit regression smoke (join code SUNRISE-HOME).

## Note on Expo Go launch
These flows do **not** `launchApp` Expo Go's launcher (that lands on the project
list, not our app). They assume the project is already running. If the app was
backgrounded, foreground Expo Go first. For a fully cold harness, add
`- openLink: exp://localhost:8081` at the top and a wait for the chooser.
