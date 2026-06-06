"""Advance Ledger + Advance Guard (2.5 Layer 2) — deterministic settlement math.

An "advance" is money paid to a counterparty ahead of (or beyond) what they've
billed. Modelled as a per-counterparty liability drawn down against later
invoices: ``unadjusted = paid_out − invoiced`` (floored at 0). Advance Guard
warns before a fresh payment when an unadjusted advance is already sitting there
— "Sharma still has ₹1.4L unadjusted; adjust against this bill instead of paying
fresh?" Pure: the numbers are computed here, never by a model.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.reconcile.matching import normalize_text

# Default ₹ above which an unadjusted advance trips the guard.
DEFAULT_ADVANCE_GUARD_INR = Decimal("10000")


@dataclass
class CounterpartyPayment:
    counterparty: str
    amount: Decimal


@dataclass
class CounterpartyInvoice:
    vendor: str | None
    amount: Decimal


@dataclass
class SettlementBalance:
    counterparty: str
    paid_out: Decimal
    invoiced: Decimal
    unadjusted_advance: Decimal  # >= 0; money paid beyond what's been billed
    warn: bool
    message: str


def compute_settlement(
    counterparty: str,
    payments: list[CounterpartyPayment],
    invoices: list[CounterpartyInvoice],
    *,
    guard_threshold: Decimal = DEFAULT_ADVANCE_GUARD_INR,
) -> SettlementBalance:
    """Net a counterparty's paid-out vs invoiced, matched by normalised name."""
    key = normalize_text(counterparty)
    paid = sum((p.amount for p in payments if normalize_text(p.counterparty) == key), Decimal(0))
    invoiced = sum((i.amount for i in invoices if normalize_text(i.vendor) == key), Decimal(0))
    unadjusted = max(Decimal(0), paid - invoiced)
    warn = unadjusted >= guard_threshold
    if warn:
        message = (
            f"{counterparty} has ₹{unadjusted:,.0f} unadjusted advance — "
            f"adjust against a bill instead of paying fresh?"
        )
    elif unadjusted > 0:
        message = f"{counterparty}: ₹{unadjusted:,.0f} advance outstanding."
    else:
        message = f"{counterparty}: fully adjusted."
    return SettlementBalance(
        counterparty=counterparty,
        paid_out=paid,
        invoiced=invoiced,
        unadjusted_advance=unadjusted,
        warn=warn,
        message=message,
    )
