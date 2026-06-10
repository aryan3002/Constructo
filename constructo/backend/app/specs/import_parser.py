"""Pure parser for a Material Specification Schedule sheet.

Maps columns by NORMALIZED HEADER NAME (not position) because real sheets order
Brand/Description differently. No I/O — operates on a list of row-lists.
"""
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


def normalize_header(text: object) -> str:
    """Lowercase, drop punctuation/symbols (incl. ₹, slashes, parens), collapse spaces."""
    s = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", s).strip()


# normalized-header keyword -> ParsedSpecRow field. First matching keyword wins.
_FIELD_BY_KEYWORD: list[tuple[str, str]] = [
    ("location", "room"),
    ("finish element", "element"),
    ("material category", "category"),
    ("description", "name"),
    ("brand", "brand"),
    ("product code", "sku"),
    ("colour", "colour"),
    ("texture", "finish"),
    ("size", "size"),
    ("thickness", "thickness"),
    ("unit of measure", "unit"),
    ("qty required", "qty"),
    ("wastage", "wastage_pct"),
    ("unit rate", "unit_rate"),
    ("approval", "approval_status"),
    ("remarks", "notes"),
]

_APPROVAL_MAP = {"pending approval": "pending", "approved": "approved", "rejected": "rejected"}


@dataclass
class ParsedSpecRow:
    room: str
    element: str | None = None
    category: str | None = None
    name: str | None = None
    brand: str | None = None
    sku: str | None = None
    colour: str | None = None
    finish: str | None = None
    size: str | None = None
    thickness: str | None = None
    unit: str | None = None
    qty: Decimal | None = None
    wastage_pct: Decimal | None = None
    unit_rate: Decimal | None = None
    approval_status: str = "pending"
    notes: str | None = None


_SKIP_ROOM_PREFIXES = ("note:", "grand total", "total")


def _clean(v: object) -> str | None:
    s = str(v).strip() if v is not None else ""
    if s in ("", "—", "-", "NA", "N/A"):
        return None
    return s


def _dec(v: object) -> Decimal | None:
    s = _clean(v)
    if s is None:
        return None
    s = re.sub(r"[,%₹\s]", "", s)
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _find_header(rows: list[list]) -> int | None:
    for i, row in enumerate(rows):
        norms = {normalize_header(c) for c in row}
        if any("location" in n for n in norms) and any("approval" in n for n in norms):
            return i
    return None


def parse_spec_sheet(rows: list[list]) -> list[ParsedSpecRow]:
    """Find the header row, map columns by name, return one ParsedSpecRow per real line."""
    h = _find_header(rows)
    if h is None:
        return []
    col_to_field: dict[int, str] = {}
    for idx, cell in enumerate(rows[h]):
        norm = normalize_header(cell)
        for keyword, field in _FIELD_BY_KEYWORD:
            if keyword in norm:
                col_to_field.setdefault(idx, field)
                break

    out: list[ParsedSpecRow] = []
    for row in rows[h + 1 :]:
        values: dict[str, object] = {}
        for idx, field in col_to_field.items():
            if idx < len(row):
                values[field] = row[idx]
        room = _clean(values.get("room"))
        element = _clean(values.get("element"))
        # A real line needs a room AND (an element or a material/category). Skips blanks,
        # GRAND TOTAL rows (no room), and Note rows (room starts with "Note:" or known sentinel).
        if not room or any(room.lower().startswith(p) for p in _SKIP_ROOM_PREFIXES):
            continue
        if not (element or _clean(values.get("category")) or _clean(values.get("name"))):
            continue
        approval = _APPROVAL_MAP.get(normalize_header(values.get("approval_status")), "pending")
        out.append(
            ParsedSpecRow(
                room=room,
                element=element,
                category=_clean(values.get("category")),
                name=_clean(values.get("name")),
                brand=_clean(values.get("brand")),
                sku=_clean(values.get("sku")),
                colour=_clean(values.get("colour")),
                finish=_clean(values.get("finish")),
                size=_clean(values.get("size")),
                thickness=_clean(values.get("thickness")),
                unit=_clean(values.get("unit")),
                qty=_dec(values.get("qty")),
                wastage_pct=_dec(values.get("wastage_pct")),
                unit_rate=_dec(values.get("unit_rate")),
                approval_status=approval,
                notes=_clean(values.get("notes")),
            )
        )
    return out
