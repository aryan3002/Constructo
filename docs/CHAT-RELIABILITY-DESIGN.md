# Constructo In-App Chat — Reliability & Completeness Design

**Date:** 2026-06-10 · **Author:** Fable design session (Aryan + Claude) · **Status:** Decided — ready for phased build
**Supersedes:** the vault's "win the record, rent the transport / keep chat thin" framing (12-In-App-Chat files 00–01). The current doctrine is **"own the room, bridge the edges"**: in-app chat is a first-class destination for the Crew Room (Blueprint) and the Homeowner Room (Calm Cockpit); WhatsApp is a migration/edge bridge only.
**Plan:** `docs/superpowers/plans/2026-06-10-chat-reliability.md` (Phase A in full TDD detail).
**Doctrine that still governs:** Determinism Doctrine (AI proposes, human commits; exact ₹/digits/dates from deterministic reducers + numeric guard, never the LLM), offline-first as the default, no managed chat SDK (custom extraction on every message is the moat).

---

## 0. Verified ground truth (read the code, not the summary)

What is **actually built** as of `main` @ 8edb53f — three corrections to the session brief:

1. **The "capture_type never honored" gap is CLOSED.** `extraction/extract.py` implements the full structured fast-path: `_structured_events()` books `capture_type`+`fields` verbatim (no LLM, confidence 1.0, `needs_clarification=False`), `_declared_event_type()` type-anchors free text when only `capture_type` is present (`forced_type` locks the type; classifier and LLM type-guess are ignored), and compound `raw["events"]` lists work. Vault file 17 confirms it shipped. **Phase 0 re-scopes** to what extraction actually lacks: *status tracking, retry, and live card delivery* (§B.5).
2. **No client speaks WebSocket.** The server `/api/v1/chat/ws` endpoint (router.py:1182) exists but has **zero consumers**. Mobile (`useChatThread.ts`) polls every 8s with `afterSeq: 0` — a full-thread refetch per tick. Web has no chat surface at all. Consequence: we can design WS protocol v2 **clean, with no back-compat obligation**.
3. **Push exists on both ends, wired to nothing.** `push/sender.py` (Expo, dry-run default) + `POST /me/push-token` registration + homeowner `notif_prefs` tokens are all live; chat never calls `notify_user`, and the app registers no notification-response listener.

The rest of the spine that IS solid and we build on, not redesign:

- **Ordering authority:** per-conversation gap-free `seq` (BIGINT) assigned under `SELECT … FOR UPDATE` on the conversation row (router.py:565). Clock-independent, gap-free. This stays the single source of message order forever.
- **Idempotency:** unique `(conversation_id, client_msg_id)`; a retried send returns the existing row (router.py:552).
- **Adversarial dedupe:** `media_sha256` per conversation → `duplicate_of_id`, duplicates persist but never extract (router.py:529).
- **Extraction seam:** every contentful message in a sited conversation mints `RawMessage(source="app_chat", external_group_id="app:{site_id}")` with `capture_type/fields/sender_side/reply_context` in `raw`, enqueued via RQ; `chat_messages.raw_message_id` is the bridge; cards render from `SiteEvent` rows via array-overlap on `source_message_ids` (router.py:791).
- **Two-room asymmetry:** homeowner messages auto-stamp `needs_clarification=True` (worker.py:135); homeowner role is structurally blocked from `kind=site` threads (access.py:41).
- **Honest-AI rails in-thread:** reply corrections ("45 nahi 54") supersede append-only for authority roles, raise `EventDispute` for everyone else (router.py:327); approvals are authority-gated (router.py:411); word-acks (seen|on_it|done), never emoji.
- **In-process Broadcaster** with the documented "swap body for Redis pub/sub" seam (realtime.py:9) — the public interface is already right.
- **Deploy reality:** Azure Container Apps + Neon + Upstash-style Redis already in the stack (`redis>=5.2`, RQ). ACA **replicas** (not just uvicorn workers) are the fan-out killer: two replicas with in-process broadcasters can't see each other's publishes even at 1 worker each. Redis pub/sub is mandatory before any scale-out.
- **Mobile stack:** AsyncStorage + NetInfo + expo-notifications present; a generic AsyncStorage **offline outbox already exists** (`src/offline/outbox.ts` + `useOutbox.ts` NetInfo drain) — used by captures, *not* chat. No SQLite/MMKV.

---

## 1. Decision A — Transport & delivery semantics

### Decisions

**A1. WebSocket + Redis pub/sub, layered over the existing Broadcaster.** A `RedisBroadcaster` keeps the exact `publish/subscribe` interface: `publish()` → Redis `PUBLISH chat:{conversation_id}`; one listener task per process feeds frames into the existing in-process `Broadcaster` for local fan-out. Selected by `settings.chat_realtime: "memory" | "redis"` (memory stays the default for tests/dev; redis in prod). If Redis is down, publish degrades to local-only (correct on one replica) and the client's resync covers the rest — **Redis is a transient bus; a dropped frame is never a lost message.**

**A2. Postgres stays the only ordering and durability authority.** `seq` under the row lock is the truth. WS frames are a *hint* that new data exists; the REST `after_seq` backfill is the *sync protocol*. Client renders strictly by `seq` and dedupes by `(conversation_id, seq)`/message id. Net semantics: **at-least-once notify, exactly-once apply.** We never build replay/persistence into the WS layer — that's what the DB is.

**A3. One multiplexed socket per device, not one per conversation.** The client opens `/api/v1/chat/ws?ticket=…` once and sends `sub` frames for the conversations it cares about (open thread + inbox). Server validates access per-sub with the same `can_access` rules. Since no WS client exists yet, the old per-conversation query-param contract is removed, not deprecated. Rationale: inbox liveness + receipts + battery (one radio wakeup channel), and the push-fallback presence check needs "is this *user* connected", not "is this user in this thread".

**A4. Ticket auth, not JWT-in-URL.** `POST /api/v1/chat/ws-ticket` (JWT-authed) returns a one-time ticket (Redis `SETEX`, 60s TTL, deleted on first use); the WS URL carries only the ticket. Long-lived JWTs in query strings leak via proxy/access logs; tickets don't.

**A5. Versioned frame envelope.** All frames: `{"v": 1, "type": …, …}`.
- Client→server: `sub {convs:[{id, after_seq}]}`, `unsub {conv}`, `delivered {conv, seq}`, `read {conv, seq}`, `ping`
- Server→client: `hello {user_id}`, `sub_ok {conv, last_seq}`, `msg {conv, payload: ChatMessageOut}`, `event_update {conv, message_id, events, raw_status}`, `receipt {conv, user_id, kind: delivered|read, seq}`, `pong`, `error {code}`
- On `sub` the server replies `sub_ok` with the conversation's current `last_seq` and does **not** replay history over WS; if `after_seq < last_seq` the client fetches the gap over REST. WS stays dumb; one sync path, not two.
- Heartbeat: client `ping` every 30s; server closes idle sockets at 90s. The client treats a missed `pong` as a dead socket and reconnects.

### Rejected alternatives

- **SSE / long-poll:** half-duplex — receipts/subscribe would need parallel POSTs; uvicorn already ships websockets; no win.
- **Postgres LISTEN/NOTIFY:** each worker holds a dedicated Neon connection; Neon's connection ceiling + pooler (pgbouncer transaction mode breaks LISTEN) make it a poor bus. Already adjudicated in vault file 02.
- **Redis Streams (consumer groups) for delivery guarantees:** brings persistence/ack semantics we explicitly don't want in the bus — Postgres is the outbox (§B.4). Pub/sub's fire-and-forget is the *feature*.
- **Managed chat SDK:** forbidden by doctrine (extraction-on-every-message is the moat; per-MAU billing; data egress coupling).

---

## 2. Decision B — Offline-first protocol (the part WhatsApp can't be beaten without)

> "If in-app is slower on 1 bar, habit wins and the exit fails." Offline-first is the default, not a degraded mode.

### B.1 The client outbox — durable, AsyncStorage, modeled on what already works

**Decision:** a chat-specific durable outbox in AsyncStorage (`constructo.chat.outbox`), structurally modeled on the existing `src/offline/outbox.ts` foundation, drained by the same NetInfo-aware loop. **Not** expo-sqlite/MMKV — neither is in the project; AsyncStorage already proved the pattern for captures; at ≤ a few hundred queued items it is comfortably sufficient (YAGNI; SQLite is a later optimization if profiling demands it).

Outbox item = the full idempotent send: `{client_msg_id, address, body?, reply_to_id?, capture_type?, fields?, media?: {local_uri, kind, mime}, state, attempts, next_attempt_at, created_at}`. Media sends are **two-step in one item**: (1) upload → key+sha256, persisted back onto the item, (2) send message referencing the key — so a crash between upload and send resumes at step 2, and a re-upload replays safely (same sha256 → server dedupe).

### B.2 The message state machine (per outgoing message)

```
composing ─send-tap→ queued ──network──→ sending ──HTTP 2xx (row+seq)──→ sent
                       ▲                    │
                       │            network / 5xx
                       └──── backoff ───────┘            (retry: 1s·2ⁿ + jitter, cap 5 min,
                                                          forever until sent or user-canceled)
sending ──HTTP 4xx (validation)──→ failed_permanent      (surfaced: "Couldn't send — tap for detail";
                                                          never silently dropped)
sent ──min(recipient delivered cursors) ≥ seq──→ delivered   (✓✓)
sent ──min(recipient read cursors) ≥ seq──→ read             (✓✓ highlighted / "Seen")
```

- `queued` is durable **before** optimistic render — the bubble the user sees is backed by storage, so an app kill in a dead zone never loses a message (today it does: pending lives in React state only).
- The server's HTTP response **is** the send-ack (the row with `seq`); idempotent retries land on `client_msg_id`. No new server ack machinery needed for `sent`.
- Drain triggers: app start, NetInfo reconnect, AppState→foreground, push received, post-send of any other message. FIFO per conversation (preserve user's intended order), conversations drained in parallel.

### B.3 Receipts — cursors, not per-message rows

**Decision:** extend `conversation_reads` (conceptually now the **per-member cursor pair**) with `last_delivered_seq`; compute ticks from cursors. **Do not** build per-message delivery receipt rows.

- `delivered`: client advances after persisting a message to its local cache (from WS `msg` frame or REST backfill) — via WS `delivered` frame or `POST /chat/delivered` (REST parity for poll-fallback mode). Server takes `max()`, monotonic. Valid because `seq` is gap-free and backfill is contiguous: "delivered through N" is well-defined.
- `read`: existing `POST /read` + new WS `read` frame, same cursor, same monotonic max.
- Tick computation for sender UI: `sent` = has `seq`; `delivered` = `min(last_delivered_seq over recipients) ≥ seq`; `read` = same over `last_read_seq`. Group detail (who has seen) on long-press via `GET /chat/messages/{id}/receipts` (computed from cursors + member list — no new table).
- Storage cost: O(members × conversations), not O(messages × members). Vault file 02 already adjudicated this ("don't build per-message receipts — YAGNI"); the brief asked for a per-message receipt model and this design **deliberately declines it** — word-acks (`message_acks`: seen/on_it/done) already cover the "explicit per-message human acknowledgment" need as a *feature*, and cursors cover plumbing receipts at WhatsApp fidelity.

**Receipt visibility policy (default, pending founder confirmation — Open Question 1):** full ticks inside crew/site/group rooms; in the homeowner room both sides see **delivered only, never read** (Calm Cockpit: no surveillance pressure on the homeowner; no "client saw it and didn't reply" anxiety for the contractor).

### B.4 Server-side outbox — **Postgres already is one; decision: no new table**

Gap #4 in the brief asks for a server outbox + delivery tracking. The durable store (`chat_messages` by `seq`) + per-member delivered cursor + push fallback **is** the server outbox: for any member, "what hasn't reached them" = `seq > last_delivered_seq`, and the answer to "did it reach the client?" is the cursor. Retry/backoff toward the client is the client's pull (`after_seq`) plus push nudges — not server-side per-device retry queues, which add state for zero additional guarantee on mobile networks.

### B.5 Extraction reliability (the re-scoped "Phase 0")

`raw_messages` gains `status: pending|processing|done|failed|skipped`, `attempts`, `last_error`. The worker stamps transitions; `enqueue_extraction` registers RQ `Retry(max=3, interval=[10, 60, 300])`. Terminal failure surfaces in-thread: the message renders a quiet "card pending → couldn't process · retry" affordance (`POST /chat/messages/{id}/retry-extraction`, sender or authority). When events persist, the worker **publishes an `event_update` frame** through the (Redis) broadcaster — cards appear live instead of "on the next refetch" (the current behavior per router.py:679). This is why RedisBroadcaster must land first: the RQ worker is a separate process; in-process publish can't reach the API replica's sockets.

### B.6 Sync & windowing

- Client persists per-conversation `max_seq` + a message cache (last ~200 messages) in AsyncStorage → instant offline thread open, then incremental `after_seq=max_seq` (kills today's `afterSeq: 0` full refetch).
- `GET /chat/messages` gains `before_seq` + `order=desc` for the initial newest-window load of long threads; `after_seq` remains the tail-sync path.
- Poll fallback stays (8s → with backoff) when WS can't connect — never strand a user on a network that kills sockets.

### B.7 Media on one bar

Replace API-multipart upload (`POST /chat/media`, 15MB through the app server) with **presigned PUT direct to R2** (`POST /chat/media/presign` → `{key, put_url}`, client computes sha256 locally), keeping multipart as fallback. Direct-to-R2 was the vault's design (file 02 §4) and matters exactly on weak links: no double transit, resumable by re-PUT, and the API stays out of the byte path.

---

## 3. Decision C — The intelligent layer, completed within determinism

### C.1 Identity: who speaks in the thread

`chat_messages` gains `sender_kind: user|nivaan|system` (default `user`) and `meta JSONB` (nullable). Nivaan's messages are real rows (seq-ordered, receipted, searchable) with `sender_kind=nivaan`, `sender_id=NULL`; system notices (member added, dispute resolved, publish-gate provenance) are `sender_kind=system`. `meta` carries machine payloads: proposal cards, provenance links, blocked-action notices — never rendered as free text.

### C.2 The constrained agent in-thread

- **Invocation:** explicit only — `@nivaan` mention / slash-command / card button. The agent never speaks unprompted in a room (the brief-in-thread and risk radar remain deterministic pinned surfaces, not agent utterances).
- **Loop:** MAX_STEPS≈4 over the scoped tool registry, **deterministic fast-paths first** (existing ask/ reducers answer aggregations before any LLM step), abstain-over-invent (`answerable=false` terminal; no free-text guess path).
- **Tool tiers (structural, not prompt-level):**
  - *Green (read/draft):* search, aggregate, reconcile-preview, draft text — free.
  - *Commit:* propose a card (`meta.proposal` on a nivaan message) — **a human tap commits** via the existing capture endpoints (which then ride the deterministic `capture_type`+`fields` fast-path, confidence 1.0). The agent cannot call the commit endpoint.
  - *Money:* proposals must carry bound evidence (reconcile match); with none, the only legal output is a tracked `missing_proof` decision proposal. **No auto-commit, ever.**
- **Numeric guard everywhere:** every agent-drafted string containing digits passes `numeric_guard` against its source values; a diverging variant is blocked and the deterministic rendering is served.
- **Membrane structurally enforced:** the tool registry contains **no homeowner-send tool**. Reaching the homeowner is only possible through the publish gate (§4), which requires a human Send tap. Homeowner `@ask` routes to the membrane-scoped `/homeowner/ask`, never the crew agent.

### C.3 Determinism gaps to close in the send path

- **Contested-truth enforcement (money tier):** `_apply_reply_approval` currently approves even when the target event has an **open EventDispute**. Fix: block the supersede, store the message, attach `meta.blocked = {reason: "contested", dispute_id}` and render a system notice ("Can't approve — value is disputed; resolve first"). Same check guards any future money-commit path: **contested values freeze**.
- **Voice money read-back gate, server-enforced:** any event whose source is a voice transcript (`media_type=voice`) and whose type is money/quantity-bearing (`invoice_received`, `payment_request`, `material_delivery`) is stamped `needs_clarification=True` regardless of confidence — the read-back confirm tap (which re-submits as a typed `capture_type`+`fields` commit at confidence 1.0) is the only way voice money becomes settled truth. The client gate exists; the server stamp makes it un-bypassable.
- **Perceptual near-duplicate flag (Phase B):** `media_sha256` only catches byte-identical replays. Add pHash on image ingest; near-duplicates within a site over a window flag the card "looks like Tuesday's challan — confirm?" (flag-for-confirm, never auto-reject). Vault file 11 calls this the highest-ROI integrity control not yet built.

---

## 4. Decision D — The two-room membrane (publish gate)

One legal path from Crew Room to Homeowner Room, human-gated, digit-safe:

1. **Draft side:** AI drafts live as draft objects/`meta` payloads on crew-side surfaces — *drafts are never chat_messages* and never serialize through any homeowner endpoint (the existing `PhotoOut.draft_caption` firewall pattern).
2. **Gate:** `POST /chat/publish-to-homeowner {site_id, body, source_event_id?, draft_ref?}` — caller must be contractor-side with site scope. Server: (a) runs `numeric_guard` across the canonical text and every translation variant (read-path translation stays per-reader; a digit-divergent variant is blocked → canonical served); (b) creates the homeowner-room message with `meta.provenance = {published_from_event_id, draft_ref, edited: bool}`; (c) logs the publish (who, when, what evidence) — the *fact* that an AI draft was reviewed/edited is part of the record; raw drafts are not.
3. **Homeowner → crew:** homeowner posts cross as structured items (existing Slice D path: extraction with `sender_side=homeowner` → amber `needs_clarification` events), and route/SLA-escalate — unchanged.

Asymmetric rendering stays as built: contractor sees the two-room context; the homeowner sees one calm thread — no drafts, no crew chatter, no read-receipts (§B.3 policy).

---

## 5. Decision E — WhatsApp edge bridge: off Baileys without losing the pilot

**Posture:** WhatsApp becomes a permanent *external membrane* (vendors, family, confirm-loops) — never again the primary capture surface. "Stop using Baileys" and "replace WhatsApp" are different problems; this is the first one.

1. **E1 — Cloud API inbound webhook** (`GET/POST /api/v1/ingest/cloud-webhook`): Meta handshake (`hub.verify_token`) + `X-Hub-Signature-256` HMAC validation (app secret); maps payloads → `RawMessage(source="cloud_api")`; media fetched via Graph API → R2 (bare key, sha256 computed); **`provider_message_id`** column + partial unique index `(source, provider_message_id)` makes Meta's re-deliveries idempotent (RawMessage has no dedupe today — required before any webhook source).
2. **E2 — Forward-bot capture:** a dedicated WABA number; crew/contractor *forwards* messages to it (forwarding = user-initiated → free-form replies legal within the 24h window). Same webhook; `raw.forwarded=true`. Site resolution: group JIDs via the existing `whatsapp_groups (external_group_id, source)` mapping (rebind tooling migrates rows from `source="baileys"`); 1:1 forwards resolve via a `wa_sender → default site` mapping with a one-tap bot reply ("Which site? 1️⃣ Andheri 2️⃣ Baner") when ambiguous.
3. **E3 — Decommission Baileys** for the family pilot only after 2 weeks of forward-bot parity (no capture regression). The bridge code stays in-tree, flagged pilot-only, until then. **Before any public traffic:** `--purge` the imported real Tripathi-family data and rotate the exposed Neon password (standing pre-public blocker).
4. **Outbound stays Cloud API** (already built: `bot/sender.py` `_send_cloud_api`, brief sender, vendor confirm-loop) — 24h-window rules and template costs are accepted because outbound is low-volume nudges, not conversation.

What we accept: Cloud API **cannot** silently read existing consumer groups — that capture model dies with Baileys, by design. The in-app rooms are the primary record; forwarding is the bridge for what still happens on WhatsApp.

---

## 6. Decision F — DPDP Act 2023 compliance by design

Owning chat raises the burden (Data Fiduciary). Scope for this build (full statutory horizon ~May 2027):

1. **Consent:** `consent_records` table (`user_id, policy_version, purposes JSONB, granted_at, withdrawn_at, channel`). First-run standalone, itemized notice (chat storage · AI extraction · translation · retention · who can see what), English-first with Hindi toggle. Bridged WhatsApp groups get a bot-posted notice on bind (the consent gap Baileys scraping created is exactly what we're exiting).
2. **Retention (defaults, configurable per company — Open Question 3):** raw chat media 18 months · chat messages 3 years · structured `site_events` 8 years (financial-records posture). Nightly purge job: R2 delete + DB tombstone; purges are logged.
3. **Breach (72-hour notification):** a runbook (`docs/RUNBOOK-BREACH.md`): detection → containment → DPB notification ≤72h → user notice, with named owner (founder) and contact tree; plus an `audit_log` trail on admin/data-export actions. Process, not software, at this scale.
4. **DSR v1:** manual runbook — export via existing per-site data paths; delete via the purge tooling. Self-serve portal is post-pilot.

---

## 7. Phasing — reliability spine first

> You can't have an intelligent chat that loses messages. Order: **A (spine) → B (intelligence/completeness) → C (bridge + compliance).**

**Phase A — Reliability spine** (full TDD plan in `docs/superpowers/plans/2026-06-10-chat-reliability.md`):
A0 schema migration (cursors, sender_kind/meta, raw status, provider_message_id) · A1 RedisBroadcaster · A2 WS tickets · A3 WS v2 multiplexed endpoint · A4 member resolution · A5 delivered/read cursors + receipts + windowing · A6 push fallback (presence registry + Expo, deep link) · A7 extraction status/retry/live `event_update` · A8 mobile chat outbox + state machine + ticks · A9 mobile WS client (reconnect/backoff/resubscribe) + incremental sync + cache · A10 read/delivered reporting from all screens (fixes the supervisor/owner unread bug) · A11 presigned media + resumable media sends · A12 kill-criteria metrics rollup.

**Phase B — Completeness & intelligence:** Nivaan in-thread (tiered tools, proposals via `meta`) · contested-truth send-path enforcement · server-enforced voice-money read-back · publish gate v2 (AI draft → edit → Send, numeric-guarded) · pHash near-dup flagging · group/system messages polish (sender_kind=system surfaces) · typing indicator (ephemeral WS frames; optional, last).

**Phase C — WhatsApp migration + compliance:** Cloud API webhook + dedupe + media → forward-bot + site disambiguation + group rebind → Baileys decommission (+ purge/rotate) → consent + retention + breach runbook.

**Deliberately NOT building** (adjudicated): E2E encryption (kills server-side extraction — the value prop), managed chat SDK, per-message receipt rows, message *editing* (append-only record; corrections supersede), CRDT/OT, presence beyond an online dot, a chat microservice, web chat client (deferred — Open Question 4).

---

## 8. Kill-criteria instrumentation (how we know the bet is working)

The vault's thresholds (files 00/05/10), and what this build must measure to make each falsifiable:

| Kill signal (vault) | Instrument |
|---|---|
| <40% of pilot crew sends ≥1 msg/week in-app after 6 weeks | weekly distinct senders per site ÷ active crew roster — from `chat_messages.sender_id` |
| >30% of decisions still originate in WhatsApp | decision/approval `site_events` joined to `raw_messages.source` → origin split `app_chat` vs `baileys/cloud_api` |
| Capture quality not materially better in-app | `unknown`-rate + `needs_clarification`-rate per source; correction rate (disputes + supersedes ÷ committed cards) |
| Read-back correction rate >15% (STT wedge) | voice-sourced events later corrected ÷ voice-sourced events confirmed |
| Mukadam won't open unprompted / owner <2 decisions by 7:15am | DAU-by-role before 7:15 IST; decisions committed before 7:15 |
| Chat eats >25% eng for 2 months | founder-tracked, not instrumented |
| **Reliability SLOs (new — the spine's own health)** | send→`sent` p50/p95; outbox max age; WS connected-ratio; push delivery failures; extraction `failed` count + median enqueue→done |

Implementation: one deterministic module (`app/metrics/chat_bet.py`) + nightly cron writing `bet_metrics_weekly` + an owner/admin endpoint. No analytics vendor.

---

## 9. Open questions for the founder (only the design-changing ones)

1. **Homeowner-room receipt policy.** Default chosen: delivered-only, both directions, in the homeowner room (no read receipts either way); full ticks in crew rooms. Alternative: contractor sees homeowner reads (more "intelligence", more surveillance-feel, against Calm Cockpit). **Changes:** receipt-frame filtering + homeowner UI. Default ships unless overridden.
2. **WABA readiness.** Is a verified Meta Business + WhatsApp Business number available (or when)? Gates Phase C start only — A/B are unaffected. If >4 weeks out, Baileys stays pilot-only longer and C4 (compliance) proceeds independently of E1–E3.
3. **Retention defaults** (18mo media / 3y messages / 8y financial events). Need a yes/no on the 8-year financial posture before the purge job ships (C4). Defaults proposed above.
4. **Web chat surface.** Default: deferred to its own plan after Phase B (mobile is where the crew lives; web Owner Command Center consumes the record, not the thread). Pull forward only if a pilot contractor demands desktop chat.

Everything else in this doc is decided with stated defaults — no menu.
