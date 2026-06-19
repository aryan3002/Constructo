# Chat Phase B — Foundations (UX completion + determinism gates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the visible offline-first UX (delivery ticks + tap-to-retry) and land the deterministic safety gates Phase B's intelligence layer depends on (contested-truth freeze, voice-money read-back, system-notice rendering).

**Architecture:** Build on the merged Phase A spine — the durable outbox, cursor receipts, `sender_kind`/`meta` columns, and the `EventDispute` rails all already exist. The mobile work renders data the `useChatThread` hook already computes (`deliveryState`, `pending`); the backend work hardens the reply/approval send-path with the dispute check and stamps voice-money events for human read-back. No schema changes — every column is already in prod.

**Tech Stack:** Backend FastAPI + async SQLAlchemy (pytest, run with `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest`, lint `uv run ruff check .`). Mobile Expo/React Native + the homeowner ("Calm Cockpit") and contractor ("Blueprint") design systems (`npm run typecheck && npx jest`).

**Branch:** `feat/chat-phase-b-foundations` (off `main`).

**Design source:** `docs/CHAT-RELIABILITY-DESIGN.md` §3 (intelligent layer / determinism gaps) + §7 (Phase B scope).

**Conventions** (match existing tests): backend fixtures `client`, `db_session`, `factory`, the `auth(user)` helper + `_session_factory(db_session)` from `tests/test_chat_api.py`. Mobile: pure helpers tested in `src/chat/__tests__/`; AsyncStorage is mocked per-file with `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))`.

**Scope of THIS plan (shippable on its own):** T1 delivery ticks · T2 tap-to-retry · T3 contested-truth gate · T4 system/blocked-notice rendering · T5 voice-money read-back. **Deferred to a follow-up plan** (each a subsystem of its own, per the writing-plans scope check): Nivaan in-thread constrained agent (design §C.2), publish gate v2 (design §4), perceptual-hash near-duplicate flag (design §C.3). T3 + T5 are the prerequisite safety gates those build on.

**Design-skill tasks:** T1, T2, T4 touch UI — the implementer MUST invoke `constructo-homeowner-design` (Calm Cockpit) and `constructo-contractor-design`/`constructo-design-system` (Blueprint) before styling, and use semantic theme tokens (`theme.colors`), never hardcoded colors.

---

### Task 1: Delivery ticks (✓ sent · ✓✓ delivered · ✓✓ read) in MessageBubble

**Files:**
- Modify: `src/chat/MessageView.tsx` (MessageBubble — add a `deliveryState` prop + tick glyph)
- Modify: `src/chat/MessageFeed.tsx` (thread the per-row delivery state into MessageBubble)
- Modify: `app/(homeowner)/messages/[id].tsx` (pass `thread.deliveryState` into the feed)
- Modify: `app/(contractor)/owner/chat/[id].tsx` (pass `thread.deliveryState` into the bubble)
- Test: `src/chat/__tests__/tick.test.ts` (pure tick-glyph mapping)

**Context:** The hook already computes `deliveryState(msg): 'sent' | 'delivered' | 'read' | undefined` (own messages only; `undefined` for others' messages — those get no tick). Per the design, the homeowner room is delivered-only (the server never sends read receipts there, so `read` never appears for homeowner threads — no special-casing needed client-side). Render the tick only on the caller's own (`mine`) bubbles.

- [ ] **Step 1: Write the failing test** — create `src/chat/__tests__/tick.test.ts`:

```typescript
/** Tick glyph mapping: sent=✓, delivered/read=✓✓, with read visually distinct. */
import { tickGlyph, isReadTick } from '../tick'

test('sent → single check', () => {
  expect(tickGlyph('sent')).toBe('✓')
})

test('delivered and read → double check', () => {
  expect(tickGlyph('delivered')).toBe('✓✓')
  expect(tickGlyph('read')).toBe('✓✓')
})

test('undefined (not own / no cursors) → no glyph', () => {
  expect(tickGlyph(undefined)).toBe('')
})

test('isReadTick only true for read (drives the highlight colour)', () => {
  expect(isReadTick('read')).toBe(true)
  expect(isReadTick('delivered')).toBe(false)
  expect(isReadTick('sent')).toBe(false)
  expect(isReadTick(undefined)).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/tick.test.ts`
Expected: FAIL — `Cannot find module '../tick'`

- [ ] **Step 3: Implement the pure mapping** — create `src/chat/tick.ts`:

```typescript
/** Delivery-tick presentation (Task B-T1). Pure mapping so the glyph + the
 * "read" highlight decision are unit-testable without rendering. WhatsApp-grade:
 * ✓ = sent (reached the server), ✓✓ = delivered to all recipients, ✓✓ in the
 * accent colour = read. The homeowner room is delivered-only, so 'read' simply
 * never arrives there — no special case needed. */
import type { DeliveryState } from './threadState'

export function tickGlyph(state: DeliveryState | undefined): string {
  if (state === 'sent') return '✓'
  if (state === 'delivered' || state === 'read') return '✓✓'
  return ''
}

export function isReadTick(state: DeliveryState | undefined): boolean {
  return state === 'read'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/chat/__tests__/tick.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Render the tick in MessageBubble**

Invoke the design skills first (`constructo-homeowner-design` + `constructo-contractor-design`) to confirm the tick treatment fits both themes — a small Mono glyph trailing the timestamp, muted by default, `theme.colors.accent` (or the daylight equivalent) when read.

In `src/chat/MessageView.tsx`, add `deliveryState` to the MessageBubble prop type and render the glyph beside the timestamp (own bubbles only). Replace the timestamp line:

```tsx
      {body ? <Body style={{ color: c.text }}>{body}</Body> : null}
      {timestamp ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}>
          <Mono style={{ color: c.textMute, fontSize: 11 }}>{timestamp}</Mono>
          {mine && tickGlyph(deliveryState) ? (
            <Mono
              style={{
                fontSize: 11,
                color: isReadTick(deliveryState) ? c.accent : c.textMute,
              }}
            >
              {tickGlyph(deliveryState)}
            </Mono>
          ) : null}
        </View>
      ) : null}
```

Add `deliveryState` to the destructured props and the type:

```tsx
export function MessageBubble({
  body,
  mine,
  attachmentUrl,
  timestamp,
  onLongPress,
  deliveryState,
}: {
  body: string | null
  mine: boolean
  attachmentUrl?: string | null
  timestamp?: string
  onLongPress?: () => void
  deliveryState?: DeliveryState
}) {
```

Add the imports at the top of MessageView.tsx: `import { tickGlyph, isReadTick } from './tick'` and `import type { DeliveryState } from './threadState'`.

- [ ] **Step 6: Thread the state through MessageFeed + both screens**

In `src/chat/MessageFeed.tsx`, the `MessageFeed` renders `MessageBubble` for `bubble` rows. Add an optional `deliveryStateFor?: (msg: ChatMessage) => DeliveryState | undefined` prop to MessageFeed, and pass `deliveryState={deliveryStateFor?.(row.message)}` into the MessageBubble it renders (use the row's underlying message; check the FeedRow shape in MessageFeed.tsx and pass the message it already has). Import the `DeliveryState` type.

In `app/(homeowner)/messages/[id].tsx`, pass `deliveryStateFor={thread.deliveryState}` to `<MessageFeed ... />`.

In `app/(contractor)/owner/chat/[id].tsx`, in the `renderItem` `MessageBubble` (the non-card branch), add `deliveryState={thread.deliveryState(item)}`.

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck && npx jest`
Expected: typecheck clean, full suite green (incl. the 4 new tick tests)

```bash
git add src/chat/tick.ts src/chat/__tests__/tick.test.ts src/chat/MessageView.tsx src/chat/MessageFeed.tsx "app/(homeowner)/messages/[id].tsx" "app/(contractor)/owner/chat/[id].tsx"
git commit -m "feat(mobile/chat): render delivery ticks (sent/delivered/read) on own messages"
```

---

### Task 2: Tap-to-retry for failed_permanent sends

**Files:**
- Modify: `src/chat/useChatThread.ts` (expose `retry(clientMsgId)`)
- Modify: `src/chat/__tests__/durableSend.test.ts` (test retry un-parks + re-sends)
- Modify: `app/(contractor)/owner/chat/[id].tsx` (tap the failed pending bubble → retry)
- Modify: `app/(homeowner)/messages/[id].tsx` (same affordance in the Calm Cockpit feed)

**Context:** `src/chat/outbox.ts` already has `retryPermanent(clientMsgId)` (resets a `failed_permanent` item → `queued`, `nextAttemptAt=0`) and the hook has `flush()`. The hook does NOT yet expose a single "retry this one" action. A `failed_permanent` pending bubble currently renders a "couldn't send" label but has no tap handler. Add `retry` to the hook and wire it to the pending bubble.

- [ ] **Step 1: Write the failing test** — append to `src/chat/__tests__/durableSend.test.ts`:

```typescript
test('retry un-parks a failed_permanent item and a successful drain clears it', async () => {
  await enqueueChatSend({ address: addr, body: 'x', clientMsgId: 'c1' })
  // Park it permanent (a 4xx).
  await drainChatOutbox(async () => ({ ok: false, permanent: true }))
  expect((await listChatOutbox())[0].state).toBe('failed_permanent')

  // retryPermanent flips it back to queued; a now-succeeding drain clears it.
  await retryPermanent('c1')
  expect((await listChatOutbox())[0].state).toBe('queued')
  await drainChatOutbox(async () => ({ ok: true, seq: 1 }))
  expect(await listChatOutbox()).toHaveLength(0)
})
```

Add `retryPermanent` to the existing import from `../outbox` at the top of `durableSend.test.ts` (it already imports `enqueueChatSend, drainChatOutbox, listChatOutbox`).

- [ ] **Step 2: Run test to verify it fails / passes-at-unit-level**

Run: `npx jest src/chat/__tests__/durableSend.test.ts`
Expected: PASS (this exercises the already-built `retryPermanent` + drain — it's the regression guard for the hook wiring below). If it fails, `retryPermanent` isn't exported — verify `src/chat/outbox.ts` exports it.

- [ ] **Step 3: Expose `retry` on the hook**

In `src/chat/useChatThread.ts`, import `retryPermanent` from `./outbox` (alongside the existing outbox imports), add `retry` to the `UseChatThread` interface:

```typescript
  /** Re-queue a permanently-failed send (a "tap to retry" on its bubble), then drain. */
  retry: (clientMsgId: string) => Promise<void>
```

implement it near `flush`:

```typescript
  const retry = useCallback(
    async (clientMsgId: string) => {
      await retryPermanent(clientMsgId)
      await refreshOutbox()
      await flush()
    },
    [refreshOutbox, flush],
  )
```

and add `retry` to the returned object.

- [ ] **Step 4: Wire the tap on the contractor screen**

Invoke `constructo-contractor-design` first. In `app/(contractor)/owner/chat/[id].tsx`, the `ListFooterComponent` renders pending bubbles. Make a `failed_permanent` bubble tappable to retry — wrap it in a Pressable and show a retry affordance:

```tsx
                {thread.pending.map((p) =>
                  p.state === 'failed_permanent' ? (
                    <Pressable key={p.clientMsgId} onPress={() => void thread.retry(p.clientMsgId)}>
                      <MessageBubble
                        body={p.body || (p.captured ? '📎' : '')}
                        mine
                        timestamp={str.tapRetry}
                      />
                    </Pressable>
                  ) : (
                    <MessageBubble
                      key={p.clientMsgId}
                      body={p.body || (p.captured ? '📎' : '')}
                      mine
                      timestamp={str.sendingHint}
                    />
                  ),
                )}
```

Add `tapRetry` to the STR en/hi blocks: en `'Tap to retry'`, hi `'फिर भेजने के लिए टैप करें'`.

- [ ] **Step 5: Wire the tap on the homeowner screen**

Invoke `constructo-homeowner-design` first. In `app/(homeowner)/messages/[id].tsx`, the pending rows are assembled into `pendingRows` (a `FeedRow[]`) from `thread.pending`. For a `failed_permanent` pending item, the feed row must expose an `onPress`/retry. Find how `pendingRows` maps (search `thread.pending.map`) and, for `failed_permanent`, set the row's press handler to `() => void thread.retry(p.clientMsgId)` and a "tap to retry" label. If the MessageFeed bubble row doesn't support an onPress, add an optional `onPress` to that FeedRow path (mirror the existing `onLongPress` plumbing). Keep it minimal — the goal is a tappable failed bubble that calls `thread.retry`.

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npx jest`
Expected: typecheck clean, full suite green

```bash
git add src/chat/useChatThread.ts src/chat/__tests__/durableSend.test.ts "app/(contractor)/owner/chat/[id].tsx" "app/(homeowner)/messages/[id].tsx"
git commit -m "feat(mobile/chat): tap-to-retry on permanently-failed sends"
```

---

### Task 3: Contested-truth gate in the send path (freeze approvals/corrections on a disputed event)

**Files:**
- Modify: `app/chat/router.py` (`_apply_reply_approval`, `_apply_reply_correction`, and the `send_message` handling of their outcomes)
- Test: `tests/test_chat_contested_gate.py`

**Context:** `_apply_reply_approval` (router.py) supersedes an `approval` event to "approved" for an owner/PM, and `_apply_reply_correction` supersedes a field for an authority. Neither checks whether the target event has an **open `EventDispute`**. Per the Determinism Doctrine, a contested value must FREEZE — you can't approve/overwrite it until the dispute resolves. `_contested_event_ids(session, event_ids) -> set[UUID]` already exists in router.py. The fix: if the target event is contested, block the supersede, stamp the just-created message's `meta = {"blocked": {...}}`, and return a `blocked_contested` outcome so the client renders a notice (Task 4 renders it).

- [ ] **Step 1: Write the failing test** — create `tests/test_chat_contested_gate.py`:

```python
"""Contested-truth gate: an open dispute on an event freezes approve/correct."""
from uuid import uuid4

from sqlalchemy import select

from app.extraction.worker import handle_ingested
from app.models import (
    ChatMessage,
    DisputeStatus,
    EventDispute,
    RawMessageModel,
    SiteEventModel,
    UserRole,
)
from tests.test_chat_api import _session_factory, auth


async def _approval_event(client, db_session, owner, site):
    """Send an approval-type capture so a 'approval' SiteEvent exists, return it."""
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "approve cement payment",
            "capture_type": "approval",
            "fields": {"status": "pending", "amount": 50000},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    raw = (await db_session.execute(select(RawMessageModel))).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))
    event = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "approval")
        )
    ).scalars().first()
    return resp.json(), event


async def test_approval_blocked_while_event_disputed(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    card_msg, event = await _approval_event(client, db_session, owner, site)
    assert event is not None

    # Open a dispute on that event.
    db_session.add(
        EventDispute(
            company_id=company.id,
            site_id=site.id,
            event_id=event.id,
            raised_by=owner.id,
            raised_by_role=owner.role.value,
            reason="value looks wrong",
            status=DisputeStatus.open,
        )
    )
    await db_session.flush()

    # Reply "haan theek hai" (approve) to the card → must be BLOCKED, not approved.
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": card_msg["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    # The reply message is stamped blocked, and NO superseding approval was written.
    stored = await db_session.get(ChatMessage, out["id"])
    assert stored.meta is not None and stored.meta.get("blocked", {}).get("reason") == "contested"
    approvals = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.event_type == "approval",
                SiteEventModel.version == 2,
            )
        )
    ).scalars().all()
    assert approvals == []  # no v2 approval — the value is frozen


async def test_approval_allowed_when_not_disputed(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    card_msg, event = await _approval_event(client, db_session, owner, site)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": card_msg["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    stored = await db_session.get(ChatMessage, resp.json()["id"])
    assert stored.meta is None  # not blocked
    v2 = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.event_type == "approval", SiteEventModel.version == 2
            )
        )
    ).scalars().first()
    assert v2 is not None and v2.fields.get("status") == "approved"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_contested_gate.py -v`
Expected: FAIL — `test_approval_blocked_while_event_disputed` fails (a v2 approval IS written; `stored.meta` is None)

- [ ] **Step 3: Add the dispute check to the approval + correction helpers**

In `app/chat/router.py`, add a small guard helper near `_contested_event_ids`:

```python
async def _event_contested(session: AsyncSession, event_id: UUID) -> bool:
    """True iff the event has an OPEN dispute (a frozen, money-safe value)."""
    return bool(await _contested_event_ids(session, [event_id]))
```

In `_apply_reply_approval`, after resolving `event` and confirming it's an `approval` the user may approve, BEFORE building the superseding event, add:

```python
    if await _event_contested(session, event.id):
        return {"action": "blocked_contested", "dispute": "open", "event_id": str(event.id)}
```

In `_apply_reply_correction`, in the authority branch (where it builds the superseding `SiteEventModel`), BEFORE building it add the same guard:

```python
    if user.role in _CORRECTION_AUTHORITY:
        if await _event_contested(session, event.id):
            return {"action": "blocked_contested", "field": changed_key, "event_id": str(event.id)}
        superseding = SiteEventModel(...)  # unchanged
```

(A non-authority correction already raises a dispute — leave that path unchanged.)

- [ ] **Step 4: Stamp the message + handle the outcome in send_message**

In `send_message`, where the correction/approval outcomes are handled (the `correction = await _apply_reply_correction(...)` and `approval = await _apply_reply_approval(...)` branches), set `msg.meta` when blocked, before the commit. Change each branch to:

```python
    correction = await _apply_reply_correction(session, user, body.reply_to_id, body.body)
    if correction is not None:
        if correction.get("action") == "blocked_contested":
            msg.meta = {"blocked": {"reason": "contested", "event_id": correction["event_id"]}}
        await session.commit()
        await session.refresh(msg)
        return ChatMessageOut.model_validate(msg)
```

```python
    approval = await _apply_reply_approval(session, user, body.reply_to_id, body.body)
    if approval is not None:
        if approval.get("action") == "blocked_contested":
            msg.meta = {"blocked": {"reason": "contested", "event_id": approval["event_id"]}}
        await session.commit()
        await session.refresh(msg)
        return ChatMessageOut.model_validate(msg)
```

Then add `meta` to `ChatMessageOut` so the client receives it: add the field to the `ChatMessageOut` model:

```python
    # Machine payload (e.g. {"blocked": {...}}) — drives a system/blocked notice
    # in the client; never rendered as free text.
    meta: dict | None = None
```

(The `ChatMessage` ORM model already has the `meta` column from the Phase A spine migration, so `model_validate` picks it up.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_contested_gate.py tests/test_chat_api.py tests/test_disputes.py -v`
Expected: PASS (new gate tests + existing chat/dispute tests unaffected). Then `uv run ruff check .`.

- [ ] **Step 6: Commit**

```bash
git add app/chat/router.py tests/test_chat_contested_gate.py
git commit -m "feat(chat): freeze approve/correct on a disputed event (contested-truth gate) + meta.blocked"
```

---

### Task 4: Render system + blocked notices (sender_kind=system / meta.blocked)

**Files:**
- Modify: `src/api/chat.ts` (add `sender_kind` + `meta` to the `ChatMessage` type)
- Create: `src/chat/systemNotice.ts` (pure: derive a notice line from a message)
- Test: `src/chat/__tests__/systemNotice.test.ts`
- Modify: `src/chat/MessageView.tsx` (a `SystemNotice` centered row) + `src/chat/MessageFeed.tsx` (render system rows) OR the two screens' renderers
- Modify: `app/(contractor)/owner/chat/[id].tsx` + `app/(homeowner)/messages/[id].tsx` (render the notice)

**Context:** Task 3 stamps a reply message with `meta.blocked`. The design also wants `sender_kind=system` rows (member added, dispute resolved) rendered as calm centered notices rather than bubbles. This task adds a pure "what notice should this message show?" helper and a minimal centered renderer, used by both screens. Keep it small — a centered muted line.

- [ ] **Step 1: Write the failing test** — create `src/chat/__tests__/systemNotice.test.ts`:

```typescript
/** systemNotice: derive a centered notice line (or null) from a message. */
import { systemNotice } from '../systemNotice'
import type { ChatMessage } from '../../api/chat'

const base = { id: 'm1', seq: 1, conversation_id: 'c', sender_id: 'u', sender_side: 'contractor', media_type: 'text', created_at: '', body: null } as unknown as ChatMessage

test('a blocked-contested message yields the freeze notice', () => {
  const m = { ...base, meta: { blocked: { reason: 'contested' } } } as ChatMessage
  expect(systemNotice(m)).toMatch(/disputed/i)
})

test('a sender_kind=system message shows its body as the notice', () => {
  const m = { ...base, sender_kind: 'system', body: 'Asha was added to the group' } as ChatMessage
  expect(systemNotice(m)).toBe('Asha was added to the group')
})

test('an ordinary user message has no notice', () => {
  expect(systemNotice(base)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/systemNotice.test.ts`
Expected: FAIL — `Cannot find module '../systemNotice'`

- [ ] **Step 3: Add the type fields + the pure helper**

In `src/api/chat.ts`, add to the `ChatMessage` interface:

```typescript
  sender_kind?: 'user' | 'nivaan' | 'system'
  meta?: { blocked?: { reason?: string; event_id?: string } } | null
```

Create `src/chat/systemNotice.ts`:

```typescript
/** Derive a centered system-notice line from a message, or null for an ordinary
 * bubble (Task B-T4). A blocked-contested reply shows the freeze reason; a
 * sender_kind=system row shows its body verbatim. Pure + testable. */
import type { ChatMessage } from '../api/chat'

export function systemNotice(m: ChatMessage): string | null {
  if (m.meta?.blocked?.reason === 'contested') {
    return "Can't approve — this value is disputed. Resolve the dispute first."
  }
  if (m.sender_kind === 'system') {
    return m.body ?? ''
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/chat/__tests__/systemNotice.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Render the notice**

Invoke both design skills. Add a `SystemNotice` component to `src/chat/MessageView.tsx` — a centered, muted, small row (no bubble chrome):

```tsx
export function SystemNotice({ text }: { text: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACE.xs, paddingHorizontal: SPACE.lg }}>
      <Small muted style={{ textAlign: 'center' }}>{text}</Small>
    </View>
  )
}
```

In `app/(contractor)/owner/chat/[id].tsx`'s `renderItem`, BEFORE the card/bubble branches, short-circuit on a system notice:

```tsx
          renderItem={({ item }) => {
            const notice = systemNotice(item)
            if (notice) return <SystemNotice text={notice} />
            const cardEvents = ...  // unchanged
```

In `app/(homeowner)/messages/[id].tsx`, the feed is assembled into `items` (FeedRow[]). Where messages become bubble rows, route a message with `systemNotice(m) !== null` to a system row instead (mirror the existing custom-row handling in the feed assembly; render it via `SystemNotice`). Keep it minimal — a system message renders centered, not as a bubble.

Add imports: `import { systemNotice } from '../../../../src/chat/systemNotice'` (adjust depth per screen) and `SystemNotice` from MessageView.

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npx jest`
Expected: typecheck clean, full suite green

```bash
git add src/api/chat.ts src/chat/systemNotice.ts src/chat/__tests__/systemNotice.test.ts src/chat/MessageView.tsx "app/(contractor)/owner/chat/[id].tsx" "app/(homeowner)/messages/[id].tsx"
git commit -m "feat(mobile/chat): render system + blocked-contested notices as centered rows"
```

---

### Task 5: Voice-money read-back gate (server-enforced)

**Files:**
- Modify: `app/extraction/worker.py` (`handle_ingested` — stamp voice money/quantity events `needs_clarification=True`)
- Test: `tests/test_voice_money_gate.py`

**Context:** Per the design, a money/quantity event extracted from a VOICE transcript must always land `needs_clarification=True` regardless of confidence — the human read-back confirm (which re-submits as a typed `capture_type`+`fields` commit at confidence 1.0) is the only way voice money becomes settled truth. The client read-back exists; this makes it un-bypassable server-side. The worker already computes `needs_clarification=ev.needs_clarification or from_homeowner` per event — add the voice-money condition.

- [ ] **Step 1: Write the failing test** — create `tests/test_voice_money_gate.py`:

```python
"""Voice-money read-back: a money/quantity event from a voice note always lands
needs_clarification, even at high confidence — the read-back confirm is the only
path to settled truth."""
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, SiteEventModel
from tests.test_chat_api import _session_factory


async def _voice_invoice_raw(db_session, site, *, confident: bool):
    """A voice-sourced raw message that extracts to a confident invoice event."""
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id="someone",
        media_type="voice",
        text="vendor ko pachas hazaar dena hai invoice number 57",
        sent_at=datetime.now(UTC),
        raw={"capture_type": "invoice", "fields": {"amount": 50000, "vendor": "ACC"}, "site_id": str(site.id)},
    )
    db_session.add(raw)
    await db_session.flush()
    return raw


async def test_voice_money_event_is_flagged_even_when_confident(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    raw = await _voice_invoice_raw(db_session, site, confident=True)
    # The structured fast-path books a confidence-1.0 invoice event; the gate must
    # still flag it because the source is voice.
    await handle_ingested(raw.id, _session_factory(db_session), llm=FakeLLMClient())
    ev = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "invoice_received")
        )
    ).scalars().one()
    assert ev.needs_clarification is True


async def test_voice_NON_money_event_keeps_its_confidence(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id="someone",
        media_type="voice",
        text="aaj barah mazdoor aaye",
        sent_at=datetime.now(UTC),
        raw={"capture_type": "attendance", "fields": {"headcount": 12}, "site_id": str(site.id)},
    )
    db_session.add(raw)
    await db_session.flush()
    await handle_ingested(raw.id, _session_factory(db_session), llm=FakeLLMClient())
    ev = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "attendance")
        )
    ).scalars().one()
    # Attendance from voice is cheap to fix and auto-commits — NOT gated.
    assert ev.needs_clarification is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_voice_money_gate.py -v`
Expected: FAIL — `test_voice_money_event_is_flagged_even_when_confident` fails (the confident invoice lands `needs_clarification=False`)

- [ ] **Step 3: Implement the gate in the worker**

In `app/extraction/worker.py`, near the top add the money/quantity event-type set:

```python
# Money/quantity events from a VOICE note always need a human read-back (a
# misheard 50-vs-15 is a real loss). Attendance is cheap to fix → not gated.
_VOICE_READBACK_TYPES = {"invoice_received", "payment_request", "material_delivery"}
```

In `handle_ingested`, where it computes `from_homeowner` and builds each `SiteEventModel`, add the voice-money condition. Find:

```python
        from_homeowner = (raw_row.raw or {}).get("sender_side") == "homeowner"
```

add after it:

```python
        voice_readback = raw_row.media_type == "voice"
```

and change the per-event `needs_clarification` line from:

```python
                needs_clarification=ev.needs_clarification or from_homeowner,
```

to:

```python
                needs_clarification=(
                    ev.needs_clarification
                    or from_homeowner
                    or (voice_readback and ev.event_type.value in _VOICE_READBACK_TYPES)
                ),
```

(`ev.event_type` is an `EventType` enum — use `.value` to compare against the string set, matching how it's stored. Verify against the surrounding code: the model is built with `event_type=ev.event_type.value`, so `.value` is correct.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_voice_money_gate.py tests/test_chat_api.py tests/extraction -v`
Expected: PASS (new gate tests + existing extraction/chat tests unaffected). Then `uv run ruff check .`.

- [ ] **Step 5: Commit**

```bash
git add app/extraction/worker.py tests/test_voice_money_gate.py
git commit -m "feat(extraction): voice money/quantity events always need a human read-back"
```

---

### Task 6: Full verification + PR

- [ ] **Step 1:** Backend: `uv run ruff check . && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest` — all green.
- [ ] **Step 2:** Mobile: `npm run typecheck && npx jest` — all green.
- [ ] **Step 3:** Use superpowers:finishing-a-development-branch — PR `feat/chat-phase-b-foundations` → main, body summarizing: delivery ticks, tap-to-retry, contested-truth gate, system/blocked notices, voice-money read-back. Watch CI green before merging.

---

## Deferred to the next plan (Phase B part 2 — each a subsystem of its own)

- **Nivaan in-thread** (design §C.2): `@nivaan` mention/slash → constrained agent (MAX_STEPS≈4, deterministic fast-paths first, tiered tool registry: green read/draft auto · commit→`meta.proposal` card requiring a human tap · money→evidence-bound or `missing_proof` only), replies as `sender_kind=nivaan` rows, numeric guard on every drafted digit, NO homeowner-send tool (structural membrane). Compose the existing `app/agent/` (aggregate/ask/loop) tools. This is ~6–8 TDD tasks — its own plan.
- **Publish gate v2** (design §4): `POST /chat/publish-to-homeowner` — numeric-guarded across translation variants, `meta.provenance`, publish audit log; the AI-draft → contractor edit → Send flow. Tests: digit-divergent variant blocked; raw draft never reaches the homeowner thread.
- **Perceptual near-duplicate flag** (design §C.3): pHash on image ingest, compare within a site over a window, near-match → flag the card "looks like Tuesday's challan — confirm?" (flag-for-confirm, never auto-reject).

These build on T3 (contested-truth gate) + T5 (voice-money gate) shipping first.

---

## Self-Review

**1. Spec coverage (this plan's scope):** delivery ticks → T1 ✓ · tap-to-retry → T2 ✓ · contested-truth gate → T3 ✓ · system/blocked notices → T4 ✓ · voice-money read-back → T5 ✓. The intelligence/membrane items (Nivaan, publish gate, pHash) are explicitly deferred with rationale, per the scope check — they are independent subsystems and each ships on its own.

**2. Placeholder scan:** every code step shows real code; no TBD/"handle edge cases"/"similar to Task N". The two UI-plumbing steps that depend on each screen's existing feed-row shape (T2 step 5, T4 step 5) name the exact pattern to mirror (`onLongPress` plumbing / custom-row handling) rather than leaving it open — the implementer reads the screen's feed assembly and follows it.

**3. Type consistency:** `DeliveryState` (`'sent'|'delivered'|'read'`) is the existing hook type, reused by T1's `tickGlyph`. `meta.blocked.{reason,event_id}` is written by T3 (backend) and read by T4's `systemNotice` (frontend) — shapes match. `retry(clientMsgId)` added to `UseChatThread` in T2, consumed by T2's screen wiring. `sender_kind` values (`user|nivaan|system`) match the Phase A enum. `_VOICE_READBACK_TYPES` strings match the `EventType` values stored on `SiteEventModel.event_type`.

**Known verify-at-execution points (flagged inline):** the homeowner screen's `pendingRows`/feed-row shape (T2 step 5, T4 step 5) — read the feed assembly and mirror it; `ev.event_type.value` vs string comparison (T5 step 3) — confirm against the surrounding model construction.
