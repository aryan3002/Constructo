"""Deterministic costing reducer — the LLM never produces these numbers."""
from decimal import Decimal

from app.specs.costing import line_total, rollup_by_room


def test_line_total_applies_wastage():
    assert line_total(Decimal("10"), Decimal("100"), Decimal("10")) == Decimal("1100.00")


def test_line_total_none_when_incomplete():
    assert line_total(None, Decimal("100"), None) is None
    assert line_total(Decimal("10"), None, None) is None


def test_line_total_no_wastage():
    assert line_total(Decimal("5"), Decimal("200"), None) == Decimal("1000.00")


def test_rollup_groups_by_room_and_counts_excluded():
    lines = [
        {
            "room": "Master Bedroom",
            "qty": Decimal("10"),
            "unit_rate": Decimal("100"),
            "wastage_pct": Decimal("10"),
        },
        {
            "room": "Master Bedroom",
            "qty": Decimal("2"),
            "unit_rate": Decimal("50"),
            "wastage_pct": None,
        },
        {
            "room": "Kitchen",
            "qty": None,
            "unit_rate": Decimal("999"),
            "wastage_pct": None,  # excluded
        },
    ]
    result = rollup_by_room(lines)
    rooms = {r["room"]: r for r in result["rooms"]}
    assert rooms["Master Bedroom"]["total"] == Decimal("1200.00")  # 1100 + 100
    assert rooms["Kitchen"]["total"] == Decimal("0.00")
    assert rooms["Kitchen"]["excluded"] == 1
    assert result["grand_total"] == Decimal("1200.00")
    assert result["excluded_total"] == 1
