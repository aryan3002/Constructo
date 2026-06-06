"""Tamper-Evident Trail + Dispute Packs (Phase 3.6) — the exportable case file.

Behind every money event sits an append-only record; this assembles a cited,
**hash-chained** bundle for a counterparty's advance-adjustment case (the v1
scope). Each record's hash folds in the previous hash, so any later edit to an
earlier record breaks every hash downstream — externally checkable by re-running
the same chain. The bundle carries a neutral plain-language narrative and a head
hash anyone can attest against.

Honest framing (load-bearing, not decoration): this is an **internal tamper-
evident record, NOT legal evidence** — the watermark says so. **Ask-the-pack**
answers only from the chained records, deterministically (the money math is
``compute_settlement``), and abstains otherwise — never inventing a fact.

Pure module (no DB, no network) → fully testable; the router feeds it rows it
pulled with the usual scope.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

WATERMARK = "Internal tamper-evident record — NOT legal evidence."
_ZERO_HASH = "0" * 64


def _canonical(record: dict) -> str:
    """Stable serialization so the same record always hashes identically."""
    return json.dumps(record, sort_keys=True, separators=(",", ":"), default=str)


def hash_chain(records: list[dict]) -> tuple[list[dict], str]:
    """Return ``(chained, head_hash)``. Each record gains ``_prev`` and ``_hash``;
    ``_hash = sha256(prev_hash + canonical(record))``. The head hash is the last
    link (or the zero hash for an empty pack)."""
    prev = _ZERO_HASH
    chained: list[dict] = []
    for r in records:
        h = hashlib.sha256((prev + _canonical(r)).encode("utf-8")).hexdigest()
        chained.append({**r, "_prev": prev, "_hash": h})
        prev = h
    return chained, prev


def verify_chain(chained: list[dict]) -> bool:
    """True if every link rehashes to its stored ``_hash`` (tamper check)."""
    prev = _ZERO_HASH
    for link in chained:
        base = {k: v for k, v in link.items() if k not in ("_prev", "_hash")}
        h = hashlib.sha256((prev + _canonical(base)).encode("utf-8")).hexdigest()
        if link.get("_prev") != prev or link.get("_hash") != h:
            return False
        prev = h
    return True


@dataclass
class PackAnswer:
    answerable: bool
    answer: str


def answer_pack(question: str, settlement) -> PackAnswer:
    """Deterministic Ask-the-pack over the money facts. ``settlement`` is a
    :class:`app.payments.advance.SettlementBalance`. Abstains off-topic."""
    q = (question or "").lower()
    cp = settlement.counterparty
    if any(w in q for w in ("unadjust", "advance", "outstanding", "बचा", "अग्रिम")):
        return PackAnswer(
            True,
            f"{cp} has ₹{settlement.unadjusted_advance:,.0f} unadjusted advance "
            f"(paid ₹{settlement.paid_out:,.0f}, invoiced ₹{settlement.invoiced:,.0f}).",
        )
    if any(w in q for w in ("paid", "pay", "दिया", "भुगतान")):
        return PackAnswer(True, f"₹{settlement.paid_out:,.0f} paid to {cp} in this pack.")
    if any(w in q for w in ("invoic", "bill", "बिल")):
        return PackAnswer(True, f"₹{settlement.invoiced:,.0f} invoiced by {cp} in this pack.")
    return PackAnswer(
        False, "I can only answer from this pack's records — that isn't in it."
    )
