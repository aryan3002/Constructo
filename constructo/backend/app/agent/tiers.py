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


def green_tool(
    name: str,
) -> Callable[[Callable[..., Awaitable[object]]], Callable[..., Awaitable[object]]]:
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
