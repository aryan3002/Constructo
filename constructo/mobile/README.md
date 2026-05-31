# Constructo Mobile

One unified, **role-branched** Expo app. The **homeowner** branch (Daylight
theme) is built first; the **contractor** branch (Blueprint theme) is phased to
H4+ and shows a "use the web app for now" placeholder. This is the **H1
foundation**: the theme system, the component kit, auth, the role-branched
navigation, and the offline / push / i18n scaffolding — not the feature screens
(those are H2).

## Stack

- **Expo** (managed, SDK 56) + **expo-router** (file-based navigation) + TypeScript
- **TanStack Query** (server state), **expo-secure-store** (JWT), **expo-notifications** (push)
- **expo-image-picker / expo-camera / expo-file-system** (capture, H2), **AsyncStorage** (offline outbox)
- **i18n** en/hi (Devanagari-first), fonts via `@expo-google-fonts` (Anek / Hind / Spline Sans Mono)

## Run it

```bash
cd constructo/mobile
npm install                      # .npmrc pins legacy-peer-deps for the SDK 56 tree
[ -f .env ] || cp .env.example .env   # set EXPO_PUBLIC_API_BASE — never overwrite an existing .env
npx expo start                   # press 'a' for Android, 'i' for iOS, 'w' for web
```

**A phone/emulator cannot reach `localhost`** — that's the device. Point the app
at the backend with `EXPO_PUBLIC_API_BASE` (restart `expo start` after changing it):

| Where the app runs | `EXPO_PUBLIC_API_BASE` | Notes |
|--------------------|------------------------|-------|
| Android emulator   | `http://10.0.2.2:8000` | host loopback; or `adb reverse tcp:8000 tcp:8000` then use `localhost:8000` |
| iOS simulator      | `http://localhost:8000` | shares the host network |
| Physical device (Expo Go, same Wi-Fi) | `http://<LAN-IP>:8000` | find it: macOS `ipconfig getifaddr en0`, Linux `hostname -I`, Windows `ipconfig` |
| No shared LAN      | use `npx expo start --tunnel` | + LAN IP / a deployed backend |
| Deployed backend   | `https://api.yourhost.com` | |

Start the backend bound to all interfaces so the device can reach it:
`cd ../backend && [ -f .env ] || cp ../.env.example .env && EXTRACTION_SYNC=true uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`.

### Sign in

- **Homeowner:** tap *"I have a join code"* → enter the join code your builder
  minted (`POST /api/v1/homeowner/members`) + phone + OTP `000000` → lands on the
  Daylight 4-tab home.
- **Builder / staff:** phone + OTP `000000` → lands on the Blueprint placeholder.

### Dev component gallery

From the homeowner Home, tap **Component gallery** (or route `/dev/gallery`) to
see the whole kit rendered in **both** themes.

## Build an APK

EAS build (cloud), Android APK via the `preview` profile in `eas.json`:

```bash
npm install -g eas-cli          # once
eas login
eas build:configure             # writes the EAS projectId into app.json (once)
eas build -p android --profile preview
```

The `preview` profile builds an installable **APK** (`buildType: apk`) on an
internal distribution channel. Set `EXPO_PUBLIC_API_BASE` for the build via the
profile `env` (already pointed at the emulator host; change it to your deployed
backend URL before distributing).

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest (jest-expo)
```

## Layout

```
app/                       expo-router routes (the navigation tree)
  _layout.tsx              providers (Query, i18n, auth, safe-area) + font gate
  index.tsx                auth/role gate → redirect
  (auth)/                  login (phone+OTP) · join (homeowner join code)   [Daylight]
  (homeowner)/             Daylight 4-tab shell: home · photos · updates · design (+ settings)
  (contractor)/            Blueprint placeholder ("use web for now")
  dev/gallery.tsx          component kit in both themes
src/
  theme/                   tokens (ported from web theme.css) · ThemeProvider · fonts
  ui/                      the RN component kit (Button, StatusPill, EvidenceCard, …)
  api/                     types (ported) · config · client · auth
  auth/                    AuthContext (session + role)
  i18n/                    en · hi · I18nProvider (useT)
  offline/                 outbox (AsyncStorage) · useOutbox (sync-on-reconnect)
  push/                    Expo push registration + token persistence
  store/                   secure-store token storage
```

## Design system

`src/theme/tokens.ts` ports the exact **Blueprint & Daylight** token VALUES from
`web/src/ui/theme.css`. `useTheme()` exposes the active theme; each route group
wraps its tree in a `ThemeProvider` (homeowner → `daylight`, contractor →
`blueprint`). All touch targets are ≥48px. Status is always color **+ a distinct
glyph + a label**, never color alone.
