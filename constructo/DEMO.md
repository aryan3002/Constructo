# Constructo — End-to-End Demo (Wave 2)

This walks through the full loop locally:

> WhatsApp message → `POST /api/v1/ingest` → Redis queue → extraction worker →
> `site_events` → owner morning brief → WhatsApp send → web dashboard.

Two ways to drive it:

- **Quick path (no worker, no Redis dependency):** set `EXTRACTION_SYNC=true` and extraction
  runs inline on ingest. Best for a fast scripted demo.
- **Realistic path:** run the RQ worker so ingest enqueues and the worker drains the queue.

---

## 0. Prerequisites

- [uv](https://docs.astral.sh/uv/), Docker, Node 18+ (only if you run the WhatsApp bridge).
- All commands below assume repo root `constructo/` unless a `cd` says otherwise.

## 1. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d
docker compose ps        # postgres on :5433, redis on :6379, both healthy
```

## 2. Configure env

```bash
cp .env.example backend/.env
# Ensure the DB name is constructo_wave2:
#   DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo_wave2
```

Create the Wave 2 database (once):

```bash
docker exec constructo-postgres-1 psql -U constructo -d constructo \
  -c "CREATE DATABASE constructo_wave2"
```

## 3. Install deps + migrate

```bash
cd backend
uv sync
uv run alembic upgrade head
```

## 4. Run the API

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
# health: curl -s localhost:8000/healthz  -> {"status":"ok"}
```

## 5. Run the extraction worker (realistic path)

In a second terminal:

```bash
cd backend
uv run python -m app.queue_worker
```

> Skip this if you set `EXTRACTION_SYNC=true` in `backend/.env` — extraction then runs inline
> on ingest, no worker needed.

## 6. Seed a company, site, and WhatsApp-group mapping

The extraction worker resolves a message's site by matching `(external_group_id, source)`
against a `whatsapp_groups` row. Seed via the API:

```bash
# Login (OTP stub: any phone + otp "000000"; user auto-created as owner)
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919999999999","otp":"000000"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# Create a site
SITE=$(curl -s -X POST localhost:8000/api/v1/sites \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Tower A","type":"residential"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "site=$SITE"

# Map a WhatsApp group to that site
curl -s -X POST localhost:8000/api/v1/whatsapp-groups \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"external_group_id\":\"120363-site-a@g.us\",\"source\":\"baileys\",\"site_id\":\"$SITE\",\"label\":\"Tower A crew\"}"
```

## 7. Send a sample ingest (a Hindi attendance message)

```bash
curl -s -X POST localhost:8000/api/v1/ingest \
  -H 'Content-Type: application/json' -H 'X-Ingest-Key: dev-ingest-key' \
  -d '{
    "source":"baileys",
    "external_group_id":"120363-site-a@g.us",
    "sender_id":"919999999999",
    "sender_name":"Site Supervisor",
    "media_type":"text",
    "text":"Aaj 24 mazdoor aaye site par",
    "sent_at":"2026-05-28T08:30:00"
  }'
```

The worker (or inline mode) extracts an `attendance` event (`headcount: 24`) for Tower A.
Verify:

```bash
curl -s "localhost:8000/api/v1/sites/$SITE/events?date=2026-05-28" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

## 8. Trigger a brief

Run the nightly brief builder on demand for the demo date:

```bash
cd backend
uv run python -c "
import asyncio
from datetime import date
from app.brief.schedule import run_nightly
print(asyncio.run(run_nightly(brief_date=date(2026,5,28))))
"
```

This builds one `owner_briefs` row per company for that date. The brief leads with risks,
then a per-site activity summary (attendance/deliveries/issues).

To deliver it over WhatsApp, set the send mode (see §10) and call `send_brief`.

## 9. View it in the web dashboard

```bash
cd web
npm install
npm run dev        # Vite dev server, typically http://localhost:5173
```

Point the web app at the API and turn mocks off (`web/.env`):

```
VITE_API_BASE=http://localhost:8000
VITE_USE_MOCKS=false
```

Open a site and the event timeline loads from `GET /api/v1/sites/{id}/events`. With the API
up and mocks off, it uses live data. (If the events endpoint ever 404s, the client falls back
to mock data gracefully — but in Wave 2 the endpoint is live.)

## 10. WhatsApp send setup (real delivery)

`app.brief.send.send_brief` picks transport from `WHATSAPP_SEND_MODE`:

| Mode | Behavior |
|------|----------|
| `dry_run` (default) | logs, returns `False`, no network |
| `url` | `POST {to_phone, text}` to `WHATSAPP_SEND_URL` |
| `cloud_api` | `POST` to the WhatsApp Cloud API |

For `cloud_api`, in `backend/.env`:

```bash
WHATSAPP_SEND_MODE=cloud_api
WHATSAPP_TOKEN=EAAG...                    # Bearer token
WHATSAPP_PHONE_NUMBER_ID=1094260843779305 # pilot phone_number_id
```

It posts to `https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages` with
`Authorization: Bearer <token>` and body
`{"messaging_product":"whatsapp","to":<to_phone>,"type":"text","text":{"body":<text>}}`.

> ⚠️ **24-hour window.** Free-form text only delivers if the recipient (the owner / your test
> number) messaged your WhatsApp number within the last 24h. Outside that window Meta requires
> a **pre-approved template** — a plain text send will be rejected. For the demo, message the
> test number from the owner's phone first.
>
> ⚠️ **Token expiry.** The Meta-provided test token expires every 24h. For a real pilot,
> create a permanent **System User** token.

## 11. (Optional) Run the WhatsApp bridge in dry-run

The Node bridge (Baileys) forwards real WhatsApp group messages to `/api/v1/ingest` and saves
media under a shared `MEDIA_DIR`:

```bash
cd whatsapp-bridge
npm install
# Both the bridge and the backend must point MEDIA_DIR at the SAME absolute folder so
# extraction's OCR/STT can read what the bridge downloaded, e.g.:
#   export MEDIA_DIR=/abs/path/to/constructo/media
MEDIA_DIR=/abs/path/to/constructo/media \
BACKEND_URL=http://localhost:8000 INGEST_API_KEY=dev-ingest-key \
npm run dev -- --dry-run    # logs payloads instead of needing a live WA session
```

The backend tolerates `media_url` as an absolute path, a `file://` URI, or a bare filename
(resolved against `MEDIA_DIR`).

---

## 5-minute design-partner demo script

1. **(0:00) The problem.** "Site updates live in WhatsApp groups — attendance, deliveries,
   problems — in Hindi/Hinglish. Owners can't read 200 messages a day. Constructo turns that
   chatter into a single morning brief."
2. **(0:30) Ingest a real message.** Run the curl in §7 with a Hindi line
   (`Aaj 24 mazdoor aaye`). "This is exactly what a supervisor types."
3. **(1:00) It became structured data.** Run the events curl in §7 — show the `attendance`
   event with `headcount: 24`, the right site, the right date. "No forms. The AI extracted it."
4. **(2:00) Show a mixed feed.** Ingest a delivery (`50 bori cement aa gaya`) and an issue
   (`pani ki tanki leak ho rahi hai`). Re-fetch events — three event types, auto-classified.
5. **(3:00) The morning brief.** Run §8. Read the generated brief aloud — risks first, then a
   one-line activity summary per site. "This is what lands on the owner's WhatsApp at 7am."
6. **(4:00) Delivery.** Show `cloud_api` mode config (§10) and the 24h-window caveat. If a test
   number is warmed up, send live; otherwise show the dry-run log + the exact Cloud API request.
7. **(4:30) The dashboard.** Open the web app (§9) — the same events on a timeline, with
   low-confidence items flagged for clarification. "Owners get the brief; site teams get the
   board."
8. **(5:00) Close.** "From WhatsApp noise to a structured daily brief, in the language crews
   already use — no app to learn."
