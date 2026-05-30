# Constructo — End-to-End Demo (Phase C)

A fully seeded, navigable demo: the **WhatsApp → structured ledger → owner brief**
loop, plus the role apps (capture, attendance, reconcile, approvals, search,
payments, permits) on the Blueprint design system.

> WhatsApp message → `POST /api/v1/ingest` → (queue or inline) extraction →
> `site_events` → **auto-indexed for search** → owner brief, reconciliation,
> approvals, payment/permit tracking → role-specific web screens.

Two ways to drive extraction:
- **Quick (scripted demo):** `EXTRACTION_SYNC=true` → extraction runs inline on ingest. No worker/Redis needed.
- **Realistic:** run the RQ worker so ingest enqueues and the worker drains it.

---

## 0. Prerequisites
- [uv](https://docs.astral.sh/uv/), Docker, Node 20+.
- Commands assume repo root `constructo/` unless a `cd` says otherwise.

## 1. Infrastructure (Postgres + Redis)
```bash
docker compose up -d
docker compose ps        # postgres :5433, redis :6379, both healthy
```

## 2. Backend env
```bash
cp .env.example backend/.env
# In backend/.env set a demo DB name and turn on inline extraction:
#   DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo_demo
#   EXTRACTION_SYNC=true        # inline extract+index on ingest (no worker needed)
#   ENABLE_SCHEDULER=false      # we trigger sweeps manually for the demo (see §7)
docker exec constructo-postgres-1 psql -U constructo -d constructo \
  -c "CREATE DATABASE constructo_demo"
```

## 3. Install + migrate
```bash
cd backend
uv sync
uv run alembic upgrade head
```

## 4. Seed the demo company  ⭐
```bash
cd backend
uv run python -m scripts.seed_demo
```
Creates **Sunrise Builders**: an owner + one user of every role, 3 sites with
baselines, a Hindi/Hinglish spread of events (incl. an invoice that **mismatches**
a delivery), payments, two permits (one near expiry), and two decisions (one
**overdue**). Events are indexed so search works immediately. **Idempotent** —
safe to re-run.

It prints the login table:

| Role | Phone | Lands on |
|------|-------|----------|
| owner | `+919800000001` | Brief (`/owner`) |
| pm | `+919800000002` | Today (`/owner`) |
| supervisor | `+919800000003` | Capture (`/supervisor/capture`) |
| accountant | `+919800000004` | Reconcile (`/reconcile`) |
| procurement | `+919800000005` | Orders/Permits (`/reconcile`) |
| mukadam (labor_contractor) | `+919800000006` | Attendance (`/mukadam/attendance`) |

**OTP for every login is `000000`** (dev stub).

## 5. Run the stack
**API** (terminal 1):
```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
# curl -s localhost:8000/healthz -> {"status":"ok"}
```
**Worker** (terminal 2 — only if `EXTRACTION_SYNC=false`):
```bash
cd backend && uv run python -m app.queue_worker
```
**Scheduler** — off by default. To run the SLA + permit sweeps on a timer in the
API process, set `ENABLE_SCHEDULER=true` in `backend/.env` and restart the API.
For the demo we trigger them manually (§7).

**Web** (terminal 3):
```bash
cd web && npm install
printf 'VITE_API_BASE=http://localhost:8000\nVITE_USE_MOCKS=false\n' > .env.local
npm run dev      # http://localhost:5173
```
> The role screens read live data, so point the web app at the running API
> (`VITE_USE_MOCKS=false`). Log in with a seeded phone + OTP `000000`; the app
> redirects each role to its home via `GET /api/v1/auth/me/landing`.

---

## 6. The wired loop (ingest → extract → index → search)
Ingest a Hindi message into the seeded Site A group (`sunrise-site-a`):
```bash
curl -s -X POST localhost:8000/api/v1/ingest \
  -H 'Content-Type: application/json' -H 'X-Ingest-Key: dev-ingest-key' \
  -d '{
    "source":"baileys","external_group_id":"sunrise-site-a",
    "sender_id":"919800000003","sender_name":"Vikram",
    "media_type":"text","text":"Aaj 28 mazdoor aaye site par",
    "sent_at":"2026-05-29T08:30:00"
  }'
```
Extraction creates an `attendance` event **and the Phase C hook indexes it**. Find
it via search (owner token):
```bash
OWNER=$(curl -s -X POST localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"+919800000001","otp":"000000"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -X POST localhost:8000/api/v1/search -H "Authorization: Bearer $OWNER" \
  -H 'Content-Type: application/json' -d '{"q":"cement delivery"}' | python3 -m json.tool
```

## 7. Background sweeps (owner-only admin triggers)
The seed leaves one **overdue** homeowner decision and one **near-expiry** permit.
Trigger the sweeps manually (in production the scheduler runs these):
```bash
# Escalate overdue homeowner questions:
curl -s -X POST localhost:8000/api/v1/admin/run-sla-sweep   -H "Authorization: Bearer $OWNER"
# Raise expiry/renewal alerts (creates alert decisions):
curl -s -X POST localhost:8000/api/v1/admin/run-permit-sweep -H "Authorization: Bearer $OWNER"
# Backfill the search index (e.g. after bulk imports):
curl -s -X POST localhost:8000/api/v1/admin/reindex          -H "Authorization: Bearer $OWNER"
```

---

## 8. Five-minute role-by-role click-through (web)
All logins use OTP `000000`. Each role lands on its home automatically.

1. **(0:00) Owner — the Brief.** Log in `+919800000001`. The Brief leads with
   *"N things need you today"* — Site B shows a **labor-shortfall risk** (22 present
   vs a 40 baseline). Tap a risk → **EvidenceCard "show proof"** reveals the
   underlying events. The ACC invoice risk → **Hold** (creates a decision) or
   **Approve** inline. Below: the Cash / Labor / Material / Progress pulse grid.
2. **(1:30) Accountant — Reconcile.** Log in `+919800000004` → lands on Reconcile.
   The ACC row is flagged **needs approval** (invoice 120 bags vs 100 delivered,
   ~₹12,000 at risk). Open it → both sides side-by-side → **Hold payment** routes a
   decision to the owner.
3. **(2:30) Owner — Approvals.** Back as owner → `/approvals`: the held payment +
   the seeded approval are in the inbox. Approve / Reject / Assign. (Run the SLA
   sweep in §7 first to see the overdue homeowner question flip to **escalated**.)
4. **(3:15) Supervisor — Capture.** Log in `+919800000003` → Capture home: big
   📷 / 🎙 hold-to-talk CaptureBar + recent captures timeline. (Type a line or use
   the ingest curl in §6 to see a new capture appear.)
5. **(3:45) Mukadam — Attendance.** Log in `+919800000006` → today's attendance
   capture + *"proof = faster payment"* and their own payment status.
6. **(4:15) Procurement — Permits.** Log in `+919800000005` → permits checklist:
   the Building Plan Approval shows **expiring soon** (after the permit sweep in §7),
   the Fire NOC shows **stale review**.
7. **(4:40) Search.** As any role → `/search`: ask *"cement deliveries"* or *"labor
   below plan"* — every result carries evidence; off-topic queries say *"not sure"*
   rather than hallucinate.
8. **(5:00) Close.** Language toggle (en/हिन्दी) in **Settings** flips the whole UI
   and persists to the user record.

---

## 9. WhatsApp send (real delivery, optional)
`app.brief.send.send_brief` picks transport from `WHATSAPP_SEND_MODE`:

| Mode | Behavior |
|------|----------|
| `dry_run` (default) | logs, no network |
| `url` | `POST {to_phone, text}` to `WHATSAPP_SEND_URL` |
| `cloud_api` | `POST` to the WhatsApp Cloud API |

For `cloud_api` set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` in `backend/.env`.
> ⚠️ Free-form text only delivers inside the 24h customer-service window; outside it
> Meta requires a pre-approved template. The Meta test token expires every 24h — use a
> permanent System User token for a real pilot.

## 10. (Optional) WhatsApp bridge (Baileys) in dry-run
```bash
cd whatsapp-bridge && npm install
MEDIA_DIR=/abs/path/to/constructo/media \
BACKEND_URL=http://localhost:8000 INGEST_API_KEY=dev-ingest-key \
npm run dev -- --dry-run
```
The bridge and backend must point `MEDIA_DIR` at the same absolute folder so
extraction's OCR/STT can read downloaded media. `media_url` may be an absolute
path, a `file://` URI, or a bare filename (resolved against `MEDIA_DIR`).

---

## 11. The live WhatsApp bot loop — "Nivaan"

This runs the full conversational loop: a message in a WhatsApp group → a ✅
reaction, a question → an answer, the 7am brief → tap a number to act.

### Run the linked stack
1. **Bridge (Node, sends + receives)** — in `whatsapp-bridge/.env` set a shared
   `BRIDGE_KEY` and `BRIDGE_PORT=8088`, then:
   ```bash
   cd whatsapp-bridge && npm install && npm run dev   # scan the QR once to link WhatsApp
   # GET http://localhost:8088/health -> {"ok":true,"connected":true}
   ```
2. **Backend with the bot ON** — in `backend/.env`:
   ```bash
   EXTRACTION_SYNC=true
   BOT_ENABLED=true
   BOT_SEND_VIA=bridge
   BRIDGE_URL=http://localhost:8088
   BRIDGE_KEY=<same as the bridge>
   ENABLE_SCHEDULER=true        # so the 7am brief is delivered over WhatsApp
   ```
   ```bash
   cd backend && uv run uvicorn app.main:app --port 8000
   ```
3. Make sure the test WhatsApp group is mapped to a seeded site
   (`whatsapp_groups.external_group_id` = the group's JID; the seed maps
   `sunrise-site-a`).

### Click-through script
1. **Capture →** In the group, type a Hindi update: *"Aaj 32 mazdoor aaye"*. Nivaan reacts **✅** (silent, Guest Rule) and the attendance becomes a SiteEvent.
2. **Query →** Ask in the group: *"cement deliveries dikhao?"* Nivaan replies with the matching deliveries, each carrying its evidence (what · site · date). Money questions come back as a **DM**, never in the group.
3. **The 7am brief →** Trigger it now without waiting for the scheduler:
   ```bash
   curl -s -X POST localhost:8000/api/v1/bot/deliver-brief \
     -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' \
     -d '{"company_id":"<sunrise company id>"}'
   ```
   The owner gets a DM: the brief plus numbered actions ("1. Approve ACC invoice…").
4. **Reply to act →** The owner replies **`hold 1`** (or `approve`, `show proof 2`).
   Nivaan settles the **same decision** the web Approvals inbox shows — one ledger,
   either surface — and confirms. Re-replying is idempotent.

> No live WhatsApp? Set `BOT_SEND_VIA=dry_run` (the default) — every step logs the
> outbound message instead of sending, and you can drive inbound via
> `POST /api/v1/bot/handle {raw_message_id}` and `POST /api/v1/bot/reply {chat_jid,text}`.

---

## Reset the demo
Re-running the seed is idempotent. For a clean slate:
```bash
docker exec constructo-postgres-1 psql -U constructo -d constructo \
  -c "DROP DATABASE IF EXISTS constructo_demo" -c "CREATE DATABASE constructo_demo"
cd backend && uv run alembic upgrade head && uv run python -m scripts.seed_demo
```
