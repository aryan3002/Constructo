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
| `DRY_RUN`        | `false`                 | When `true`/`1`/`yes` (or `--dry-run`), logs payloads instead of POSTing.|

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

## Project structure

```
whatsapp-bridge/
├── src/
│   ├── index.ts          # entry: connect, QR, reconnect, event loop, media download
│   ├── config.ts         # env-driven config (dotenv) + DRY_RUN resolution
│   ├── mapping.ts        # PURE toRawMessage(msg) -> RawMessagePayload | null  (unit-tested)
│   ├── poster.ts         # postRawMessage(payload, opts) with dry-run support
│   ├── types.ts          # RawMessagePayload, MediaType, PosterOptions
│   ├── mapping.test.ts   # fixtures: text / image+caption / voice / document / video / null cases
│   └── poster.test.ts    # dry-run skips fetch; normal mode asserts URL + X-Ingest-Key
├── .env.example
├── .gitignore            # ignores auth/ media/ node_modules/ dist/ .env
├── package.json
└── tsconfig.json
```

`mapping.ts` is intentionally pure and I/O-free so it can be exhaustively unit
tested; media downloading lives in `index.ts`.
