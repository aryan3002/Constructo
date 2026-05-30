# Constructo WhatsApp Bridge (PILOT ONLY)

A standalone Node.js + TypeScript service that links to WhatsApp via the
[Baileys](https://github.com/WhiskeySockets/Baileys) library and streams every
**group** message to the Constructo backend's ingest endpoint
(`POST ${BACKEND_URL}/api/v1/ingest`).

It is fully standalone — it knows the backend only over HTTP. It does not import
or depend on any backend code.

---

## ⚠️ PILOT ONLY — read this first

**Baileys is an unofficial WhatsApp Web client and using it is against
WhatsApp's Terms of Service.** The linked phone number can be banned at any
time, without warning.

Shipping this is a **conscious, accepted decision for design-partner pilots
only.** It is explicitly **NOT production infrastructure.** Treat the linked
number as disposable (use a dedicated pilot SIM, not anyone's personal number).

### How this gets replaced

This bridge exists to validate the capture → extraction pipeline quickly. Once
a pilot proves value, the `source: "baileys"` capture path is retired in favour
of a ToS-compliant source. The backend ingest contract is source-agnostic
(`source` is just a string: `"baileys" | "forward_bot" | "app" | "cloud_api"`),
so swapping the capture mechanism requires **no backend changes**:

- **Official WhatsApp Cloud API** (`source: "cloud_api"`) — Meta's sanctioned
  Business API. Requires a WhatsApp Business Account and webhook setup. Group
  message capture is limited, so this is typically paired with:
- **Forward-to-bot** (`source: "forward_bot"`) — users forward relevant
  messages to an official business number; that bot posts to the same ingest
  endpoint.

When that swap happens, `media_url` also changes from a local filesystem path
(see below) to a real object-storage URL.

---

## What it does

1. **Authenticates via QR.** On first run it prints a QR code in the terminal.
   Scan it from WhatsApp on your phone (**Settings → Linked Devices → Link a
   Device**). Credentials are persisted to `./auth/` (multi-file auth state), so
   subsequent runs reconnect without re-scanning.
2. **Auto-reconnects** on disconnect, unless the device was logged out (in which
   case delete `./auth/` and re-link).
3. **Listens to GROUP chats only.** JIDs ending in `@g.us`. Direct (1:1)
   messages, status updates, and the bridge's own outgoing messages are ignored.
4. For each ingestible message it builds a `RawMessage` and POSTs it to the
   backend with the `X-Ingest-Key` header.
5. **Media** (image / voice / video / document) is downloaded via Baileys, saved
   to `${MEDIA_DIR}`, and `media_url` is set to that local path.

### Message type mapping

| Baileys message type                          | `media_type` |
| --------------------------------------------- | ------------ |
| `conversation`, `extendedTextMessage`         | `text`       |
| `imageMessage`                                | `image`      |
| `audioMessage`, `pttMessage`                  | `voice`      |
| `videoMessage`                                | `video`      |
| `documentMessage`                             | `document`   |
| reactions, polls, protocol/system, locations… | (ignored — `toRawMessage` returns `null`) |

Wrapped messages (`ephemeralMessage`, `viewOnceMessage*`,
`documentWithCaptionMessage`) are unwrapped one level before classification.

### `RawMessage` payload (POSTed body)

```json
{
  "source": "baileys",
  "external_group_id": "<group jid, e.g. 12036...@g.us>",
  "sender_id": "<participant jid>",
  "sender_name": "<pushName or null>",
  "media_type": "text|image|voice|video|document",
  "text": "<body/caption or null>",
  "media_url": "<local media path or null>",
  "media_mime": "<mime or null>",
  "sent_at": "<ISO8601 from messageTimestamp>",
  "raw": { "...": "original baileys message object" }
}
```

This matches the backend Pydantic contract in
`backend/app/contracts/events.py` exactly. The backend defaults `id` and
`received_at`, so this bridge omits them.

### About `media_url` (local path, pilot choice)

For the pilot, `media_url` is the **absolute local filesystem path** of the
saved file under `${MEDIA_DIR}`. This is intentional and acceptable because
during pilots the bridge and backend run on the same host (or share a mounted
volume), so the backend can read the file directly. When this is swapped for the
Cloud API source, `media_url` becomes a real (object-storage / signed) URL.

---

## Configuration

Copy `.env.example` to `.env` and adjust. All config is environment-driven
(loaded via `dotenv`).

| Variable         | Default                 | Purpose                                                                 |
| ---------------- | ----------------------- | ----------------------------------------------------------------------- |
| `BACKEND_URL`    | `http://localhost:8000` | Backend base URL. POSTs go to `${BACKEND_URL}/api/v1/ingest`.           |
| `INGEST_API_KEY` | _(empty)_               | Shared secret sent as `X-Ingest-Key`. Must match the backend's value.   |
| `MEDIA_DIR`      | `./media`               | Where downloaded media files are written.                               |
| `AUTH_DIR`       | `./auth`                | Where Baileys persists device credentials. **Never commit this.**       |
| `DRY_RUN`        | `false`                 | When `true`/`1`/`yes` (or `--dry-run`), logs payloads instead of POSTing/sending.|
| `BRIDGE_PORT`    | `8088`                  | Port the outbound HTTP server (`POST /send`, `GET /health`) listens on. |
| `BRIDGE_KEY`     | _(empty)_               | Shared secret required as `X-Bridge-Key` on `POST /send`. Wrong/missing → 401. |

---

## Outbound (`POST /send`)

The bridge also runs a small `node:http` server so the backend can SEND
WhatsApp messages back over the same linked socket.

| Method & path | Auth                         | Body / Response |
| ------------- | ---------------------------- | --------------- |
| `POST /send`  | `X-Bridge-Key: <BRIDGE_KEY>` | Req: `{ to, type: "text"\|"reaction", text?, react_to_message_id?, reply_to_message_id? }` → Res: `{ ok, message_id }` |
| `GET /health` | none                         | `{ ok: true, connected: <bool> }` (`connected` = live Baileys socket present) |

- **text** → `sock.sendMessage(to, { text })`; `reply_to_message_id` adds a
  quoted reply.
- **reaction** → `sock.sendMessage(to, { react: { text, key } })`; `text`
  defaults to `✅`, `react_to_message_id` is required.
- In `DRY_RUN`, `/send` LOGS the outbound message and returns
  `message_id: "dry-run:<ts>"` instead of touching WhatsApp.
- The inbound listener and `/send` share **one** socket via
  `socket-registry.ts`; when disconnected, `/health` reports
  `connected:false` and `/send` returns `502`.

---

## Running

Requires Node 20+ (uses native `fetch`).

```bash
npm install

# Type-check (no emit)
npm run typecheck

# Unit tests (vitest)
npm run test

# Dev: connect, print QR, listen. Scan the QR from your phone.
npm run dev
```

### Dry-run (no live WhatsApp link / no backend needed for the pipeline)

`DRY_RUN=true` exercises the mapping + post pipeline by logging each payload
instead of POSTing it. The bridge still attempts to link WhatsApp (and prints a
QR) — `DRY_RUN` only affects the *posting* step:

```bash
DRY_RUN=true npm run dev
# or
npm run dev -- --dry-run
```

To run the capture loop for real, scan the QR, then send a message in any
WhatsApp group the linked account is a member of; the bridge logs the mapped
`RawMessage` (dry-run) or the backend's response (normal mode).

### Build & run compiled

```bash
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

---

## Lockfile note (why `npm ci` kept breaking on CI)

**Do not regenerate `package-lock.json` with a plain `npm install` on macOS.**

The lockfile must retain the cross-platform optional-dependency nodes
`node_modules/@emnapi/core` and `node_modules/@emnapi/runtime`. These are a
**wasm fallback** pulled in transitively (via `@rolldown/binding-wasm32-wasi`,
itself reached through the dependency tree of `@whiskeysockets/baileys`). The
`@emnapi/*` nodes carry no `os`/`cpu` restriction, but their parent wasm32
binding is kept for **all** platforms — and npm, when run on **macOS/arm64**,
prunes the `@emnapi/*` child nodes out of the lockfile. That leaves a dangling
reference, so the GitHub Actions `bridge` job (`npm ci` on Linux) fails with:

```
npm error `npm ci` can only install packages when your package.json and
package-lock.json are in sync.
Missing: @emnapi/runtime@1.10.0 from lock file
Missing: @emnapi/core@1.10.0 from lock file
```

This had to be hand-fixed twice before. The lockfile committed here is the
**complete, cross-platform** version (it records the darwin / linux / win32
bindings *and* the `@emnapi/*` wasm-fallback nodes).

### If you ever need to regenerate the lockfile

Target `linux/x64` so the `@emnapi/*` nodes are retained — this still records
every platform's bindings and produces a lockfile byte-identical to the
committed one:

```bash
rm -rf node_modules package-lock.json
npm install --package-lock-only --os=linux --cpu=x64
npm install            # restore node_modules for local dev
```

Then verify before committing:

```bash
npm ci && npm run typecheck && npm test
grep -c '"node_modules/@emnapi' package-lock.json   # must print 3
```

A plain `npm install` on macOS prunes those nodes (it leaves fewer than `3` —
in practice `1`), which is the broken state that fails CI. See [`.npmrc`](.npmrc)
for the same warning at the point of use.

---

## Project structure

```
whatsapp-bridge/
├── src/
│   ├── index.ts            # entry: connect, QR, reconnect, event loop, media download; starts /send server
│   ├── config.ts           # env-driven config (dotenv) + DRY_RUN / BRIDGE_PORT / BRIDGE_KEY
│   ├── mapping.ts          # PURE toRawMessage(msg) -> RawMessagePayload | null  (unit-tested)
│   ├── poster.ts           # postRawMessage(payload, opts) with dry-run support
│   ├── sender.ts           # PURE buildSendPlan(req) + send(req, {socket, dryRun}) -> {ok, message_id}
│   ├── server.ts           # node:http server: POST /send (X-Bridge-Key auth), GET /health
│   ├── socket-registry.ts  # shares the ONE live Baileys socket between listener and /send
│   ├── types.ts            # RawMessagePayload, MediaType, PosterOptions, SendRequest, SendResult, HealthResult
│   ├── mapping.test.ts     # fixtures: text / image+caption / voice / document / video / null cases
│   ├── poster.test.ts      # dry-run skips fetch; normal mode asserts URL + X-Ingest-Key
│   ├── sender.test.ts      # request -> Baileys payload mapping (text + reaction); dry-run; no-socket
│   └── server.test.ts      # auth 401; /health; dry-run logs-not-sends; text+reaction; bad input
├── .env.example
├── .gitignore            # ignores auth/ media/ node_modules/ dist/ .env
├── package.json
└── tsconfig.json
```

`mapping.ts` is intentionally pure and I/O-free so it can be exhaustively unit
tested; media downloading lives in `index.ts`.
