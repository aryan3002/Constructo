# Chat Phase B — Nivaan In-Thread (the constrained agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a crew member summon Nivaan in a crew thread (`@nivaan …` / `/nivaan …` / a card button) and get a constrained, determinism-safe reply — a grounded answer, an abstain, or a *draft card a human taps to commit* — that can never invent a number, never auto-commit, never move money without bound evidence, and never reach the homeowner.

**Architecture:** Nivaan is **not** a new brain — it composes what already ships. The answer path reuses `app/agent/loop.run_turn` (deterministic reducers first, grounded RAG fallback, abstain-over-invent). The new pieces are a **structural tiered tool registry** (`app/agent/tiers.py`: green read/draft · commit propose-only · money evidence-bound-or-missing_proof — the membrane is the *module shape*, not a prompt), a **numeric guard** that forbids any agent-drafted digit absent from its evidence (`app/agent/nivaan_guard.py`, reusing the homeowner `extract_numeric_tokens`), and an in-thread orchestrator (`app/agent/nivaan.py`) whose output is persisted as a real `sender_kind=nivaan` `chat_messages` row (seq-ordered, broadcast, receipted) via a new `post_agent_message` helper. The agent has **no commit callable** — committing a proposal is a human tap that re-rides the existing `POST /chat/messages` `capture_type`+`fields` fast-path. There is **no homeowner-send tool** anywhere in the registry: the only path to the homeowner is the human-gated publish gate (a separate plan).

**Tech Stack:** Backend FastAPI + async SQLAlchemy (pytest, run with `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest`, lint `uv run ruff check .`). Mobile Expo/React Native + the contractor "Blueprint" design system (`npm run typecheck && npx jest`).

**Branch:** `feat/chat-nivaan` (off `main`).

**Design source:** `docs/CHAT-RELIABILITY-DESIGN.md` §C.2 (the constrained agent) + §C.1 (sender_kind/meta identity) + §C.3 (the contested-truth / voice-money gates this builds on — already merged in PR #177).

**Conventions** (match existing tests): backend fixtures `client`, `db_session`, `factory`; the `auth(user)` helper and `_session_factory(db_session)` from `tests/test_chat_api.py`; the `world` fixture (company, owner, site) and `_event`/`_md` helpers from `tests/test_ask.py` / `tests/test_agent_turn.py`; `FakeLLMClient(canned=…)` from `app.extraction.llm`; `FakeEmbeddings` + `index_message` for grounded-RAG seeding. Mobile: pure helpers tested in `src/chat/__tests__/`; AsyncStorage mocked per-file.

**Determinism doctrine (non-negotiable, governs every task):** AI proposes, a human commits. Exact ₹/digits/dates come from deterministic reducers + the numeric guard — never the LLM. The contested-truth gate (`_event_contested`) and voice-money read-back gate (merged in foundations) are the rails Nivaan's money proposals sit on; do not weaken them.

**Scope of THIS plan (shippable on its own):** Nivaan in-thread, end to end — substrate (T1), structural registry (T2), numeric guard (T3), answer/abstain loop (T4), commit-tier proposal (T5), money-tier evidence binding (T6), in-thread invocation + membrane (T7), mobile rendering + confirm-tap commit (T8), verification + PR (T9). **Deferred to their own plans** (per the foundations plan's scope check): Publish Gate v2 (design §4) and pHash near-duplicate flag (design §C.3).

---

## File Structure

**Create:**
- `app/agent/tiers.py` — `ToolTier`, `Tool`, `Proposal`, the green-tool registry, and the commit/money proposal builders. The structural membrane.
- `app/agent/nivaan_guard.py` — `numbers_are_grounded(text, source_texts)`: the agent-output numeric guard (reuses `app.homeowner.numeric_guard.extract_numeric_tokens`).
- `app/agent/nivaan.py` — `parse_nivaan_invocation`, `NivaanReply`, `run_nivaan_turn` (answer), `build_proposal` (commit + money).
- `tests/agent/test_nivaan_tiers.py` · `tests/agent/test_nivaan_guard.py` · `tests/agent/test_nivaan_turn.py` · `tests/agent/test_nivaan_proposal.py` · `tests/test_chat_nivaan_inthread.py`
- Mobile: `src/chat/nivaanProposal.ts` + `src/chat/__tests__/nivaanProposal.test.ts`

**Modify:**
- `app/chat/router.py` — add `sender_kind` to `ChatMessageOut`; add `post_agent_message`; add `nivaan_propose` to `ChatSendIn`; wire invocation into `send_message`.
- `app/models/__init__.py` — ensure `SenderKind` is importable (it already is; verify).
- Mobile: `src/api/chat.ts` (extend `meta` type), `src/chat/MessageView.tsx` (`NivaanProposalCard` + nivaan answer styling), `src/chat/useChatThread.ts` (`sendProposal`), `app/(contractor)/owner/chat/[id].tsx` (renderItem routing).

---

### Task 1: Agent-message substrate — `post_agent_message` + `sender_kind` in `ChatMessageOut`

**Files:**
- Modify: `app/chat/router.py` (add `sender_kind` to `ChatMessageOut`; add `post_agent_message` helper)
- Test: `tests/test_chat_nivaan_inthread.py` (substrate tests)

**Context:** The spine migration already added the `sender_kind` (enum `user|nivaan|system`, default `user`) and `meta` (JSONB) columns to `chat_messages` (`app/models/chat.py`), but **no code path creates a non-`user` row** and `ChatMessageOut` does not yet serialize `sender_kind`. This task adds the seam Nivaan rides: a helper that mints a seq-ordered `sender_kind=nivaan|system` row (sender_id `NULL`) under the conversation row lock and broadcasts it, exactly like `send_message` does for humans (`router.py:577-610`, `:699-701`).

- [ ] **Step 1: Write the failing test** — create `tests/test_chat_nivaan_inthread.py`:

```python
"""Nivaan in-thread: the sender_kind=nivaan substrate + invocation."""
from uuid import uuid4

from sqlalchemy import select

from app.chat.router import post_agent_message
from app.models import ChatMessage, Conversation, ConversationKind, SenderKind, UserRole
from tests.test_chat_api import auth


async def _site_conv(db_session, factory, company, site):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def test_post_agent_message_mints_a_nivaan_row(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    conv = await _site_conv(db_session, factory, company, site)

    msg = await post_agent_message(
        db_session,
        conv,
        sender_kind=SenderKind.nivaan,
        body="90 bori cement.",
        meta={"nivaan": {"kind": "answer", "tool": "aggregate"}},
    )

    assert msg.sender_kind is SenderKind.nivaan
    assert msg.sender_id is None
    assert msg.seq == 1  # first row in the conversation
    assert msg.body == "90 bori cement."
    assert msg.meta == {"nivaan": {"kind": "answer", "tool": "aggregate"}}
    # The conversation's last_seq advanced.
    refreshed = await db_session.get(Conversation, conv.id)
    assert refreshed.last_seq == 1


async def test_chat_message_out_serializes_sender_kind(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["sender_kind"] == "user"  # default human row
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_nivaan_inthread.py -v`
Expected: FAIL — `ImportError: cannot import name 'post_agent_message'` (and the serialize test fails: no `sender_kind` key).

- [ ] **Step 3: Add `sender_kind` to `ChatMessageOut`**

In `app/chat/router.py`, find the `ChatMessageOut` model (around `:157`) and add the field next to `sender_side`. Import `SenderKind` at the top of the file alongside the other `app.models` imports.

```python
    sender_side: MessageSide
    # Who/what authored the row (human|nivaan|system) — drives client rendering.
    sender_kind: SenderKind
```

- [ ] **Step 4: Add the `post_agent_message` helper**

In `app/chat/router.py`, near the other module-level helpers (after `_side_for`), add. Reuse the exact seq-under-row-lock + broadcast pattern from `send_message`:

```python
async def post_agent_message(
    session: AsyncSession,
    conv: Conversation,
    *,
    sender_kind: SenderKind,
    body: str | None,
    meta: dict | None = None,
) -> ChatMessage:
    """Mint a seq-ordered nivaan/system row (sender_id NULL) and broadcast it.

    Same ordering authority as a human send: seq is assigned under a row lock on
    the conversation. These rows are real — receipted, searchable, gap-free."""
    locked = (
        await session.execute(
            select(Conversation).where(Conversation.id == conv.id).with_for_update()
        )
    ).scalar_one()
    now = datetime.now(UTC)
    seq = locked.last_seq + 1
    locked.last_seq = seq
    locked.last_message_at = now

    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=None,
        sender_side=MessageSide.contractor,
        sender_kind=sender_kind,
        client_msg_id=uuid4(),
        seq=seq,
        body=body,
        media_type="text",
        meta=meta,
    )
    session.add(msg)
    await session.flush()
    await session.commit()
    await session.refresh(msg)

    out = ChatMessageOut.model_validate(msg)
    await get_broadcaster().publish(
        conv.id,
        {"v": 1, "type": "msg", "conv": str(conv.id), "payload": out.model_dump(mode="json")},
    )
    return msg
```

(Confirm `uuid4`, `datetime`, `UTC`, `select`, `MessageSide`, `get_broadcaster` are already imported in `router.py` — they are used by `send_message`. Add `SenderKind` to the imports.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_nivaan_inthread.py tests/test_chat_api.py -v`
Expected: PASS (substrate tests + existing chat tests unaffected — `ChatMessageOut` now includes `sender_kind` for every row).

- [ ] **Step 6: Commit**

```bash
git add app/chat/router.py tests/test_chat_nivaan_inthread.py
git commit -m "feat(chat): post_agent_message substrate + sender_kind in ChatMessageOut"
```

---

### Task 2: The tiered tool registry — the structural membrane

**Files:**
- Create: `app/agent/tiers.py`
- Test: `tests/agent/test_nivaan_tiers.py`

**Context:** Per design §C.2 the tiers are **structural, not prompt-level**. Green tools are read/draft and agent-callable. Commit/money are *proposal builders* that return a `Proposal` (data) — there is **no commit callable** the agent can reach, so the agent structurally cannot book an event; a human tap does that via the existing capture endpoint. Money proposals must carry bound reconcile evidence (`matched`/`needs_approval` with both a delivery and an invoice); with none, the only legal output is a non-committable `missing_proof` decision proposal. And there is **no homeowner-send tool** in this module at all.

- [ ] **Step 1: Write the failing test** — create `tests/agent/test_nivaan_tiers.py` (also create `tests/agent/__init__.py` if the package doesn't exist):

```python
"""The tiered tool registry IS the membrane — enforced by module shape."""
from datetime import date
from uuid import uuid4

from app.agent.tiers import (
    GREEN_TOOLS,
    Proposal,
    ToolTier,
    propose_capture,
    propose_missing_proof,
    propose_money,
)
from app.reconcile.matching import (
    DeliveryEvent,
    InvoiceEvent,
    ReconcileItem,
    ReconcileStatus,
)


def _delivery(site_id, vendor="ACC", material="cement", qty=100.0):
    return DeliveryEvent(
        id=uuid4(), site_id=site_id, occurred_on=date.today(),
        vendor=vendor, material=material, quantity=qty, unit="bori",
    )


def _invoice(site_id, vendor="ACC", material="cement", qty=100.0, amount=50000.0):
    return InvoiceEvent(
        id=uuid4(), site_id=site_id, occurred_on=date.today(), vendor=vendor,
        material=material, quantity=qty, amount=amount, currency="INR", invoice_number="A1",
    )


def test_every_registered_tool_is_green():
    # The agent-callable registry contains ONLY read/draft tools — no commit/money.
    assert GREEN_TOOLS, "expected at least one green tool registered"
    assert all(t.tier is ToolTier.green for t in GREEN_TOOLS.values())


def test_no_homeowner_send_tool_exists():
    # The membrane is structural: nothing in the registry reaches the homeowner.
    assert not any("homeowner" in name.lower() for name in GREEN_TOOLS)
    assert not any("publish" in name.lower() for name in GREEN_TOOLS)


def test_propose_capture_is_a_proposal_not_a_commit():
    p = propose_capture(
        "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"},
        "50 bori cement — confirm?",
    )
    assert isinstance(p, Proposal)
    assert p.tier is ToolTier.commit
    assert p.kind == "capture"
    assert p.committable is True
    # A proposal is pure data — it carries NO committed event id.
    assert p.evidence_event_ids == []


def test_money_proposal_with_bound_evidence_is_committable():
    site_id = uuid4()
    d, i = _delivery(site_id), _invoice(site_id)
    match = ReconcileItem(
        status=ReconcileStatus.matched, vendor="ACC", item="cement", site_id=site_id,
        delivery=d, invoice=i, amount_at_risk=0.0, reasons=[],
    )
    p = propose_money(
        "approval", {"vendor": "ACC", "amount": 50000},
        "Approve ₹50,000 to ACC — delivery + invoice match.", evidence=[match],
    )
    assert p.tier is ToolTier.money
    assert p.kind == "capture"
    assert p.committable is True
    assert str(d.id) in p.evidence_event_ids and str(i.id) in p.evidence_event_ids


def test_money_proposal_without_evidence_is_missing_proof_only():
    # No bound reconcile match → the ONLY legal output is a tracked missing_proof
    # decision proposal. Never a committable money card.
    p = propose_money(
        "approval", {"vendor": "ACC", "amount": 50000},
        "Approve ₹50,000 to ACC.", evidence=[],
    )
    assert p.kind == "missing_proof"
    assert p.committable is False
    assert p.capture_type == "decision"
    assert p.evidence_event_ids == []


def test_missing_proof_is_not_committable():
    p = propose_missing_proof("payment_request", {"amount": 9000}, "No bill on file.")
    assert p.committable is False
    assert p.capture_type == "decision"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_tiers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.agent.tiers'`.

- [ ] **Step 3: Implement `app/agent/tiers.py`**

```python
"""Nivaan's tiered tool registry — the STRUCTURAL membrane (design §C.2).

Tiers are enforced by types and module shape, NOT by prompt instructions:
  - green : read/draft. Pure, side-effect-free; the agent loop may call these.
  - commit: a card the agent PROPOSES; a HUMAN taps to commit via the existing
            capture endpoint. There is no commit callable here — the builders
            return a Proposal (data); they never persist a SiteEvent.
  - money : a commit proposal that MUST carry bound reconcile evidence; with
            none, the only legal output is a tracked missing_proof decision
            proposal — never a committable money card.

There is deliberately NO homeowner-send / publish tool in this module. Reaching
the homeowner is only possible through the human-gated publish gate (design §4)."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum

from app.reconcile.matching import ReconcileItem, ReconcileStatus

# A proposal of one of these capture types is "money tier".
MONEY_CAPTURE_TYPES = {"invoice_received", "payment_request", "approval"}


class ToolTier(StrEnum):
    green = "green"    # read/draft — free, agent-callable
    commit = "commit"  # proposes a card; a human commits it (the agent cannot)
    money = "money"    # commit + must carry bound evidence, else missing_proof only


@dataclass(frozen=True)
class Tool:
    """An agent-callable read/draft tool. Only GREEN tools live in the registry."""

    name: str
    tier: ToolTier
    run: Callable[..., Awaitable[object]]


@dataclass
class Proposal:
    """A draft card Nivaan emits for a HUMAN to commit — never a committed event."""

    tier: ToolTier              # commit | money
    kind: str                   # "capture" | "missing_proof"
    capture_type: str           # what the human-tap commit will book
    fields: dict                # committed verbatim via the capture fast-path
    summary: str                # human line; numeric-guarded against `fields`
    evidence_event_ids: list[str] = field(default_factory=list)
    committable: bool = True    # False for missing_proof (nothing to tap-commit)

    def as_meta(self) -> dict:
        """The meta.proposal payload carried on a sender_kind=nivaan row."""
        return {
            "proposal": {
                "tier": self.tier.value,
                "kind": self.kind,
                "capture_type": self.capture_type,
                "fields": self.fields,
                "summary": self.summary,
                "evidence_event_ids": self.evidence_event_ids,
                "committable": self.committable,
            }
        }


# --- Green tool registry (agent-callable read/draft only) ---------------------

GREEN_TOOLS: dict[str, Tool] = {}


def green_tool(name: str) -> Callable[[Callable[..., Awaitable[object]]], Callable[..., Awaitable[object]]]:
    """Register a read/draft tool. Tier is fixed to green — a commit/money
    callable can never enter this registry."""

    def deco(fn: Callable[..., Awaitable[object]]) -> Callable[..., Awaitable[object]]:
        GREEN_TOOLS[name] = Tool(name=name, tier=ToolTier.green, run=fn)
        return fn

    return deco


@green_tool("reconcile_preview")
async def reconcile_preview(deliveries, invoices, *, window_days: int = 7):
    """Read-only: derive delivery-vs-invoice reconciliation rows. No writes."""
    from app.reconcile.matching import reconcile

    return reconcile(deliveries, invoices, window_days=window_days)


# --- Proposal builders (commit / money) — return data, never persist ----------


def propose_capture(capture_type: str, fields: dict, summary: str) -> Proposal:
    """Commit-tier (non-money) proposal: a draft card a human taps to commit."""
    return Proposal(
        tier=ToolTier.commit, kind="capture", capture_type=capture_type,
        fields=fields, summary=summary,
    )


def propose_missing_proof(capture_type: str, fields: dict, summary: str) -> Proposal:
    """A tracked decision card: 'no bound proof — get the challan/bill first'.
    Not committable as money; a human acting on it books a `decision`, not money."""
    return Proposal(
        tier=ToolTier.money, kind="missing_proof", capture_type="decision",
        fields={"about": capture_type, "reason": "missing_proof", **fields},
        summary=summary, evidence_event_ids=[], committable=False,
    )


def propose_money(
    capture_type: str, fields: dict, summary: str, *, evidence: list[ReconcileItem]
) -> Proposal:
    """Money-tier proposal. Requires bound reconcile evidence (a matched /
    needs_approval row carrying BOTH a delivery and an invoice). With none, the
    only legal output is a missing_proof decision proposal (design §C.2)."""
    bound = [
        it
        for it in evidence
        if it.status in (ReconcileStatus.matched, ReconcileStatus.needs_approval)
        and it.delivery is not None
        and it.invoice is not None
    ]
    if not bound:
        return propose_missing_proof(capture_type, fields, summary)
    evidence_ids: list[str] = []
    for it in bound:
        evidence_ids.append(str(it.delivery.id))
        evidence_ids.append(str(it.invoice.id))
    return Proposal(
        tier=ToolTier.money, kind="capture", capture_type=capture_type,
        fields={**fields, "evidence_event_ids": evidence_ids},
        summary=summary, evidence_event_ids=evidence_ids, committable=True,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_tiers.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/agent/tiers.py tests/agent/__init__.py tests/agent/test_nivaan_tiers.py
git commit -m "feat(agent): Nivaan tiered tool registry (structural membrane) + proposal builders"
```

---

### Task 3: The numeric guard — Nivaan never emits a digit absent from its evidence

**Files:**
- Create: `app/agent/nivaan_guard.py`
- Test: `tests/agent/test_nivaan_guard.py`

**Context:** Design §C.2: "every agent-drafted string containing digits passes `numeric_guard` against its source values; a diverging variant is blocked." The homeowner `numeric_guard(canonical, translated)` is *multiset-equality* (for translation parity). Nivaan's need is subtly different and stricter-in-spirit: an agent answer may legitimately mention a subset of source numbers, but must **never introduce a number not present in its evidence**. So Nivaan's guard is a **subset check** over the same `extract_numeric_tokens` tokenizer (commas stripped, dates/₹ normalized) — reuse it, don't reinvent it.

- [ ] **Step 1: Write the failing test** — create `tests/agent/test_nivaan_guard.py`:

```python
"""Nivaan numeric guard: an agent string may never introduce an ungrounded digit."""
from app.agent.nivaan_guard import numbers_are_grounded


def test_text_without_digits_always_passes():
    assert numbers_are_grounded("Delivery looks fine — no issues.", []) is True


def test_every_drafted_number_present_in_evidence_passes():
    assert numbers_are_grounded(
        "₹45,000 across 2 invoices.",
        ["invoice for 45000 rupees", "2 invoices recorded"],
    ) is True


def test_comma_grouping_is_normalized():
    # 45,000 and 45000 are the same token (reuses extract_numeric_tokens).
    assert numbers_are_grounded("₹45,000 billed.", ["amount 45000"]) is True


def test_an_invented_number_is_blocked():
    # The LLM said 450000 but the record only has 45000 → ungrounded → blocked.
    assert numbers_are_grounded("₹450,000 billed.", ["amount 45000"]) is False


def test_no_evidence_with_a_digit_is_blocked():
    assert numbers_are_grounded("90 bori cement.", []) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_guard.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.agent.nivaan_guard'`.

- [ ] **Step 3: Implement `app/agent/nivaan_guard.py`**

```python
"""Nivaan's output numeric guard (design §C.2).

Stricter-in-spirit than the homeowner translation guard: a Nivaan string may
mention a SUBSET of its evidence's numbers, but must never INTRODUCE a number
absent from the evidence. Same tokenizer as the homeowner guard (commas stripped,
₹/dates normalized) — reused, not reinvented. No network, no LLM."""
from __future__ import annotations

from app.homeowner.numeric_guard import extract_numeric_tokens


def numbers_are_grounded(text: str, source_texts: list[str]) -> bool:
    """True iff every numeric token in ``text`` appears in the union of numeric
    tokens across ``source_texts``. Digit-free text always passes."""
    drafted = set(extract_numeric_tokens(text))
    if not drafted:
        return True
    allowed: set[str] = set()
    for s in source_texts:
        allowed |= set(extract_numeric_tokens(s))
    return drafted <= allowed
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_guard.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/agent/nivaan_guard.py tests/agent/test_nivaan_guard.py
git commit -m "feat(agent): Nivaan numeric guard (no ungrounded digit) reusing extract_numeric_tokens"
```

---

### Task 4: The constrained answer loop — `run_nivaan_turn` (deterministic-first, abstain-over-invent, guarded)

**Files:**
- Create: `app/agent/nivaan.py` (the orchestrator; this task adds `parse_nivaan_invocation`, `NivaanReply`, `run_nivaan_turn`)
- Test: `tests/agent/test_nivaan_turn.py`

**Context:** The answer path **reuses** `run_turn` (`app/agent/loop.py`) — deterministic reducers first (`tool="aggregate"`, numbers from `_phrase`, safe by construction), grounded RAG fallback (`tool="grounded_qa"`, LLM-authored text), abstain to `clarify` otherwise. `run_turn` already logs exactly one `AgentTurn` row and enforces scope (it computes visible sites server-side; a `site_id` the user can't see → clarify, never widens). Nivaan wraps this and adds the **numeric guard on LLM-authored text**: if a grounded answer contains a digit not grounded in its evidence rows, downgrade to a safe abstain. `MAX_STEPS` lives in `run_turn`'s loop; Nivaan adds no extra LLM steps.

- [ ] **Step 1: Write the failing test** — create `tests/agent/test_nivaan_turn.py`:

```python
"""Nivaan answer loop: deterministic-first, abstain-over-invent, numeric-guarded."""
from datetime import date
from uuid import uuid4

from app.agent.nivaan import NivaanReply, parse_nivaan_invocation, run_nivaan_turn
from app.extraction.llm import FakeLLMClient
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    MessageSide,
    SiteEventModel,
    UserRole,
)
from app.search.embeddings import FakeEmbeddings
from app.search.index_message import index_message


def _md(site_id, material, qty, unit="bori"):
    return SiteEventModel(
        site_id=site_id, event_type="material_delivery", occurred_on=date.today(),
        summary="material_delivery",
        fields={"material": material, "quantity": qty, "unit": unit},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


async def _site_conv(db_session, company, site, owner):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


def test_parse_invocation_strips_mention_and_slash():
    assert parse_nivaan_invocation("@nivaan how much cement?") == "how much cement?"
    assert parse_nivaan_invocation("/nivaan how much cement?") == "how much cement?"
    assert parse_nivaan_invocation("  @Nivaan  totals ") == "totals"
    assert parse_nivaan_invocation("just chatting") is None
    assert parse_nivaan_invocation(None) is None


async def test_deterministic_answer_is_grounded_by_construction(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add_all([_md(site.id, "cement", 50, "bori"), _md(site.id, "cement", 40, "bag")])
    await db_session.flush()

    reply = await run_nivaan_turn(db_session, owner, conv, "how much cement", llm=None)
    assert isinstance(reply, NivaanReply)
    assert "90" in reply.body  # 50 bori + 40 bag canonicalized
    assert reply.meta["nivaan"]["tool"] == "aggregate"


async def test_unanswerable_abstains_without_inventing(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    # No events, no llm → terminal clarify; never a fabricated number.
    reply = await run_nivaan_turn(db_session, owner, conv, "how much cement", llm=None)
    assert reply.meta["nivaan"]["kind"] == "clarify"
    assert not any(ch.isdigit() for ch in reply.body)


async def test_grounded_answer_with_hallucinated_number_is_blocked(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    msg = ChatMessage(
        conversation_id=conv.id, sender_id=owner.id, sender_side=MessageSide.contractor,
        client_msg_id=uuid4(), seq=1,
        body="the vendor billed forty five thousand for cement", media_type="text",
    )
    db_session.add(msg)
    await db_session.flush()
    await index_message(db_session, msg.id, client=FakeEmbeddings())
    await db_session.flush()

    # The LLM hallucinates a number that is NOT in the evidence → guard blocks it.
    llm = FakeLLMClient(canned={"grounded": True, "answer": "They billed ₹450,000 for cement."})
    reply = await run_nivaan_turn(db_session, owner, conv, "what did the vendor bill?", llm=llm)
    assert reply.meta["nivaan"].get("tool") == "guard_blocked"
    assert "450,000" not in reply.body and "450000" not in reply.body
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_turn.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.agent.nivaan'`.

- [ ] **Step 3: Implement `app/agent/nivaan.py` (parse + answer loop)**

```python
"""Nivaan in-thread: the constrained agent (design §C.2).

Invocation is explicit only (@nivaan / /nivaan / a card button). The answer path
reuses run_turn (deterministic reducers first, grounded RAG fallback, abstain-
over-invent) and adds the output numeric guard on LLM-authored text. The proposal
path (build_proposal, Task 5/6) emits a draft card a HUMAN commits — Nivaan never
commits, never moves money without bound evidence, never reaches the homeowner."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select

from app.agent.loop import run_turn
from app.agent.nivaan_guard import numbers_are_grounded
from app.extraction.llm import LLMClient
from app.models import ChatMessage, Conversation, SiteEventModel, User
from sqlalchemy.ext.asyncio import AsyncSession

_MENTION = re.compile(r"^\s*[@/]nivaan\b[:,]?\s*", re.IGNORECASE)


def parse_nivaan_invocation(body: str | None) -> str | None:
    """Return the utterance with the leading @nivaan/ /nivaan mention stripped,
    or None when the message does not summon Nivaan. Explicit-invocation only —
    Nivaan never speaks unprompted."""
    if not body:
        return None
    if not _MENTION.match(body):
        return None
    return _MENTION.sub("", body).strip()


@dataclass
class NivaanReply:
    """What Nivaan says. The chat layer persists this as a sender_kind=nivaan row."""

    body: str
    meta: dict | None = field(default=None)


def _has_digit(text: str) -> bool:
    return any(ch.isdigit() for ch in text)


async def _evidence_texts(session: AsyncSession, ids: list[str]) -> list[str]:
    """Numeric-bearing text for the evidence the grounded answer cited (events +
    messages; grounded evidence_event_ids mixes both)."""
    uuids: list[UUID] = []
    for i in ids:
        try:
            uuids.append(UUID(i))
        except (ValueError, AttributeError):
            continue
    if not uuids:
        return []
    texts: list[str] = []
    events = (
        await session.execute(select(SiteEventModel).where(SiteEventModel.id.in_(uuids)))
    ).scalars().all()
    for e in events:
        texts.append(e.summary or "")
        texts.append(" ".join(str(v) for v in (e.fields or {}).values()))
    msgs = (
        await session.execute(select(ChatMessage).where(ChatMessage.id.in_(uuids)))
    ).scalars().all()
    for m in msgs:
        texts.append(m.body or "")
    return texts


async def run_nivaan_turn(
    session: AsyncSession,
    user: User,
    conv: Conversation,
    utterance: str,
    *,
    llm: LLMClient | None = None,
) -> NivaanReply:
    """One constrained answer turn, scoped to the conversation's site. Reuses
    run_turn (which audits + enforces scope); guards LLM-authored numbers."""
    result = await run_turn(session, user, utterance, site_id=conv.site_id, llm=llm)
    text = result.text

    # Numeric guard: an LLM-authored answer may never introduce an ungrounded
    # digit. Deterministic (aggregate) answers are safe by construction.
    if result.tool == "grounded_qa" and _has_digit(text):
        allowed = await _evidence_texts(session, result.evidence_event_ids)
        if not numbers_are_grounded(text, allowed):
            return NivaanReply(
                body="I can't verify those numbers from the site record — please check with your team.",
                meta={"nivaan": {"kind": "clarify", "tool": "guard_blocked"}},
            )

    return NivaanReply(
        body=text,
        meta={
            "nivaan": {
                "kind": result.kind.value,
                "tool": result.tool,
                "evidence_event_ids": result.evidence_event_ids,
            }
        },
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_turn.py -v`
Expected: PASS (4 tests). If `index_message`/`FakeEmbeddings` import paths differ, confirm against `tests/test_agent_turn.py`'s grounded test (it uses `app.search.embeddings.FakeEmbeddings` + `app.search.index_message.index_message`).

- [ ] **Step 5: Commit**

```bash
git add app/agent/nivaan.py tests/agent/test_nivaan_turn.py
git commit -m "feat(agent): run_nivaan_turn answer loop (deterministic-first, abstain, numeric-guarded)"
```

---

### Task 5: Commit-tier proposal — draft a capture card a human taps to commit

**Files:**
- Modify: `app/agent/nivaan.py` (add `ProposalRequest` + `build_proposal`, non-money branch)
- Test: `tests/agent/test_nivaan_proposal.py`

**Context:** A card button / slash form sends a `capture_type` + `fields` and asks Nivaan to *propose* (not commit). For a non-money capture type, Nivaan drafts a `summary` line, numeric-guards it against the fields, and returns a `commit`-tier `Proposal` carried as `meta.proposal`. **No `SiteEvent` is created** — committing is the human's later tap (which re-rides `POST /chat/messages` with `capture_type`+`fields`). This task proves the agent cannot commit: after `build_proposal`, the site has zero events.

- [ ] **Step 1: Write the failing test** — create `tests/agent/test_nivaan_proposal.py`:

```python
"""Nivaan proposals: the agent drafts a card; a HUMAN commits. No auto-commit."""
from datetime import date
from uuid import uuid4

from sqlalchemy import func, select

from app.agent.nivaan import ProposalRequest, build_proposal
from app.models import Conversation, ConversationKind, SiteEventModel, UserRole


async def _site_conv(db_session, company, site, owner):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _event_count(db_session, site_id) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(SiteEventModel).where(SiteEventModel.site_id == site_id)
    )


async def test_non_money_proposal_drafts_a_commit_card_without_committing(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)

    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori", "vendor": "ACC"},
    )
    reply = await build_proposal(db_session, owner, conv, req)

    p = reply.meta["proposal"]
    assert p["tier"] == "commit"
    assert p["capture_type"] == "material_delivery"
    assert p["fields"]["quantity"] == 50
    assert p["committable"] is True
    # Structural proof: the agent committed NOTHING — the site has no events.
    assert await _event_count(db_session, site.id) == 0


async def test_proposal_summary_is_numeric_guarded(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori"},
    )
    reply = await build_proposal(db_session, owner, conv, req)
    # The drafted summary mentions only grounded numbers (50), never an invented one.
    summary = reply.meta["proposal"]["summary"]
    assert "50" in summary
    assert "500" not in summary
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_proposal.py -v`
Expected: FAIL — `ImportError: cannot import name 'ProposalRequest'`.

- [ ] **Step 3: Add `ProposalRequest` + `build_proposal` (non-money branch) to `app/agent/nivaan.py`**

Add the imports at the top of `app/agent/nivaan.py`:

```python
from app.agent.tiers import MONEY_CAPTURE_TYPES, Proposal, propose_capture
from app.models import AgentResultKind, AgentTurn
```

Add the request type and the builder (after `run_nivaan_turn`):

```python
@dataclass
class ProposalRequest:
    """A card-button / slash request asking Nivaan to DRAFT (not commit) a card."""

    capture_type: str
    fields: dict


def _draft_summary(capture_type: str, fields: dict) -> str:
    """A deterministic, human-readable draft line built from the fields — numbers
    come straight from `fields`, so the guard always passes by construction."""
    qty = fields.get("quantity")
    unit = fields.get("unit", "")
    material = fields.get("material", capture_type.replace("_", " "))
    vendor = fields.get("vendor")
    amount = fields.get("amount")
    if amount is not None:
        head = f"₹{amount}"
        if vendor:
            head += f" to {vendor}"
    elif qty is not None:
        head = f"{qty} {unit} {material}".strip()
        if vendor:
            head += f" from {vendor}"
    else:
        head = material
    return f"{head} — confirm to log it?"


async def _log_proposal_turn(session: AsyncSession, user: User, conv: Conversation, summary: str) -> None:
    """One audit row per proposal (mirrors run_turn's AgentTurn discipline)."""
    session.add(
        AgentTurn(
            company_id=user.company_id, actor_id=user.id, site_id=conv.site_id,
            utterance=summary[:2000], result_kind=AgentResultKind.cards,
            tool="propose", model="deterministic", token_cost=0,
        )
    )
    await session.commit()


async def build_proposal(
    session: AsyncSession, user: User, conv: Conversation, req: ProposalRequest
) -> NivaanReply:
    """Draft a card a human commits. Non-money → a commit-tier capture proposal.
    Money (Task 6) → evidence-bound or missing_proof. The agent never commits."""
    summary = _draft_summary(req.capture_type, req.fields)
    # Guard the drafted line against the field values (defense-in-depth; the
    # deterministic _draft_summary is grounded by construction).
    source = [str(v) for v in req.fields.values()]
    if _has_digit(summary) and not numbers_are_grounded(summary, source):
        summary = "Confirm to log this?"  # strip ungrounded digits, never invent

    if req.capture_type in MONEY_CAPTURE_TYPES:
        proposal = await _build_money_proposal(session, user, conv, req, summary)  # Task 6
    else:
        proposal: Proposal = propose_capture(req.capture_type, req.fields, summary)

    await _log_proposal_turn(session, user, conv, summary)
    return NivaanReply(body=proposal.summary, meta=proposal.as_meta())
```

> **Note for Task 6:** `_build_money_proposal` is referenced here but defined in Task 6. To keep this task green in isolation, add a minimal stub now that handles only the non-money path correctly — i.e. guard the call: in this task, `req.capture_type` is never a money type in the tests, so the `_build_money_proposal` branch is not exercised. Add a placeholder that raises `NotImplementedError` and is replaced in Task 6, OR (cleaner) reorder so Task 5 defines `_build_money_proposal` returning `propose_missing_proof` and Task 6 fills in the reconcile logic. **Chosen approach:** define a minimal `_build_money_proposal` now that returns `propose_money(req.capture_type, req.fields, summary, evidence=[])` (→ missing_proof), so Task 5 is fully green; Task 6 replaces its body with the reconcile-binding version and adds the money tests.

Add the minimal version now:

```python
async def _build_money_proposal(
    session: AsyncSession, user: User, conv: Conversation, req: ProposalRequest, summary: str
) -> Proposal:
    """Money tier (filled in Task 6). Minimal: no evidence yet → missing_proof."""
    from app.agent.tiers import propose_money

    return propose_money(req.capture_type, req.fields, summary, evidence=[])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_proposal.py tests/agent/test_nivaan_turn.py -v`
Expected: PASS (non-money proposal drafts a card, commits nothing; summary numeric-guarded).

- [ ] **Step 5: Commit**

```bash
git add app/agent/nivaan.py tests/agent/test_nivaan_proposal.py
git commit -m "feat(agent): commit-tier proposals (draft card, human commits; agent commits nothing)"
```

---

### Task 6: Money tier — evidence-bound proposal vs missing_proof

**Files:**
- Modify: `app/agent/nivaan.py` (replace `_build_money_proposal` body with reconcile-binding logic)
- Test: append to `tests/agent/test_nivaan_proposal.py`

**Context:** A money proposal (`invoice_received`/`payment_request`/`approval`) must carry **bound reconcile evidence** — a `matched`/`needs_approval` row pairing a delivery and an invoice for the site. Nivaan queries the site's delivery+invoice events (`latest_event_clause()`), converts them with the same `_to_delivery`/`_to_invoice` shape `app/reconcile/router.py` uses, runs `reconcile`, filters to the proposed vendor, and calls `propose_money`. With no binding match, the result is a non-committable `missing_proof` decision proposal. **No auto-commit, ever** — even a perfectly matched proposal is still just a card a human taps.

- [ ] **Step 1: Write the failing test** — append to `tests/agent/test_nivaan_proposal.py`:

```python
def _md_event(site_id, vendor="ACC", material="cement", qty=100.0):
    return SiteEventModel(
        site_id=site_id, event_type="material_delivery", occurred_on=date.today(),
        summary="material_delivery",
        fields={"vendor": vendor, "material": material, "quantity": qty, "unit": "bori"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


def _inv_event(site_id, vendor="ACC", material="cement", qty=100.0, amount=50000.0):
    return SiteEventModel(
        site_id=site_id, event_type="invoice_received", occurred_on=date.today(),
        summary="invoice_received",
        fields={"vendor": vendor, "material": material, "quantity": qty,
                "amount": amount, "currency": "INR", "invoice_number": "A1"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


async def test_money_proposal_binds_reconcile_evidence(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add_all([_md_event(site.id), _inv_event(site.id)])  # a matching pair
    await db_session.flush()

    req = ProposalRequest(
        capture_type="approval", fields={"vendor": "ACC", "amount": 50000, "status": "pending"}
    )
    reply = await build_proposal(db_session, owner, conv, req)
    p = reply.meta["proposal"]
    assert p["tier"] == "money"
    assert p["kind"] == "capture"
    assert p["committable"] is True
    assert len(p["evidence_event_ids"]) == 2  # the delivery + the invoice
    # Still NOT committed — the site has only the 2 source events, no approval.
    assert await _event_count(db_session, site.id) == 2


async def test_money_proposal_without_proof_is_missing_proof(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add(_inv_event(site.id))  # an invoice, but NO delivery to bind it
    await db_session.flush()

    req = ProposalRequest(
        capture_type="payment_request", fields={"vendor": "ACC", "amount": 50000}
    )
    reply = await build_proposal(db_session, owner, conv, req)
    p = reply.meta["proposal"]
    assert p["kind"] == "missing_proof"
    assert p["committable"] is False
    assert p["capture_type"] == "decision"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_proposal.py -v`
Expected: FAIL — `test_money_proposal_binds_reconcile_evidence` fails (the minimal stub always returns missing_proof, so `tier` is money but `kind` is "missing_proof" / `evidence_event_ids` is empty).

- [ ] **Step 3: Replace `_build_money_proposal` with the reconcile-binding version**

In `app/agent/nivaan.py`, add imports:

```python
from app.common.site_events import latest_event_clause
from app.reconcile.matching import DeliveryEvent, InvoiceEvent
from app.agent.tiers import propose_money
```

Add the converters + the real money builder (replace the minimal stub from Task 5):

```python
def _to_delivery(e: SiteEventModel) -> DeliveryEvent:
    f = e.fields or {}
    return DeliveryEvent(
        id=e.id, site_id=e.site_id, occurred_on=e.occurred_on, vendor=f.get("vendor"),
        material=f.get("material"), quantity=_as_float(f.get("quantity")),
        unit=f.get("unit"), summary=e.summary,
    )


def _to_invoice(e: SiteEventModel) -> InvoiceEvent:
    f = e.fields or {}
    return InvoiceEvent(
        id=e.id, site_id=e.site_id, occurred_on=e.occurred_on, vendor=f.get("vendor"),
        material=f.get("material"), quantity=_as_float(f.get("quantity")),
        amount=_as_float(f.get("amount")), currency=f.get("currency"),
        invoice_number=f.get("invoice_number"), summary=e.summary,
    )


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


async def _build_money_proposal(
    session: AsyncSession, user: User, conv: Conversation, req: ProposalRequest, summary: str
) -> Proposal:
    """Money tier: bind reconcile evidence for the site, or missing_proof."""
    rows = (
        await session.execute(
            select(SiteEventModel).where(
                SiteEventModel.site_id == conv.site_id,
                SiteEventModel.event_type.in_(["material_delivery", "invoice_received"]),
                latest_event_clause(),
            )
        )
    ).scalars().all()
    deliveries = [_to_delivery(e) for e in rows if e.event_type == "material_delivery"]
    invoices = [_to_invoice(e) for e in rows if e.event_type == "invoice_received"]

    from app.reconcile.matching import reconcile

    items = reconcile(deliveries, invoices)
    vendor = req.fields.get("vendor")
    if vendor:
        items = [it for it in items if (it.vendor or "").lower() == str(vendor).lower()]
    return propose_money(req.capture_type, req.fields, summary, evidence=items)
```

(Confirm `conv.site_id` is non-`None` here — a money proposal is only built in a sited conversation; Task 7's invocation guard ensures Nivaan never runs in a site-less group for money. If `site_id` is `None`, `reconcile([], [])` returns `[]` → missing_proof, which is the safe outcome.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/agent/test_nivaan_proposal.py -v`
Expected: PASS (4 tests — bound-evidence + missing_proof + the 2 from Task 5).

- [ ] **Step 5: Commit**

```bash
git add app/agent/nivaan.py tests/agent/test_nivaan_proposal.py
git commit -m "feat(agent): money-tier proposals — evidence-bound via reconcile, else missing_proof"
```

---

### Task 7: In-thread invocation — wire Nivaan into `send_message` (explicit-only, membrane)

**Files:**
- Modify: `app/chat/router.py` (`ChatSendIn` gains `nivaan_propose`; `send_message` detects invocation, skips extraction for trigger messages, posts the Nivaan reply, never reaches the homeowner room)
- Test: append to `tests/test_chat_nivaan_inthread.py`

**Context:** Invocation is explicit only: a free-text `@nivaan …` answer request, or `nivaan_propose=true` with `capture_type`+`fields` (the card button). Nivaan runs **only** in crew rooms (`site`/`group`); in a `homeowner` conversation `@nivaan` is ignored (the homeowner's `@ask` is a separate membrane-scoped surface — design §C.2). A Nivaan failure must never fail the human's send (best-effort, like extraction). The trigger message is not itself a capture, so it skips extraction.

- [ ] **Step 1: Write the failing test** — append to `tests/test_chat_nivaan_inthread.py`:

```python
async def _site_id_conv(db_session, company, site):
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    return conv


async def test_at_nivaan_in_crew_thread_yields_a_nivaan_reply_row(client, db_session, factory):
    from datetime import date

    from app.models import SiteEventModel

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    db_session.add(
        SiteEventModel(
            site_id=site.id, event_type="material_delivery", occurred_on=date.today(),
            summary="md", fields={"material": "cement", "quantity": 90, "unit": "bori"},
            confidence=1.0, needs_clarification=False, source_message_ids=[],
        )
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "@nivaan how much cement"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    # The human row came back; a separate nivaan row was minted + broadcast.
    nivaan_rows = (
        await db_session.execute(
            select(ChatMessage).where(ChatMessage.sender_kind == SenderKind.nivaan)
        )
    ).scalars().all()
    assert len(nivaan_rows) == 1
    assert "90" in (nivaan_rows[0].body or "")


async def test_plain_message_does_not_summon_nivaan(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "morning all"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    n = await db_session.scalar(
        select(func.count()).select_from(ChatMessage).where(ChatMessage.sender_kind == SenderKind.nivaan)
    )
    assert n == 0


async def test_at_nivaan_in_homeowner_room_is_ignored(client, db_session, factory):
    """The crew agent never reaches the homeowner room (structural membrane)."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner)
    db_session.add(conv)
    await db_session.flush()
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": str(conv.id), "client_msg_id": str(uuid4()), "body": "@nivaan how much cement"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    n = await db_session.scalar(
        select(func.count()).select_from(ChatMessage).where(ChatMessage.sender_kind == SenderKind.nivaan)
    )
    assert n == 0


async def test_nivaan_propose_returns_a_proposal_card(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id), "client_msg_id": str(uuid4()),
            "nivaan_propose": True, "capture_type": "material_delivery",
            "fields": {"material": "cement", "quantity": 50, "unit": "bori"},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["sender_kind"] == "nivaan"
    assert out["meta"]["proposal"]["capture_type"] == "material_delivery"
    # The proposal committed nothing.
    from app.models import SiteEventModel

    n = await db_session.scalar(
        select(func.count()).select_from(SiteEventModel).where(SiteEventModel.site_id == site.id)
    )
    assert n == 0
```

Add `func` to the imports at the top of the test file: `from sqlalchemy import func, select`.

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_nivaan_inthread.py -v`
Expected: FAIL — no nivaan rows are minted (invocation not wired); `nivaan_propose` is rejected as an unknown field.

- [ ] **Step 3: Add `nivaan_propose` to `ChatSendIn`**

In `app/chat/router.py`, in `ChatSendIn` (around `:94`), add:

```python
    # Ask Nivaan to DRAFT a card from this capture_type+fields instead of
    # committing it — the response is a sender_kind=nivaan proposal a human taps.
    nivaan_propose: bool = False
```

- [ ] **Step 4: Wire invocation into `send_message`**

In `app/chat/router.py`, add imports near the top:

```python
from app.agent.nivaan import (
    ProposalRequest,
    build_proposal,
    parse_nivaan_invocation,
    run_nivaan_turn,
)
from app.extraction.llm import get_llm_client
```

**(a) The proposal path — short-circuit early.** After the conversation is resolved and `require_access` passes, but before the human message is created, add:

```python
    # Nivaan proposal request (a card button): draft a card, don't commit. Crew
    # rooms only — never the homeowner room.
    if body.nivaan_propose and conv.kind is not ConversationKind.homeowner and user.role is not UserRole.homeowner:
        if not body.capture_type or body.fields is None:
            raise AppError(422, "bad_proposal", "nivaan_propose needs capture_type and fields")
        reply = await build_proposal(
            session, user, conv, ProposalRequest(capture_type=body.capture_type, fields=body.fields)
        )
        nivaan_msg = await post_agent_message(
            session, conv, sender_kind=SenderKind.nivaan, body=reply.body, meta=reply.meta
        )
        out = ChatMessageOut.model_validate(nivaan_msg)
        return out
```

**(b) The mention path — after the human send commits.** First compute the invocation near where `body.body` is first available:

```python
    nivaan_utterance = parse_nivaan_invocation(body.body)
    summons_nivaan = (
        nivaan_utterance is not None
        and conv.kind is not ConversationKind.homeowner
        and user.role is not UserRole.homeowner
    )
```

Then guard extraction so a Nivaan trigger is not booked as a capture — wrap the existing `RawMessage` creation block (`router.py:661-687`) so it only runs when `not summons_nivaan` (a trigger message has no capture intent):

```python
    raw = None
    if not summons_nivaan and <existing condition that mints raw>:
        raw = RawMessageModel( ... )  # unchanged body
```

(Preserve the existing condition that already decides whether to mint a RawMessage — just AND it with `not summons_nivaan`.)

Finally, after the existing `await get_broadcaster().publish(...)` of the human message and `_push_offline_members(...)`, before `return out`, add the best-effort Nivaan turn:

```python
    if summons_nivaan:
        try:
            reply = await run_nivaan_turn(
                session, user, conv, nivaan_utterance, llm=get_llm_client()
            )
            await post_agent_message(
                session, conv, sender_kind=SenderKind.nivaan, body=reply.body, meta=reply.meta
            )
        except Exception:  # noqa: BLE001 — a Nivaan failure must never fail the human send
            logger.exception("nivaan in-thread turn failed")
    return out
```

(Confirm a module `logger` exists in `router.py`; if not, add `logger = logging.getLogger(__name__)` with `import logging` at the top.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_nivaan_inthread.py tests/test_chat_api.py tests/agent -v`
Expected: PASS (invocation in crew rooms, ignored in homeowner room + plain messages, proposal card returned; existing chat/agent tests unaffected). Then `uv run ruff check .`.

- [ ] **Step 6: Commit**

```bash
git add app/chat/router.py tests/test_chat_nivaan_inthread.py
git commit -m "feat(chat): summon Nivaan in-thread (@nivaan answer + nivaan_propose card); crew rooms only"
```

---

### Task 8: Mobile — render Nivaan answer rows + proposal cards, with a human Confirm-tap commit

**Files:**
- Modify: `src/api/chat.ts` (extend the `meta` type to include `proposal`)
- Create: `src/chat/nivaanProposal.ts` (pure: derive a proposal view from a message) + `src/chat/__tests__/nivaanProposal.test.ts`
- Modify: `src/chat/MessageView.tsx` (`NivaanProposalCard` + nivaan-answer styling)
- Modify: `src/chat/useChatThread.ts` (`sendProposal` — the Confirm tap reuses the durable outbox capture path)
- Modify: `app/(contractor)/owner/chat/[id].tsx` (renderItem routes nivaan rows)

**Context:** Nivaan replies arrive as `sender_kind:'nivaan'` rows. An *answer* row (`meta.nivaan`) renders as a labeled "Nivaan" bubble (left-aligned, distinct from human bubbles). A *proposal* row (`meta.proposal`) renders a card with the draft summary + fields and a **Confirm** button that commits via the existing capture path (`enqueueChatSend` with `capture_type`+`fields` → `POST /chat/messages`, the deterministic fast-path) — and a **Dismiss**. A `missing_proof` proposal (`committable:false`) renders the decision/"get proof" line with no Confirm. **Invoke `constructo-contractor-design` / `constructo-design-system` before styling; use semantic theme tokens (`theme.colors`), never hex.**

- [ ] **Step 1: Write the failing test** — create `src/chat/__tests__/nivaanProposal.test.ts`:

```typescript
/** nivaanProposal: derive a proposal/answer view (or null) from a message. */
import { nivaanProposal, isNivaanAnswer } from '../nivaanProposal'
import type { ChatMessage } from '../../api/chat'

const base = {
  id: 'm1', seq: 1, conversation_id: 'c', sender_id: null, sender_side: 'contractor',
  media_type: 'text', created_at: '', body: null, events: [],
} as unknown as ChatMessage

test('a committable proposal row yields a confirmable proposal view', () => {
  const m = {
    ...base, sender_kind: 'nivaan',
    meta: { proposal: { tier: 'commit', kind: 'capture', capture_type: 'material_delivery',
      fields: { material: 'cement', quantity: 50, unit: 'bori' }, summary: '50 bori cement — confirm?',
      evidence_event_ids: [], committable: true } },
  } as ChatMessage
  const p = nivaanProposal(m)
  expect(p).not.toBeNull()
  expect(p!.committable).toBe(true)
  expect(p!.captureType).toBe('material_delivery')
  expect(p!.fields.quantity).toBe(50)
})

test('a missing_proof proposal is not committable', () => {
  const m = {
    ...base, sender_kind: 'nivaan',
    meta: { proposal: { tier: 'money', kind: 'missing_proof', capture_type: 'decision',
      fields: {}, summary: 'No bill on file.', evidence_event_ids: [], committable: false } },
  } as ChatMessage
  expect(nivaanProposal(m)!.committable).toBe(false)
})

test('a nivaan answer row is an answer, not a proposal', () => {
  const m = { ...base, sender_kind: 'nivaan', body: '90 bori cement.', meta: { nivaan: { kind: 'answer' } } } as ChatMessage
  expect(nivaanProposal(m)).toBeNull()
  expect(isNivaanAnswer(m)).toBe(true)
})

test('an ordinary user message is neither', () => {
  const m = { ...base, sender_kind: 'user', body: 'hi' } as ChatMessage
  expect(nivaanProposal(m)).toBeNull()
  expect(isNivaanAnswer(m)).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/nivaanProposal.test.ts`
Expected: FAIL — `Cannot find module '../nivaanProposal'`.

- [ ] **Step 3: Extend the `meta` type + add the pure helper**

In `src/api/chat.ts`, extend the `ChatMessage.meta` type:

```typescript
  meta?: {
    blocked?: { reason?: string; event_id?: string }
    nivaan?: { kind?: string; tool?: string; evidence_event_ids?: string[] }
    proposal?: {
      tier: 'commit' | 'money'
      kind: 'capture' | 'missing_proof'
      capture_type: string
      fields: Record<string, unknown>
      summary: string
      evidence_event_ids: string[]
      committable: boolean
    }
  } | null
```

Create `src/chat/nivaanProposal.ts`:

```typescript
/** Pure: derive a Nivaan proposal view (or null) and detect answer rows (T-Nivaan).
 * Keeps the screen renderers dumb and unit-testable. */
import type { ChatMessage } from '../api/chat'

export interface NivaanProposalView {
  summary: string
  captureType: string
  fields: Record<string, unknown>
  committable: boolean
  tier: 'commit' | 'money'
  kind: 'capture' | 'missing_proof'
}

export function nivaanProposal(m: ChatMessage): NivaanProposalView | null {
  const p = m.meta?.proposal
  if (m.sender_kind !== 'nivaan' || !p) return null
  return {
    summary: p.summary,
    captureType: p.capture_type,
    fields: p.fields,
    committable: p.committable,
    tier: p.tier,
    kind: p.kind,
  }
}

export function isNivaanAnswer(m: ChatMessage): boolean {
  return m.sender_kind === 'nivaan' && !m.meta?.proposal
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/chat/__tests__/nivaanProposal.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `sendProposal` to the hook**

Invoke `constructo-contractor-design` first. In `src/chat/useChatThread.ts`, add `sendProposal` to the `UseChatThread` interface and implement it (mirrors `send`, but routes `captureType`+`fields` through the durable outbox — `enqueueChatSend` already supports them):

```typescript
  /** Commit a Nivaan proposal: a human tap that books the capture via the
   * deterministic fast-path (capture_type+fields). The agent never calls this. */
  sendProposal: (captureType: string, fields: Record<string, unknown>) => Promise<void>
```

```typescript
  const sendProposal = useCallback(
    async (captureType: string, fields: Record<string, unknown>) => {
      await enqueueChatSend({
        clientMsgId: newClientMsgId(),
        address: addrToBody(addressRef.current),
        captureType,
        fields,
      })
      await refreshOutbox()
      void flush()
    },
    [refreshOutbox, flush],
  )
```

Add `sendProposal` to the returned object.

- [ ] **Step 6: Add `NivaanProposalCard` + nivaan-answer styling to MessageView**

Invoke `constructo-contractor-design` / `constructo-design-system` first. In `src/chat/MessageView.tsx`, add a `NivaanProposalCard` (left-aligned, a "Nivaan" header label, the summary, key fields, a Confirm button when `committable`, a Dismiss):

```tsx
export function NivaanProposalCard({
  view,
  onConfirm,
  onDismiss,
}: {
  view: NivaanProposalView
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: c.surface,
      borderColor: c.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACE.md, gap: SPACE.sm }}>
      <Small style={{ color: c.accent }}>Nivaan · proposal</Small>
      <Body style={{ color: c.text }}>{view.summary}</Body>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {view.committable ? (
          <Pressable onPress={onConfirm} style={{ backgroundColor: c.accent, paddingVertical: SPACE.xs,
            paddingHorizontal: SPACE.md, borderRadius: RADIUS.sm }}>
            <Small style={{ color: c.onAccent }}>Confirm</Small>
          </Pressable>
        ) : null}
        <Pressable onPress={onDismiss} style={{ paddingVertical: SPACE.xs, paddingHorizontal: SPACE.md }}>
          <Small muted>Dismiss</Small>
        </Pressable>
      </View>
    </View>
  )
}
```

(Match the actual token names in the contractor theme — `accent`/`onAccent`/`surface`/`border`/`RADIUS`/`SPACE` as the design skill specifies; do not hardcode hex. Import `NivaanProposalView` from `./nivaanProposal`, `Pressable` from react-native.)

For a **nivaan answer** row, reuse `MessageBubble` but pass a "Nivaan" label — simplest: render the answer through `MessageBubble` with `mine={false}` and prefix the body with a label, OR add a small `nivaan` flag to `MessageBubble` that shows a "Nivaan" caption above the text. Keep it minimal — a left-aligned bubble visually marked as Nivaan.

- [ ] **Step 7: Route nivaan rows in the contractor screen**

In `app/(contractor)/owner/chat/[id].tsx`'s `renderItem`, after the `systemNotice` short-circuit and before the events/card branch, add:

```tsx
            const proposal = nivaanProposal(item)
            if (proposal) {
              return (
                <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
                  <NivaanProposalCard
                    view={proposal}
                    onConfirm={() => void thread.sendProposal(proposal.captureType, proposal.fields)}
                    onDismiss={() => {}}
                  />
                </View>
              )
            }
            if (isNivaanAnswer(item)) {
              return (
                <MessageBubble body={item.body} mine={false}
                  timestamp={new Date(item.created_at).toLocaleTimeString()} />
              )
            }
```

Add imports: `import { nivaanProposal, isNivaanAnswer } from '../../../../src/chat/nivaanProposal'` (adjust depth) and `NivaanProposalCard` from `MessageView`.

> The supervisor flagship screen migration onto the kit is a known separate follow-up (see [[in-app-chat-build]]); this task wires the owner crew screen, which is already on the kit. Note it in the PR.

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck && npx jest`
Expected: typecheck clean, full suite green (incl. the 4 new nivaanProposal tests).

```bash
git add src/api/chat.ts src/chat/nivaanProposal.ts src/chat/__tests__/nivaanProposal.test.ts src/chat/MessageView.tsx src/chat/useChatThread.ts "app/(contractor)/owner/chat/[id].tsx"
git commit -m "feat(mobile/chat): render Nivaan answers + proposal cards; Confirm-tap commits via capture fast-path"
```

---

### Task 9: Full verification + PR

- [ ] **Step 1:** Backend (run the FULL ruff — CI gates on it and implementers sometimes miss it): `cd constructo/backend && uv run ruff check . && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest` — all green (the 5 storage-env failures are pre-existing/expected locally; everything else green).
- [ ] **Step 2:** Mobile: `cd constructo/mobile && npm run typecheck && npx jest` — all green.
- [ ] **Step 3:** Use superpowers:finishing-a-development-branch — open PR `feat/chat-nivaan` → `main`. Body summarizes: the structural tiered tool registry (green/commit/money membrane), the numeric guard (no ungrounded digit), `run_nivaan_turn` (deterministic-first answer + abstain), commit-tier + money-tier proposals (evidence-bound or missing_proof; agent never commits), in-thread `@nivaan` invocation (crew rooms only; homeowner room structurally excluded), and the mobile proposal-card + Confirm-tap commit. Call out: no auto-commit, no homeowner-send tool, contested-truth + voice-money gates (foundations) untouched. Watch CI green before merging.

---

## Self-Review

**1. Spec coverage (design §C.2):**
- Invocation explicit only → `parse_nivaan_invocation` (mention/slash) + `nivaan_propose` flag (card button); never speaks unprompted (T4, T7). ✓
- Loop MAX_STEPS≈4, deterministic fast-paths first, abstain-over-invent → reuses `run_turn` (reducers → grounded → clarify; `MAX_STEPS=4` in loop.py); unanswerable → `clarify` with no digits (T4). ✓
- Tiered tool registry (structural) → `app/agent/tiers.py`: only green tools registered + agent-callable; commit/money are proposal builders returning data; no commit callable (T2). ✓
- Commit = propose a card a human taps via the capture endpoints; agent cannot commit → `propose_capture` + `build_proposal` proven to create zero events; Confirm-tap reuses `capture_type`+`fields` fast-path (T5, T8). ✓
- Money = bound evidence else missing_proof; no auto-commit → `propose_money` requires matched/needs_approval reconcile rows; `_build_money_proposal` binds site reconcile; missing → non-committable decision (T6). ✓
- numeric_guard on every drafted string with digits → `numbers_are_grounded` on LLM-authored answers (T4) + proposal summaries (T5). ✓
- No homeowner-send tool (structural membrane) → asserted in T2; `@nivaan` ignored in homeowner room (T7). ✓
- Nivaan replies as `sender_kind=nivaan` rows → `post_agent_message` (T1), serialized in `ChatMessageOut` (T1), broadcast like a human send. ✓

**2. Placeholder scan:** Every code step shows real code. The one forward reference (`_build_money_proposal` used in T5, filled in T6) is explicitly resolved with a working minimal stub in T5 (returns missing_proof) replaced in T6 — both states compile and pass their tests. The two T7/T8 steps that depend on existing code shape ("the existing condition that mints raw", the screen's renderItem) name the exact lines/pattern to AND-guard or insert into, rather than leaving it open.

**3. Type consistency:** `Proposal.as_meta()` emits `{"proposal": {tier, kind, capture_type, fields, summary, evidence_event_ids, committable}}` (T2) — exactly the shape `src/chat/nivaanProposal.ts` reads (T8) and the T7 endpoint test asserts (`out["meta"]["proposal"]["capture_type"]`). `NivaanReply{body, meta}` (T4) is consumed by `post_agent_message(body=…, meta=…)` (T1) in `send_message` (T7). `SenderKind.nivaan` (model enum) → `ChatMessageOut.sender_kind` → mobile `sender_kind:'nivaan'`. `ProposalRequest{capture_type, fields}` (T5) is built from `ChatSendIn.capture_type/fields` (T7). `run_turn(...).tool` values `"aggregate"`/`"grounded_qa"`/`"none"` drive the guard branch (T4) and match loop.py. `reconcile`/`ReconcileItem`/`ReconcileStatus`/`DeliveryEvent`/`InvoiceEvent` (T2/T6) match `app/reconcile/matching.py`. `extract_numeric_tokens` (T3) is the real `app/homeowner/numeric_guard.py` export.

**Known verify-at-execution points (flagged inline):** the exact `RawMessage`-minting condition to AND with `not summons_nivaan` (T7 step 4 — read `router.py:661-687`); whether `router.py` already has a module `logger` (T7 step 4); the contractor theme's exact token names for the proposal card (T8 step 6 — confirm via `constructo-contractor-design`); `FakeEmbeddings`/`index_message` import paths (T4 — confirm against `tests/test_agent_turn.py`).
