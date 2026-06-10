"""Pure, deterministic costing over Spec rows. No I/O, no LLM. Auditable."""
from decimal import Decimal


def line_total(
    qty: Decimal | None, unit_rate: Decimal | None, wastage_pct: Decimal | None
) -> Decimal | None:
    """qty * unit_rate * (1 + wastage%/100), or None if qty/rate missing."""
    if qty is None or unit_rate is None:
        return None
    total = qty * unit_rate
    if wastage_pct is not None:
        total = total * (Decimal(1) + wastage_pct / Decimal(100))
    return total.quantize(Decimal("0.01"))


def rollup_by_room(lines: list[dict]) -> dict:
    """Group {room, qty, unit_rate, wastage_pct} lines into per-room totals.

    Lines missing qty or unit_rate are excluded from the sum and counted, so the
    rollup is honest about what it could not price.
    """
    rooms: dict[str, dict] = {}
    excluded_total = 0
    for ln in lines:
        room = ln["room"]
        bucket = rooms.setdefault(
            room,
            {"room": room, "total": Decimal("0.00"), "lines": 0, "excluded": 0},
        )
        bucket["lines"] += 1
        lt = line_total(ln.get("qty"), ln.get("unit_rate"), ln.get("wastage_pct"))
        if lt is None:
            bucket["excluded"] += 1
            excluded_total += 1
        else:
            bucket["total"] += lt
    grand_total = sum((b["total"] for b in rooms.values()), Decimal("0.00"))
    return {
        "rooms": list(rooms.values()),
        "grand_total": grand_total,
        "excluded_total": excluded_total,
    }
