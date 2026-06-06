"""Entity resolver (2.5 prerequisite) — resolve a free-text counterparty to a
registered Vendor *before* any money flows.

The plan is explicit: build a real entity resolver FIRST — a fragmented
per-counterparty balance is worse than none. Deterministic, network-free: an
exact GSTIN or phone is a strong link; otherwise a prefix-aware token match
proposes a one-tap merge ("same as Ramesh Steel?") or a new vendor. Nothing is
auto-merged on a weak match — a human confirms.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.reconcile.matching import normalize_text

STRONG = 0.8  # >= this → auto-link
WEAK = 0.45  # >= this (and < STRONG) → propose a one-tap merge


@dataclass(frozen=True)
class Candidate:
    id: str
    name: str
    phone: str | None = None
    gstin: str | None = None


@dataclass
class EntityMatch:
    decision: str  # "link" | "confirm" | "create"
    vendor_id: str | None = None
    score: float = 0.0
    reason: str = ""
    candidates: list[dict] = field(default_factory=list)  # top fuzzy options for a merge UI


def _digits(s: str | None) -> str:
    return re.sub(r"\D", "", s or "")[-10:]


def _tokens(name: str | None) -> list[str]:
    return [t for t in normalize_text(name).split() if t]


def _token_match(a: str, b: str) -> bool:
    return a == b or (len(a) >= 4 and len(b) >= 4 and (a.startswith(b[:4]) or b.startswith(a[:4])))


def name_similarity(a: str | None, b: str | None) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    matched = 0
    used: set[int] = set()
    for x in ta:
        for j, y in enumerate(tb):
            if j not in used and _token_match(x, y):
                matched += 1
                used.add(j)
                break
    return matched / max(len(ta), len(tb))


def resolve_vendor(
    name: str | None,
    candidates: list[Candidate],
    *,
    phone: str | None = None,
    gstin: str | None = None,
) -> EntityMatch:
    """Resolve a counterparty against the company's registered vendors."""
    g = (gstin or "").strip().upper()
    if g:
        for c in candidates:
            if (c.gstin or "").strip().upper() == g:
                return EntityMatch(decision="link", vendor_id=c.id, score=1.0, reason="gstin")

    p = _digits(phone)
    if len(p) == 10:
        for c in candidates:
            if _digits(c.phone) == p:
                return EntityMatch(decision="link", vendor_id=c.id, score=0.95, reason="phone")

    scored = sorted(
        ((name_similarity(name, c.name), c) for c in candidates),
        key=lambda sc: sc[0],
        reverse=True,
    )
    top = [
        {"id": c.id, "name": c.name, "score": round(s, 3)}
        for s, c in scored
        if s >= WEAK
    ][:5]
    if scored and scored[0][0] >= STRONG:
        s, c = scored[0]
        return EntityMatch(decision="link", vendor_id=c.id, score=s, reason="name", candidates=top)
    if scored and scored[0][0] >= WEAK:
        s, c = scored[0]
        return EntityMatch(
            decision="confirm", vendor_id=c.id, score=s, reason="name_fuzzy", candidates=top
        )
    return EntityMatch(decision="create", score=0.0, reason="no_match")
