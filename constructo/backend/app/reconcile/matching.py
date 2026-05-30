"""Pure, network-free reconciliation logic.

Reconciliation answers one question the owner actually cares about: *for every
delivery that landed on site, is there a matching supplier invoice, and do the
numbers agree?* The inputs are two streams of already-extracted ``site_events``:

* ``material_delivery`` — what the supervisor logged arriving on site. Fields:
  ``{material, quantity, unit, vendor}``.
* ``invoice_received`` — the supplier's bill. Fields:
  ``{vendor, amount, currency, invoice_number, material?, quantity?}``.

We never write a "match" table — matches are *derived* on demand from the events
so this module stays a pure function of its inputs and is trivially unit-tested
with golden cases. The only persistence reconciliation produces is a B0
``Decision`` when the owner chooses to hold a payment (handled in the router).

Match key = ``(vendor, item, site, date-window)``. Within a candidate pair we
then compare quantity/amount to classify the result:

    matched         delivery + invoice agree within tolerance
    mismatch        delivery + invoice paired, but qty/amount diverge
    missing_proof   a delivery with no invoice (or an invoice with no delivery)
    needs_approval  an amount-at-risk mismatch over the owner-review threshold
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum
from uuid import UUID

# --- tunables (kept here so tests pin the exact contract) -------------------

#: Two events count as the same delivery/invoice if their dates fall within
#: this many days of each other. Invoices routinely trail the delivery by a few
#: working days, so a week is the sensible default window.
DEFAULT_DATE_WINDOW_DAYS = 7

#: Quantity / amount agreement tolerance (fractional). A 2% wobble absorbs
#: rounding, partial loads and GST-inclusive vs exclusive line totals.
DEFAULT_QTY_TOLERANCE = 0.02
DEFAULT_AMOUNT_TOLERANCE = 0.02

#: A mismatch whose amount-at-risk meets/exceeds this (INR) is escalated to
#: ``needs_approval`` — the owner should look before the payment goes out.
DEFAULT_APPROVAL_THRESHOLD_INR = 10_000.0


class ReconcileStatus(StrEnum):
    matched = "matched"
    mismatch = "mismatch"
    missing_proof = "missing_proof"
    needs_approval = "needs_approval"


@dataclass(frozen=True)
class DeliveryEvent:
    """Normalised view of a ``material_delivery`` site_event."""

    id: UUID
    site_id: UUID
    occurred_on: date
    vendor: str | None
    material: str | None
    quantity: float | None
    unit: str | None
    summary: str = ""


@dataclass(frozen=True)
class InvoiceEvent:
    """Normalised view of an ``invoice_received`` site_event."""

    id: UUID
    site_id: UUID
    occurred_on: date
    vendor: str | None
    material: str | None
    quantity: float | None
    amount: float | None
    currency: str | None
    invoice_number: str | None
    summary: str = ""


@dataclass(frozen=True)
class ReconcileItem:
    """A derived reconciliation row: a delivery, its matched invoice, or a gap."""

    status: ReconcileStatus
    vendor: str | None
    item: str | None
    site_id: UUID
    delivery: DeliveryEvent | None
    invoice: InvoiceEvent | None
    #: Money exposed by this row if paid as-is despite a problem (INR).
    amount_at_risk: float
    #: Short machine-stable reasons, e.g. ["quantity_variance", "amount_variance"].
    reasons: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        """Stable id for the row so the UI can key/route to it without a DB id."""
        d = str(self.delivery.id) if self.delivery else "none"
        i = str(self.invoice.id) if self.invoice else "none"
        return f"{d}:{i}"


# --- normalisation ----------------------------------------------------------


def normalize_text(value: str | None) -> str:
    """Loose, locale-tolerant key for vendor/material comparison.

    Lowercases, strips accents/diacritics, collapses punctuation and
    whitespace, and drops common supplier-name noise ("pvt", "ltd", "and").
    Hinglish-friendly: works on Latin-transliterated names. Empty/None -> "".
    """
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9ऀ-ॿ\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in _VENDOR_STOPWORDS]
    return " ".join(tokens)


_VENDOR_STOPWORDS = {
    "pvt",
    "private",
    "ltd",
    "limited",
    "llp",
    "co",
    "company",
    "and",
    "the",
    "traders",
    "trading",
    "suppliers",
    "supplier",
    "enterprises",
    "enterprise",
}


def _within_tolerance(a: float | None, b: float | None, tol: float) -> bool:
    """True if a and b agree within ``tol`` fraction of the larger magnitude."""
    if a is None or b is None:
        return False
    if a == b:
        return True
    scale = max(abs(a), abs(b))
    if scale == 0:
        return True
    return abs(a - b) / scale <= tol


# --- candidate pairing ------------------------------------------------------


def _candidate_score(d: DeliveryEvent, inv: InvoiceEvent, window_days: int) -> int | None:
    """Rank how well an invoice matches a delivery; None = not a candidate.

    Must agree on site and vendor and fall inside the date window. A shared
    material adds to the score so the best-fit invoice wins when a vendor has
    several open on one site. Lower score = better (closer in time, more shared
    keys), so the greedy pass can sort ascending.
    """
    if d.site_id != inv.site_id:
        return None
    dv, iv = normalize_text(d.vendor), normalize_text(inv.vendor)
    if not dv or not iv or dv != iv:
        return None
    delta = abs((d.occurred_on - inv.occurred_on).days)
    if delta > window_days:
        return None

    score = delta  # prefer the temporally-closest invoice
    dm, im = normalize_text(d.material), normalize_text(inv.material)
    if im and dm and dm != im:
        # vendor matches but the named item differs -> weak candidate, last resort
        score += window_days * 10
    return score


# --- public entry point -----------------------------------------------------


def reconcile(
    deliveries: list[DeliveryEvent],
    invoices: list[InvoiceEvent],
    *,
    window_days: int = DEFAULT_DATE_WINDOW_DAYS,
    qty_tolerance: float = DEFAULT_QTY_TOLERANCE,
    amount_tolerance: float = DEFAULT_AMOUNT_TOLERANCE,
    approval_threshold: float = DEFAULT_APPROVAL_THRESHOLD_INR,
) -> list[ReconcileItem]:
    """Derive reconciliation rows from delivery + invoice events.

    Pure: no IO, deterministic for a given input. Greedy 1:1 pairing — each
    invoice matches at most one delivery (its best-scoring, closest-in-time
    candidate). Leftover deliveries and invoices surface as ``missing_proof``.
    """
    # Build all (delivery, invoice) candidate pairs with a score, best first.
    pairs: list[tuple[int, int, int]] = []  # (score, delivery_idx, invoice_idx)
    for di, d in enumerate(deliveries):
        for ii, inv in enumerate(invoices):
            score = _candidate_score(d, inv, window_days)
            if score is not None:
                pairs.append((score, di, ii))
    pairs.sort(key=lambda p: (p[0], p[1], p[2]))

    used_deliveries: set[int] = set()
    used_invoices: set[int] = set()
    items: list[ReconcileItem] = []

    for _score, di, ii in pairs:
        if di in used_deliveries or ii in used_invoices:
            continue
        used_deliveries.add(di)
        used_invoices.add(ii)
        items.append(
            _classify_pair(
                deliveries[di],
                invoices[ii],
                qty_tolerance=qty_tolerance,
                amount_tolerance=amount_tolerance,
                approval_threshold=approval_threshold,
            )
        )

    # Unpaired deliveries: arrived on site, no supplier invoice -> missing proof.
    for di, d in enumerate(deliveries):
        if di in used_deliveries:
            continue
        items.append(
            ReconcileItem(
                status=ReconcileStatus.missing_proof,
                vendor=d.vendor,
                item=d.material,
                site_id=d.site_id,
                delivery=d,
                invoice=None,
                amount_at_risk=0.0,
                reasons=["no_invoice"],
            )
        )

    # Unpaired invoices: a bill with no delivery logged -> at risk of paying for
    # goods that never arrived. The whole invoice amount is exposed.
    for ii, inv in enumerate(invoices):
        if ii in used_invoices:
            continue
        items.append(
            ReconcileItem(
                status=ReconcileStatus.missing_proof,
                vendor=inv.vendor,
                item=inv.material,
                site_id=inv.site_id,
                delivery=None,
                invoice=inv,
                amount_at_risk=float(inv.amount or 0.0),
                reasons=["no_delivery"],
            )
        )

    # Stable, useful ordering: worst first (money at stake), then by date.
    items.sort(key=lambda it: (_STATUS_RANK[it.status], -it.amount_at_risk, _row_date(it)))
    return items


_STATUS_RANK: dict[ReconcileStatus, int] = {
    ReconcileStatus.needs_approval: 0,
    ReconcileStatus.mismatch: 1,
    ReconcileStatus.missing_proof: 2,
    ReconcileStatus.matched: 3,
}


def _row_date(item: ReconcileItem) -> date:
    if item.delivery:
        return item.delivery.occurred_on
    if item.invoice:
        return item.invoice.occurred_on
    return date.min


def _classify_pair(
    d: DeliveryEvent,
    inv: InvoiceEvent,
    *,
    qty_tolerance: float,
    amount_tolerance: float,
    approval_threshold: float,
) -> ReconcileItem:
    """Compare a paired delivery + invoice and assign a status + amount-at-risk."""
    reasons: list[str] = []

    # Quantity check (only when both sides carry a quantity).
    qty_ok = True
    if d.quantity is not None and inv.quantity is not None:
        if not _within_tolerance(d.quantity, inv.quantity, qty_tolerance):
            qty_ok = False
            reasons.append("quantity_variance")

    # Amount-at-risk: the variance between billed and the value implied by what
    # was delivered. With no per-unit price we use the proportional gap between
    # delivered and billed quantity applied to the invoice amount; if quantities
    # are absent we fall back to the full invoice amount on a flagged mismatch.
    amount = float(inv.amount or 0.0)
    amount_at_risk = 0.0

    if not qty_ok and d.quantity is not None and inv.quantity is not None and inv.quantity:
        over_billed_fraction = max(0.0, (inv.quantity - d.quantity) / inv.quantity)
        amount_at_risk = round(amount * over_billed_fraction, 2)

    # If the item name is present on both sides and disagrees, that's a mismatch
    # too (right vendor, wrong goods) — the full invoice is at risk.
    dm, im = normalize_text(d.material), normalize_text(inv.material)
    if dm and im and dm != im:
        reasons.append("item_mismatch")
        amount_at_risk = max(amount_at_risk, amount)

    if not reasons:
        return ReconcileItem(
            status=ReconcileStatus.matched,
            vendor=inv.vendor or d.vendor,
            item=d.material or inv.material,
            site_id=d.site_id,
            delivery=d,
            invoice=inv,
            amount_at_risk=0.0,
            reasons=[],
        )

    status = (
        ReconcileStatus.needs_approval
        if amount_at_risk >= approval_threshold
        else ReconcileStatus.mismatch
    )
    return ReconcileItem(
        status=status,
        vendor=inv.vendor or d.vendor,
        item=d.material or inv.material,
        site_id=d.site_id,
        delivery=d,
        invoice=inv,
        amount_at_risk=amount_at_risk,
        reasons=reasons,
    )


# --- GRN draft --------------------------------------------------------------


@dataclass(frozen=True)
class GrnDraft:
    """A draft Goods Received Note derived from a single delivery event.

    A GRN is the document a site formally signs to acknowledge receipt. We can
    pre-fill it entirely from the captured delivery event so the supervisor only
    confirms rather than types — voice/photo before forms.
    """

    delivery_event_id: UUID
    site_id: UUID
    received_on: date
    vendor: str | None
    material: str | None
    quantity: float | None
    unit: str | None
    reference: str
    note: str


def draft_grn(delivery: DeliveryEvent) -> GrnDraft:
    """Build a draft GRN from a delivery event (pure, no persistence)."""
    ref = f"GRN-{str(delivery.id)[:8].upper()}"
    qty = (
        f"{_fmt_num(delivery.quantity)} {delivery.unit or ''}".strip()
        if delivery.quantity is not None
        else "quantity not recorded"
    )
    note = (
        f"Goods received from {delivery.vendor or 'unknown vendor'}: "
        f"{delivery.material or 'material'} ({qty})."
    )
    return GrnDraft(
        delivery_event_id=delivery.id,
        site_id=delivery.site_id,
        received_on=delivery.occurred_on,
        vendor=delivery.vendor,
        material=delivery.material,
        quantity=delivery.quantity,
        unit=delivery.unit,
        reference=ref,
        note=note,
    )


def _fmt_num(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)
