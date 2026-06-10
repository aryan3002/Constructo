"""Pure parser: Material Specification Schedule sheet rows -> ParsedSpecRow."""
from decimal import Decimal

from app.specs.import_parser import normalize_header, parse_spec_sheet

HEADER = [
    "Item / No.", "Location / Room", "Finish / Element", "Material / Category",
    "Material / Short Code", "Material / Description / Trade Name", "Brand / Manufacturer",
    "Product / Code / SKU", "Colour / Shade Ref", "Texture / Finish Type",
    "Size / Dimension", "Thickness (mm)", "Unit of Measure", "Qty Required",
    "Wastage %", "Qty Ordered", "Unit Rate (₹ / Unit)", "Total Cost (₹)",
    "Approval Status", "Remarks / Notes",
]
ROW = [
    "01", "Living Room", "Floor", "Vitrified Tile", "", "Polished Vitrified Tile 800x800",
    "Kajaria", "ETW-8080", "Ivory Beige", "Matt", "800x800 mm", "9", "Sq Ft",
    "450.0", "10.0", "495.0", "", "", "Pending Approval", "",
]


def test_normalize_header_collapses_noise():
    assert normalize_header("Unit Rate / (₹ / Unit)") == "unit rate unit"
    assert (
        normalize_header("Material / Description / Trade Name")
        == "material description trade name"
    )


def test_parse_maps_by_header_name():
    rows = [["INTERIOR FINISHING MATERIAL SPECIFICATION SCHEDULE"], ["Project: ___"], HEADER, ROW]
    parsed = parse_spec_sheet(rows)
    assert len(parsed) == 1
    p = parsed[0]
    assert p.room == "Living Room"
    assert p.element == "Floor"
    assert p.category == "Vitrified Tile"
    assert p.brand == "Kajaria"
    assert p.sku == "ETW-8080"
    assert p.colour == "Ivory Beige"
    assert p.qty == Decimal("450.0")
    assert p.wastage_pct == Decimal("10.0")
    assert p.unit_rate is None  # empty cell -> None (honestly unpriced)
    assert p.unit == "Sq Ft"
    assert p.approval_status == "pending"


def test_parse_skips_blank_grandtotal_and_note_rows():
    rows = [
        HEADER,
        ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],  # blank
        ["GRAND TOTAL (₹)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "0.0"],  # noqa: E501
        ["", "Note:", "All shower partitions to be sliders"],  # note row (no element/material)
        ROW,
    ]
    parsed = parse_spec_sheet(rows)
    assert [p.room for p in parsed] == ["Living Room"]
